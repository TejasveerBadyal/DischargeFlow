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

test('appointment requests enforce admission access, manual confirmation and exact clinician slot conflicts',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local'),patient=await login('patient@demo.local');
 const preferred=new Date(Date.now()+86400000).toISOString();const body={department:'General medicine',hospital_id:1,doctor_id:1,preferred_at:preferred,note:'Fictional morning preference',case_id:'DF-105'};
 assert.equal((await request('/api/appointments',staff,body)).status,403);
 assert.equal((await request('/api/appointments',family,{...body,preferred_at:'invalid'})).status,400);
 assert.equal((await request('/api/appointments',family,body)).status,201);
 assert.equal((await request('/api/appointments',family,body)).status,409);
 let rows=(await(await request('/api/appointments',family)).json()).appointments;assert.equal(rows.length,1);assert.equal(rows[0].case_id,'DF-104');
 assert.equal((await(await request('/api/appointments',patient)).json()).appointments.length,0);
 const a=rows[0],confirmation={action:'confirm',expected_updated_at:a.updated_at,confirmed_at:preferred,clinician:'Fictional clinician',location:'Clinic A',availability_confirmed:true,staff_note:'Bring the hospital-issued appointment reference.'};
 assert.equal((await request('/api/appointments/'+a.id,patient,confirmation)).status,404);
 assert.equal((await request('/api/appointments/'+a.id,family,confirmation)).status,403);
 assert.equal((await request('/api/appointments/'+a.id,staff,{...confirmation,availability_confirmed:false})).status,400);
 assert.equal((await request('/api/appointments/'+a.id,staff,confirmation)).status,200);
 assert.equal((await request('/api/appointments/'+a.id,staff,confirmation)).status,409);
 assert.equal((await request('/api/appointments',patient,body)).status,201);
 const other=(await(await request('/api/appointments',patient)).json()).appointments[0];
 assert.equal((await request('/api/appointments/'+other.id,staff,{...confirmation,expected_updated_at:other.updated_at})).status,409);
 const confirmed=(await(await request('/api/appointments',family)).json()).appointments[0];
 assert.equal((await request('/api/appointments/'+a.id,family,{action:'cancel',expected_updated_at:confirmed.updated_at})).status,200);
 assert.equal((await request('/api/appointments/'+other.id,staff,{...confirmation,expected_updated_at:other.updated_at})).status,200);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM audit WHERE event LIKE 'appointment_%'").get().n,3);
 assert.equal((await request('/coordinator/appointments',staff)).status,200);assert.equal((await request('/coordinator/appointments',family)).status,403);
 }finally{sql.close();}
});
test('appointment decline needs a reason and closed requests cannot be reopened',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local');
 await request('/api/appointments',family,{department:'Cardiology',hospital_id:1,doctor_id:2,preferred_at:new Date(Date.now()+172800000).toISOString(),note:''});
 const a=(await(await request('/api/appointments',family)).json()).appointments[0];const body={action:'decline',expected_updated_at:a.updated_at};
 assert.equal((await request('/api/appointments/'+a.id,staff,body)).status,400);
 assert.equal((await request('/api/appointments/'+a.id,staff,{...body,staff_note:'Fictional clinic unavailable. Please request another date.'})).status,200);
 const closed=(await(await request('/api/appointments',family)).json()).appointments[0];assert.equal(closed.status,'declined');
 assert.equal((await request('/api/appointments/'+a.id,family,{action:'cancel',expected_updated_at:closed.updated_at})).status,409);
 }finally{sql.close();}
});
test('personal preparation stays linked to its admission and never completes clinical workflow tasks',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local'),patient=await login('patient@demo.local');
 assert.equal((await request('/api/preparation',staff)).status,403);
 const before=sql.prepare('SELECT * FROM tasks ORDER BY case_id,position').all();
 assert.equal((await request('/api/preparation',family,{key:'belongings',done:true,case_id:'DF-105'})).status,200);
 const a=await(await request('/api/preparation',family)).json(),b=await(await request('/api/preparation',patient)).json();
 assert.equal(a.items[0].done,true);assert.equal(b.items[0].done,false);assert.deepEqual(sql.prepare('SELECT * FROM tasks ORDER BY case_id,position').all(),before);
 assert.equal((await request('/api/preparation',family,{key:'authorise_departure',done:true})).status,400);
 assert.equal((await request('/api/preparation',{cookie:family.cookie},{key:'transport',done:true})).status,403);
 }finally{sql.close();}
});
