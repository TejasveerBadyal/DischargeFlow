import {pbkdf2Sync} from 'node:crypto';
import{test}from'node:test';
import assert from'node:assert/strict';
import{DatabaseSync}from'node:sqlite';
import{readFileSync,readdirSync}from'node:fs';
import{handle}from'../app/lib/backend.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){const r=sql.prepare(this.q).run(...this.args);return{meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}}
 const DB={prepare:q=>new S(q),batch:async ss=>{sql.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};const env={DB,ENABLE_SAMPLE_COHORT:'0',BOOTSTRAP_PASSWORD:'Test-coordinator-only-123'};
 const request=(path,auth={},body,extra={})=>handle(new Request('https://app.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-DischargeFlow':'1',Cookie:auth.cookie||'','X-CSRF-Token':auth.csrf||'',...extra},...(body?{body:JSON.stringify(body)}:{})}),env);
 const login=async(email,password=env.BOOTSTRAP_PASSWORD)=>{const res=await request('/api/login',{}, {email,password});const data=await res.json();return{status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0],csrf:data.csrf};};
 return{sql,request,login};
}

test('only platform admin manages directory; patients retain active hospital/doctor options',async()=>{
 const{sql,request,login}=fixture();try{
 await request('/login');sql.prepare("UPDATE users SET password_hash=? WHERE role='admin'").run('test-salt:'+pbkdf2Sync('Test-coordinator-only-123','test-salt',100000,32,'sha256').toString('hex'));
 const staff=await login('admin'),family=await login('family@demo.local'),coordinator=await login('coordinator@demo.local');
 assert.equal((await request('/api/admin/directory',coordinator)).status,403);assert.equal((await request('/coordinator/directory',coordinator)).status,403);
 const directory=await(await request('/api/directory',family)).json();assert.equal(directory.hospitals.length,4);assert.equal(directory.doctors.length,12);
 assert.equal((await request('/api/admin/directory',family)).status,403);
 assert.equal((await request('/coordinator/directory',family)).status,403);assert.equal((await request('/coordinator/directory',staff)).status,200);
 const hospital={name:'Fictional new hospital',city:'Demo district',address:'Fictional site',active:true};assert.equal((await request('/api/admin/hospitals',staff,hospital)).status,201);
 const h=sql.prepare('SELECT * FROM hospitals WHERE name=?').get(hospital.name);
 const doctor={hospital_id:h.id,name:'Fictional new doctor',specialty:'Dermatology',clinic:'Fictional clinic',active:true};assert.equal((await request('/api/admin/doctors',staff,doctor)).status,201);
 const d=sql.prepare('SELECT * FROM doctors WHERE name=?').get(doctor.name);
 assert.equal((await request('/api/appointments',family,{hospital_id:1,doctor_id:d.id,preferred_at:new Date(Date.now()+86400000).toISOString(),note:''})).status,409);
 assert.equal((await request('/api/admin/hospitals/'+h.id,staff,{...hospital,active:false,expected_updated_at:h.updated_at})).status,200);
 assert.equal((await(await request('/api/directory',family)).json()).doctors.some(x=>x.id===d.id),false);
 assert.equal((await request('/api/appointments',family,{hospital_id:h.id,doctor_id:d.id,preferred_at:new Date(Date.now()+86400000).toISOString(),note:''})).status,409);
 assert.equal((await request('/api/admin/hospitals/'+h.id,staff,{...hospital,expected_updated_at:h.updated_at})).status,409);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n,1);
 }finally{sql.close();}
});
test('attendance needs actual staff review after the scheduled time and rescheduling preserves missed history',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local'),other=await login('patient@demo.local');const time=new Date(Date.now()+86400000).toISOString();
 assert.equal((await request('/api/appointments',family,{hospital_id:1,doctor_id:1,preferred_at:time,note:'Fictional visit'})).status,201);
 let a=(await(await request('/api/appointments',family)).json()).appointments[0];
 assert.equal((await request('/api/appointments/'+a.id,staff,{action:'confirm',expected_updated_at:a.updated_at,confirmed_at:time,location:'Clinic 1',availability_confirmed:true})).status,200);
 a=(await(await request('/api/appointments',family)).json()).appointments[0];
 assert.equal((await request('/api/appointments/'+a.id,staff,{action:'missed',expected_updated_at:a.updated_at,attendance_confirmed:true,staff_note:'Verified fictional absence'})).status,400);
 sql.prepare('UPDATE appointment_requests SET confirmed_at=? WHERE id=?').run(new Date(Date.now()-3600000).toISOString(),a.id);
 a=(await(await request('/api/appointments',family)).json()).appointments[0];assert.equal(a.status,'confirmed');assert.equal(a.attendance_review_due,true);assert.equal(a.can_cancel,false);
 assert.equal((await request('/api/appointments/'+a.id,family,{action:'missed',expected_updated_at:a.updated_at,attendance_confirmed:true,staff_note:'forged'})).status,403);
 assert.equal((await request('/api/appointments/'+a.id,staff,{action:'missed',expected_updated_at:a.updated_at,attendance_confirmed:false,staff_note:'unverified'})).status,400);
 assert.equal((await request('/api/appointments/'+a.id,staff,{action:'missed',expected_updated_at:a.updated_at,attendance_confirmed:true,staff_note:'Fictional absence reviewed by staff'})).status,200);
 assert.equal((await request('/api/appointments',other,{hospital_id:1,doctor_id:1,preferred_at:time,note:'forged parent',rescheduled_from:a.id})).status,409);
 assert.equal((await request('/api/appointments',family,{hospital_id:2,doctor_id:4,preferred_at:time,note:'New fictional visit',rescheduled_from:a.id})).status,201);
 const rows=(await(await request('/api/appointments',family)).json()).appointments;assert.equal(rows.length,2);assert.equal(rows.find(x=>x.id===a.id).status,'missed');assert.equal(rows.find(x=>x.id!==a.id).rescheduled_from,a.id);
 const events=(await(await request('/api/appointments/'+a.id+'/history',family)).json()).events;assert.deepEqual(events.map(e=>e.action),['requested','confirmed','missed']);
 assert.equal((await request('/api/appointments/'+a.id+'/history',other)).status,404);
 }finally{sql.close();}
});
test('case history stays admission-scoped and protects internal operational notes',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local');
 sql.prepare("INSERT INTO task_events(case_id,user_id,action,note,occurred_at) VALUES('DF-104',1,'review','Internal staff note',?)").run(new Date().toISOString());
 assert.equal((await request('/api/case-history/DF-105',family)).status,404);
 const own=await(await request('/api/case-history?case_id=DF-105',family)).json();assert.equal(own.case.id,'DF-104');assert.equal(own.kind,'operational_history');assert.ok(!JSON.stringify(own).includes('Internal staff note'));
 const view=await(await request('/api/case-history/DF-104',staff)).json();assert.ok(JSON.stringify(view).includes('Internal staff note'));
 assert.equal((await(await request('/api/case-history',staff)).json()).cases.length,6);
 }finally{sql.close();}
});
test('fictional attendance examples load once and do not invent earlier live actions',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local');
 assert.equal((await request('/api/appointments/examples',family,{})).status,403);
 assert.equal((await(await request('/api/appointments/examples',staff,{})).json()).created,true);
 assert.equal((await(await request('/api/appointments/examples',staff,{})).json()).created,false);
 const rows=(await(await request('/api/appointments',family)).json()).appointments;assert.equal(rows.length,3);assert.equal(rows.filter(a=>a.status==='missed').length,1);assert.equal(rows.filter(a=>a.attendance_review_due).length,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM appointment_events WHERE appointment_id IN(SELECT id FROM appointment_requests WHERE case_id=?)').get('DF-104').n,3);
 }finally{sql.close();}
});
