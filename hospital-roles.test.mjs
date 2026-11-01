import{test}from'node:test';
import assert from'node:assert/strict';
import{DatabaseSync}from'node:sqlite';
import{readFileSync,readdirSync}from'node:fs';
import{pbkdf2Sync}from'node:crypto';
import{handle}from'../app/lib/backend.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){const r=sql.prepare(this.q).run(...this.args);return{meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}}
 const DB={prepare:q=>new S(q),batch:async ss=>{sql.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};const env={DB,ENABLE_SAMPLE_COHORT:'0',BOOTSTRAP_PASSWORD:'Test-coordinator-only-123'};
 const request=(path,auth={},body,extra={})=>handle(new Request('https://app.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-DischargeFlow':'1',Cookie:auth.cookie||'','X-CSRF-Token':auth.csrf||'',...extra},...(body?{body:JSON.stringify(body)}:{})}),env);
 const login=async(email,password=env.BOOTSTRAP_PASSWORD)=>{const res=await request('/api/login',{}, {email,password});const data=await res.json();return{status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0],csrf:data.csrf};};
 return{sql,request,login};
}

async function roleLogin(f,id){await f.request('/login');const email=id+'@dischargeflow.test';f.sql.prepare('UPDATE users SET password_hash=? WHERE email=?').run('test-salt:'+pbkdf2Sync('Test-coordinator-only-123','test-salt',100000,32,'sha256').toString('hex'),email);return f.login(id);}
test('three roles isolate lists, direct case reads, writes, accounts, alerts and simulator by hospital',async()=>{
 const f=fixture(),{sql,request}=f;try{
 const admin=await roleLogin(f,'admin'),staff1=await roleLogin(f,'cedar.staff'),staff2=await roleLogin(f,'harbor.staff'),patient1=await roleLogin(f,'cedar.patient'),patient2=await roleLogin(f,'harbor.patient');
 assert.equal(admin.data.user.role,'admin');assert.equal(staff1.data.user.hospital_id,1);assert.equal(staff2.data.user.hospital_id,2);
 const all=(await(await request('/api/cases',admin)).json()).cases,one=(await(await request('/api/cases',staff1)).json()).cases,two=(await(await request('/api/cases',staff2)).json()).cases;
 assert.ok(all.length>one.length);assert.ok(one.every(c=>c.hospital_id===1));assert.ok(two.every(c=>c.hospital_id===2));assert.ok(!one.some(c=>two.some(d=>d.id===c.id)));
 assert.equal((await request('/admin',staff1)).status,403);assert.equal((await request('/admin',admin)).status,200);assert.equal((await request('/coordinator',patient1)).status,403);assert.equal((await request('/api/admin/overview',staff1)).status,403);
 const overview=await(await request('/api/admin/overview',admin)).json();assert.equal(overview.hospitals.length,4);assert.ok(overview.hospitals.every(h=>h.active_cases>=3&&h.previous_cases>=1));
 for(const suffix of ['/history','/tasks','/insurance-receipt']){const body=suffix==='/history'?undefined:suffix==='/tasks'?{position:3,action:'start',expected_updated_at:one[0].tasks[3].updated_at}:{received_at:new Date().toISOString(),reference:'forged',insurer_name:'forged',receipt_confirmed:true};assert.equal((await request('/api/cases/H2-2026-001'+suffix,staff1,body)).status,404);}
 assert.equal((await request('/api/case-history/H2-2026-001',staff1)).status,404);assert.equal((await request('/api/case-history/H2-2026-001',admin)).status,200);
 assert.equal((await(await request('/api/my-case',patient1)).json()).case.id,'H1-2026-001');assert.equal((await request('/api/case-history/H2-2026-001',patient1)).status,404);
 const accounts=await(await request('/api/accounts',staff1)).json();assert.ok(accounts.accounts.every(a=>!a.case_id.startsWith('H2-')));
 const target=sql.prepare("SELECT id FROM users WHERE email='harbor.patient@dischargeflow.test'").get().id;
 assert.equal((await request('/api/accounts/'+target+'/revoke',staff1,{confirmed:true,reason:'forged'})).status,409);assert.equal((await request('/api/my-case',patient2)).status,200);
 const cfg=await(await request('/api/simulation',staff1)).json();assert.equal(cfg.active_cases,one.filter(c=>c.tasks.some(t=>!['complete','not_applicable'].includes(t.status))).length);
 const alerts=await(await request('/api/insights',staff1)).json();assert.ok(alerts.alerts.every(a=>one.some(c=>c.id===a.case_id)));
 const changed={queue:11,processing:22,hold:33,stale:44,total:55};assert.equal((await request('/api/insights',staff1,{limits:changed})).status,200);assert.equal((await(await request('/api/insights',staff2)).json()).limits.queue,30);
 // A coordinator cannot expand their scope using admin-only headers or submitted hospital fields.
 const forged=await(await request('/api/cases',staff1,undefined,{'X-Hospital-Id':'2'})).json();assert.ok(forged.cases.every(c=>c.hospital_id===1));
 const scoped=await(await request('/api/cases',admin,undefined,{'X-Hospital-Id':'2'})).json();assert.ok(scoped.cases.every(c=>c.hospital_id===2));assert.equal((await request('/api/cases',admin,undefined,{'X-Hospital-Id':'bad'})).status,400);
 const reg={id:'TENANT-NEW',name:'Fictional',ward:'Ward',clinician:'Fictional clinician',pathway:'cash',cleared_at:new Date().toISOString(),confirmed:true,hospital_id:2};assert.equal((await request('/api/cases',staff1,reg)).status,201);assert.equal(sql.prepare('SELECT hospital_id FROM cases WHERE id=?').get(reg.id).hospital_id,1);
 }finally{sql.close();}
});
test('appointments, support and human messages cannot be read or changed across hospital boundaries',async()=>{
 const f=fixture(),{sql,request}=f;try{
 const staff1=await roleLogin(f,'cedar.staff'),staff2=await roleLogin(f,'harbor.staff'),patient2=await roleLogin(f,'harbor.patient'),admin=await roleLogin(f,'admin');
 assert.equal((await request('/api/appointments',patient2,{hospital_id:2,doctor_id:4,preferred_at:new Date(Date.now()+86400000).toISOString(),note:'Fictional visit'})).status,201);
 const a=(await(await request('/api/appointments',patient2)).json()).appointments[0];assert.equal((await(await request('/api/appointments',staff1)).json()).appointments.some(x=>x.id===a.id),false);assert.equal((await(await request('/api/appointments',staff2)).json()).appointments.some(x=>x.id===a.id),true);
 assert.equal((await request('/api/appointments/'+a.id+'/history',staff1)).status,404);assert.equal((await request('/api/appointments/'+a.id,staff1,{action:'cancel',expected_updated_at:a.updated_at})).status,404);
 assert.equal((await request('/api/support',patient2,{category:'billing',issue:'duplicate',description:'Fictional bill query',reference:''})).status,201);
 const t=sql.prepare("SELECT * FROM support_tickets WHERE description='Fictional bill query'").get();assert.equal((await(await request('/api/support',staff1)).json()).tickets.some(x=>x.id===t.id),false);assert.equal((await request('/api/support/'+t.id,staff1)).status,404);assert.equal((await request('/api/support/'+t.id,staff1,{text:'forged',state:'resolved',expected_updated_at:t.updated_at})).status,404);assert.equal((await request('/api/support/'+t.id,admin)).status,200);
 assert.equal((await request('/api/help',patient2,{text:'Fictional question'})).status,201);const thread=sql.prepare('SELECT id FROM help_threads').get();assert.equal((await(await request('/api/help/inbox',staff1)).json()).threads.length,0);assert.equal((await request('/api/help/'+thread.id,staff1)).status,404);assert.equal((await request('/api/help/'+thread.id,staff1,{text:'forged'})).status,404);
 assert.equal((await request('/api/insurance-desk/H2-2026-001',staff1,{action:'contact'})).status,404);
 assert.equal((await request('/api/mock-hospital',staff1,{event_id:'FORGED-EVENT',case_id:'H2-2026-001',event_type:'insurance_complete'})).status,409);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM sample_batches WHERE key=?').get('four-hospital-roles-v1').n,1);await request('/login');assert.equal(sql.prepare("SELECT COUNT(*) n FROM cases WHERE id LIKE 'H_-2026-%'").get().n,16);
 }finally{sql.close();}
});
