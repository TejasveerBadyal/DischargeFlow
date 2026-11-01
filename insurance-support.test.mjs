import{test}from'node:test';
import assert from'node:assert/strict';
import{DatabaseSync}from'node:sqlite';
import{readFileSync,readdirSync}from'node:fs';
import{handle}from'../app/lib/backend.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){const r=sql.prepare(this.q).run(...this.args);return{meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}}
 const DB={prepare:q=>new S(q),batch:async ss=>{sql.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};const env={DB,ENABLE_SAMPLE_COHORT:'1',BOOTSTRAP_PASSWORD:'Test-coordinator-only-123'};
 const request=(path,auth={},body,extra={})=>handle(new Request('https://app.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-DischargeFlow':'1',Cookie:auth.cookie||'','X-CSRF-Token':auth.csrf||'',...extra},...(body?{body:JSON.stringify(body)}:{})}),env);
 const login=async(email,password=env.BOOTSTRAP_PASSWORD)=>{const res=await request('/api/login',{}, {email,password});const data=await res.json();return{status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0],csrf:data.csrf};};
 return{sql,request,login};
}

test('insurance investigation requires a verified cause, preserves receipt clock and keeps staff contacts private',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local');await request('/api/cases',staff);
 const id='IPD-2026-100201';const receipt=sql.prepare('SELECT received_at FROM insurance_receipts WHERE case_id=?').get(id).received_at;
 const body={action:'workflow',stage:'query_received',delay_reason:'documents',cause_verified:true,evidence_reference:'QUERY-FICTIONAL-1',owner:'Insurance desk',next_followup_at:new Date(Date.now()+3600000).toISOString(),public_update:'The desk is checking a fictional missing document.',expected_updated_at:null};
 assert.equal((await request('/api/insurance-desk',family)).status,403);
 assert.equal((await request('/api/insurance-desk/'+id,family,body)).status,403);
 assert.equal((await request('/api/insurance-desk/'+id,staff,{...body,cause_verified:false})).status,400);
 assert.equal((await request('/api/insurance-desk/'+id,staff,body)).status,200);
 assert.equal((await request('/api/insurance-desk/'+id,staff,body)).status,409);
 assert.equal(sql.prepare('SELECT received_at FROM insurance_receipts WHERE case_id=?').get(id).received_at,receipt);
 const w=sql.prepare('SELECT * FROM insurance_workflows WHERE case_id=?').get(id);
 assert.equal((await request('/api/insurance-desk/'+id,staff,{...body,stage:'approved',expected_updated_at:w.updated_at,next_followup_at:null})).status,409);
 const contact={action:'contact',channel:'phone',contact_party:'Fictional insurer desk',reference:'CALL-TEST',outcome:'response_received',note:'Staff-only test note',actual_contact_confirmed:true};
 assert.equal((await request('/api/insurance-desk/'+id,staff,{...contact,actual_contact_confirmed:false})).status,400);
 assert.equal((await request('/api/insurance-desk/'+id,staff,contact)).status,201);
 sql.prepare('UPDATE access SET case_id=? WHERE user_id=2').run(id);
 const patient=await(await request('/api/my-insurance',family)).json();assert.equal(patient.workflow.cause_verified,true);assert.ok(!JSON.stringify(patient).includes('Staff-only'));
 sql.prepare('UPDATE insurance_workflows SET next_followup_at=? WHERE case_id=?').run(new Date(Date.now()-60000).toISOString(),id);
 const insights=await(await request('/api/insights',staff)).json();assert.ok(insights.alerts.some(a=>a.type==='insurance_followup_due'&&a.case_id===id));
 }finally{sql.close();}
});
test('billing tickets have categories, admission ownership, replies and staff-controlled resolution',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local'),family=await login('family@demo.local'),patient=await login('patient@demo.local');
 const body={category:'billing',issue:'duplicate',description:'Please check fictional duplicate line 4.',reference:'BILL-TEST',case_id:'DF-105'};
 assert.equal((await request('/api/support',staff,body)).status,403);assert.equal((await request('/api/support',family,{...body,category:'__proto__'})).status,400);
 assert.equal((await request('/api/support',family,body)).status,201);
 const rows=(await(await request('/api/support',family)).json()).tickets;assert.equal(rows.length,1);assert.equal(rows[0].case_id,'DF-104');assert.equal(rows[0].owner,'Billing desk');
 const id=rows[0].id;assert.equal((await request('/api/support/'+id,patient)).status,404);
 assert.equal((await(await request('/api/support',patient)).json()).tickets.length,0);
 assert.equal((await request('/api/support/'+id,family,{text:'Additional fictional reference',state:'resolved',expected_updated_at:rows[0].updated_at})).status,200);
 let t=(await(await request('/api/support/'+id,staff)).json()).ticket;assert.equal(t.state,'open');
 assert.equal((await request('/api/support/'+id,staff,{text:'Billing team is reviewing the line.',state:'awaiting_billing',owner:'Billing supervisor',expected_updated_at:t.updated_at})).status,200);
 t=(await(await request('/api/support/'+id,staff)).json()).ticket;
 assert.equal((await request('/api/support/'+id,staff,{text:'Fictional review complete. No actual refund or payment was processed.',state:'resolved',owner:'Billing supervisor',expected_updated_at:t.updated_at})).status,200);
 const view=await(await request('/api/support/'+id,family)).json();assert.equal(view.ticket.state,'resolved');assert.equal(view.replies.length,3);
 assert.equal((await request('/api/support/'+id,family,{text:'reopen',expected_updated_at:view.ticket.updated_at})).status,409);
 }finally{sql.close();}
});
