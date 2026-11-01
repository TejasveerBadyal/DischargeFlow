import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handle} from '../app/lib/backend.js';
import {insuranceStatus} from '../app/lib/insurance.js';
import {simulate,DEFAULT_MODEL} from '../app/lib/model.js';
const clock=Date.parse('2026-10-31T10:00:00Z');
const c={pathway:'insured'};
const receipt={received_at:new Date(clock-180*60000).toISOString(),reference:'ACK-TEST',insurer_name:'Fictional insurer',recorded_at:new Date(clock).toISOString()};
test('receipt timer uses insurer receipt, strict three-hour boundary, and stops at authorisation',()=>{
 const tasks=[{position:3,status:'pending'}];
 assert.equal(insuranceStatus(c,tasks,null,clock).status,'unverified');
 assert.equal(insuranceStatus({pathway:'cash'},tasks,receipt,clock).status,'not_applicable');
 assert.equal(insuranceStatus(c,tasks,receipt,clock).notify,false);
 assert.equal(insuranceStatus(c,tasks,receipt,clock+1).notify,true);
 assert.equal(insuranceStatus({...c,cleared_at:'2020-01-01'},tasks,{...receipt,received_at:new Date(clock-60000).toISOString()},clock).notify,false);
 const authorised=[{position:3,status:'complete',updated_at:new Date(clock-60000).toISOString()}];
 assert.equal(insuranceStatus(c,authorised,receipt,clock+9999999).status,'approved_on_time');
 assert.equal(insuranceStatus(c,[{position:3,status:'complete',updated_at:new Date(clock+60000).toISOString()}],receipt,clock+9999999).status,'approved_late');
 assert.equal(insuranceStatus(c,[{position:3,status:'on_hold'}],receipt,clock+1).notify,true);
});
test('already received insurer requests consume external waiting, independent of internal desk capacity',()=>{
 const cases=[{id:'TEST',cleared_at:'2026-10-31',insurance:{phase:'awaiting_insurer'},tasks:['complete','complete','complete','pending','pending'].map((status,position)=>({status,position}))}];
 const a=simulate(cases,DEFAULT_MODEL),b=simulate(cases,{...DEFAULT_MODEL,capacity:[1,1,1,4,1]});
 assert.equal(a.cases[0].remaining_minutes,DEFAULT_MODEL.insurer_minutes+DEFAULT_MODEL.minutes[4]);
 assert.deepEqual(a,b);assert.equal(a.queues[3].max_concurrent,0);
});
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){const r=sql.prepare(this.q).run(...this.args);return{meta:{changes:r.changes}};}}
 const DB={prepare:q=>new S(q),batch:async ss=>{sql.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};const env={DB,BOOTSTRAP_PASSWORD:'Fictional-only-test-password-36'};
 const request=(path,auth={},body)=>handle(new Request('https://app.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-DischargeFlow':'1',Cookie:auth.cookie||'','X-CSRF-Token':auth.csrf||''},...(body?{body:JSON.stringify(body)}:{})}),env);
 const login=async email=>{const r=await request('/api/login',{}, {email,password:env.BOOTSTRAP_PASSWORD});const j=await r.json();return{status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],csrf:j.csrf};};
 return{sql,request,login};
}
test('30 sample admissions seed once, preserve old accounts, expose safe aliases and simulate the larger cohort',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local');const before=sql.prepare('SELECT password_hash FROM users ORDER BY id').all();
 const first=await(await request('/api/cases',staff)).json();assert.equal(first.cases.length,12);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM cases').get().n,48);assert.equal(sql.prepare('SELECT COUNT(*) n FROM departures').get().n,9);
 await request('/api/cases',staff);assert.equal(sql.prepare('SELECT COUNT(*) n FROM cases').get().n,48);assert.equal(sql.prepare("SELECT COUNT(*) n FROM task_events WHERE action='fictional_sample_created'").get().n,46);
 assert.deepEqual(sql.prepare('SELECT password_hash FROM users ORDER BY id').all(),before);
 for(const id of ['STAFF-000001','REL-000002','PAT-000003','coordinator@dischargeflow.test'])assert.equal((await login(id)).status,200);
 const family=await login('REL-000002');assert.equal((await request('/api/cases',family)).status,403);assert.equal((await(await request('/api/my-case',family)).json()).case.id,'DF-104');
 assert.equal(first.cases.filter(c=>c.insurance.notify&&c.insurance.phase==='awaiting_insurer').length,3);
 const config=await(await request('/api/simulation',staff)).json();const r=await request('/api/simulation',staff,{baseline:config.defaults,stage:2,proposed_capacity:Math.max(2,config.in_progress[2])});assert.equal(r.status,200);assert.equal((await r.json()).count,12);
 }finally{sql.close();}
});
test('verified receipt endpoint checks pathway, prerequisites, permissions and correction history',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local');await request('/api/cases',staff);
 const body={received_at:new Date(Date.now()-200*60000).toISOString(),reference:'ACK-CORRECTED',insurer_name:'Fictional insurer',receipt_confirmed:true};
 assert.equal((await request('/api/cases/IPD-2026-100201/insurance-receipt',family,body)).status,403);
 assert.equal((await request('/api/cases/DF-105/insurance-receipt',staff,body)).status,409);
 assert.equal((await request('/api/cases/DF-104/insurance-receipt',staff,body)).status,409);
 assert.equal((await request('/api/cases/IPD-2026-100201/insurance-receipt',staff,body)).status,409);
 const prior=sql.prepare('SELECT * FROM insurance_receipts WHERE case_id=?').get('IPD-2026-100201');
 const corrected={...body,expected_recorded_at:prior.recorded_at,correction_reason:'Corrected fictional acknowledgement transcription'};
 assert.equal((await request('/api/cases/IPD-2026-100201/insurance-receipt',staff,{...corrected,receipt_confirmed:false})).status,400);
 assert.equal((await request('/api/cases/IPD-2026-100201/insurance-receipt',staff,{...corrected,received_at:new Date(Date.now()+10000).toISOString()})).status,400);
 assert.equal((await request('/api/cases/IPD-2026-100201/insurance-receipt',staff,corrected)).status,200);
 assert.equal((await request('/api/cases/IPD-2026-100201/insurance-receipt',staff,corrected)).status,409);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM task_events WHERE action='insurance_receipt_corrected'").get().n,1);
 }finally{sql.close();}
});
