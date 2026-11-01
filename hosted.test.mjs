import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handle} from '../app/lib/backend.js';
const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return{results:sqlite.prepare(this.sql).all(...this.args)};}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return{meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)},success:true};}}
const DB={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const env={DB,ENABLE_SAMPLE_COHORT:'0',BOOTSTRAP_PASSWORD:'Fictional-test-password-234'};
const request=(path,auth={},body)=>handle(new Request('https://dischargeflow.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-DischargeFlow':'1',Cookie:auth.cookie||'','X-CSRF-Token':auth.csrf||''},...(body?{body:JSON.stringify(body)}:{})}),env);
const login=async email=>{const r=await request('/api/login',{}, {email,password:env.BOOTSTRAP_PASSWORD});assert.equal(r.status,200);const j=await r.json();return{cookie:r.headers.get('Set-Cookie').split(';')[0],csrf:j.csrf};};
test('hosted shared database: authentication, multi-page roles, workflow, history, mock events, support and simulation',async()=>{
 try{
 assert.equal((await request('/login')).status,200);assert.equal((await request('/api/cases')).status,401);
 const staff=await login('coordinator@demo.local');const family=await login('family@demo.local');const patient=await login('patient@demo.local');
 for(const p of ['/coordinator','/coordinator/new','/coordinator/cases','/coordinator/history','/coordinator/alerts','/coordinator/help','/coordinator/simulator','/coordinator/integration'])assert.equal((await request(p,staff)).status,200);
 assert.equal((await request('/coordinator/history',family)).status,403);
 assert.equal((await request('/api/history',family)).status,403);
 assert.equal((await request('/api/cases',family)).status,403);
 const c=(await(await request('/api/my-case?case_id=DF-105',family)).json()).case;assert.equal(c.id,'DF-104');assert.ok(!JSON.stringify(c).includes('owner'));
 assert.equal((await request('/api/cases/DF-104/tasks',family,{position:2,action:'complete',expected_updated_at:c.tasks[2].updated_at})).status,403);
 let response=await request('/api/cases/DF-104/tasks',staff,{position:2,action:'hold',note:'Fictional hold',expected_updated_at:c.tasks[2].updated_at});assert.equal(response.status,200);
 assert.equal((await request('/api/cases/DF-104/tasks',staff,{position:2,action:'hold',note:'Stale',expected_updated_at:c.tasks[2].updated_at})).status,409);
 let cs=(await(await request('/api/cases',staff)).json()).cases;let t=cs.find(c=>c.id==='DF-104').tasks[2];
 assert.equal((await request('/api/cases/DF-104/tasks',staff,{position:2,action:'resume',expected_updated_at:t.updated_at})).status,200);
 assert.equal((await request('/api/mock-hospital',family,{event_id:'X',case_id:'MOCK-X',event_type:'medical_clearance',pathway:'cash'})).status,403);
 const send=type=>request('/api/mock-hospital',staff,{event_id:'E-'+type.replaceAll('_','-'),case_id:'MOCK-X',event_type:type,pathway:'cash'});
 assert.equal((await send('medical_clearance')).status,201);assert.equal((await(await send('medical_clearance')).json()).duplicate,true);
 assert.equal((await send('billing_complete')).status,409);
 for(const type of['documentation_complete','pharmacy_complete','billing_complete','final_checks_complete'])assert.equal((await send(type)).status,201);
 await new Promise(r=>setTimeout(r,3));assert.equal((await request('/api/cases/MOCK-X/departure',staff,{confirmed:true,note:'Fictional departure',departed_at:new Date().toISOString()})).status,201);
 cs=(await(await request('/api/cases',staff)).json()).cases;assert.ok(!cs.some(c=>c.id==='MOCK-X'));
 const history=(await(await request('/api/history',staff)).json()).cases;assert.equal(history[0].id,'MOCK-X');assert.equal(history[0].tasks.length,5);
 assert.equal((await request('/api/cases/MOCK-X/tasks',staff,{position:0,action:'start',expected_updated_at:history[0].tasks[0].updated_at})).status,409);
 assert.equal((await request('/api/help',family,{text:'Fictional question'})).status,201);
 const inbox=(await(await request('/api/help/inbox',staff)).json()).threads;assert.equal(inbox.length,1);
 assert.equal((await request('/api/help/'+inbox[0].id,patient)).status,404);
 assert.equal((await request('/api/help/'+inbox[0].id,staff,{text:'Fictional reply'})).status,201);
 assert.equal((await(await request('/api/help',family)).json()).messages.length,2);
 assert.equal((await request('/api/assistant',family,{message:'What is my progress?'})).status,200);
 assert.equal((await request('/api/insights',staff)).status,200);
 assert.equal((await request('/api/insights',family)).status,403);
 const config=await(await request('/api/simulation',staff)).json();
 const before=sqlite.prepare('SELECT COUNT(*) n FROM task_events').get().n;
 assert.equal((await request('/api/simulation',staff,{baseline:config.defaults,stage:2,proposed_capacity:2})).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM task_events').get().n,before);
 assert.equal((await request('/api/logout',staff,{})).status,200);assert.equal((await request('/api/me',staff)).status,401);
 }finally{sqlite.close();}
});
