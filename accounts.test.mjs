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
test('patient provisioning requires staff verification and never grants coordinator privileges',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local');const family=await login('family@demo.local');const grant={name:'Fictional relative',email:'relative@test.local',case_id:'DF-104',relationship:'relative',identity_confirmed:true,authorisation_confirmed:true};
 assert.equal((await request('/api/accounts',family)).status,403);assert.equal((await request('/api/accounts',family,grant)).status,403);
 assert.equal((await request('/api/accounts',{cookie:staff.cookie},grant)).status,403);
 assert.equal((await request('/api/accounts',staff,{...grant,identity_confirmed:false})).status,400);
 assert.equal((await request('/api/accounts',staff,{...grant,authorisation_confirmed:false})).status,400);
 assert.equal((await request('/api/accounts',staff,{...grant,case_id:'unknown'})).status,404);
 assert.equal((await request('/api/accounts',staff,{...grant,role:'coordinator'})).status,400);
 assert.equal((await request('/api/accounts',staff,{...grant,email:'coordinator@demo.local'})).status,409);
 const result=await request('/api/accounts',staff,grant);assert.equal(result.status,201);const issued=await result.json();assert.match(issued.temporary_password,/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/);assert.match(issued.login_id,/^REL-\d{6}$/);assert.equal((await login(issued.login_id,issued.temporary_password)).status,200);
 assert.equal((await request('/api/accounts',staff,grant)).status,409);
 const user=sql.prepare('SELECT * FROM users WHERE email=?').get(grant.email);assert.equal(user.role,'patient');assert.ok(!user.password_hash.includes(issued.temporary_password));
 const metadata=sql.prepare('SELECT * FROM account_access WHERE user_id=?').get(user.id);assert.equal(metadata.relationship,'relative');assert.equal(metadata.granted_by,1);assert.ok(metadata.verified_at);
 const list=await(await request('/api/accounts',staff)).json();assert.equal(list.accounts.find(a=>a.id===user.id).status,'awaiting_password_change');assert.ok(!JSON.stringify(list).includes(issued.temporary_password));assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM audit').all()).includes(issued.temporary_password));
 const temp=await login(grant.email,issued.temporary_password);assert.equal(temp.status,200);assert.equal(temp.data.user.must_change,true);
 const page=await request('/patient',temp);assert.equal(page.status,302);assert.equal(page.headers.get('location'),'/change-password');assert.equal((await request('/change-password',temp)).status,200);
 assert.equal((await request('/api/my-case',temp)).status,403);assert.equal((await request('/api/assistant',temp,{message:'my progress'})).status,403);assert.equal((await request('/api/help',temp,{text:'should be blocked'})).status,403);
 const change={current_password:issued.temporary_password,new_password:'My-unique-test-password-123',confirm_password:'My-unique-test-password-123'};
 assert.equal((await request('/api/password',temp,{...change,new_password:'short',confirm_password:'short'})).status,400);
 assert.equal((await request('/api/password',temp,{...change,current_password:'wrong'})).status,400);
 assert.equal((await request('/api/password',temp,{...change,confirm_password:'different'})).status,400);
 assert.equal((await request('/api/password',{cookie:temp.cookie},change)).status,403);
 assert.equal((await request('/api/password',temp,change)).status,200);assert.equal((await request('/api/me',temp)).status,401);
 assert.equal((await login(grant.email,issued.temporary_password)).status,401);
 const person=await login(grant.email,change.new_password);assert.equal(person.status,200);assert.equal(person.data.user.must_change,false);
 const c=await(await request('/api/my-case?case_id=DF-105',person)).json();assert.equal(c.case.id,'DF-104');assert.equal((await request('/api/cases',person)).status,403);
 const reissue=await request(`/api/accounts/${user.id}/reissue`,staff,{identity_confirmed:true,authorisation_confirmed:true});assert.equal(reissue.status,200);const newIssued=await reissue.json();assert.notEqual(newIssued.temporary_password,issued.temporary_password);assert.equal((await request('/api/my-case',person)).status,401);assert.equal((await login(grant.email,change.new_password)).status,401);
 const reset=await login(grant.email,newIssued.temporary_password);assert.equal(reset.status,200);assert.equal(reset.data.user.must_change,true);
 assert.equal((await request(`/api/accounts/${user.id}/revoke`,staff,{confirmed:true,reason:'Fictional permission withdrawn'})).status,200);
 assert.equal((await request('/api/me',reset)).status,401);assert.equal((await login(grant.email,newIssued.temporary_password)).status,401);assert.equal(sql.prepare('SELECT count(*) n FROM access WHERE user_id=?').get(user.id).n,0);
 assert.equal((await request(`/api/accounts/${user.id}/reissue`,staff,{identity_confirmed:true,authorisation_confirmed:true})).status,409);
 assert.equal((await request('/api/accounts/1/revoke',staff,{confirmed:true,reason:'blocked'})).status,404);
 }finally{sql.close();}
});
test('expired temporary credentials require a verified reissue; legacy sessions can be revoked',async()=>{
 const{sql,request,login}=fixture();try{
 const staff=await login('coordinator@demo.local');const old=await login('patient@demo.local');const g={name:'Fictional patient',email:'expire@test.local',case_id:'DF-105',relationship:'patient',identity_confirmed:true,authorisation_confirmed:true};
 const issued=await(await request('/api/accounts',staff,g)).json();const user=sql.prepare('SELECT id FROM users WHERE email=?').get(g.email);const temp=await login(g.email,issued.temporary_password);
 sql.prepare('UPDATE account_access SET credential_expires_at=? WHERE user_id=?').run(Date.now()-1,user.id);
 assert.equal((await login(g.email,issued.temporary_password)).status,401);assert.equal((await request('/api/me',temp)).status,401);
 assert.equal((await request(`/api/accounts/${user.id}/reissue`,staff,{identity_confirmed:false,authorisation_confirmed:true})).status,400);
 assert.equal((await request(`/api/accounts/${user.id}/reissue`,staff,{identity_confirmed:true,authorisation_confirmed:true})).status,200);
 assert.equal((await request('/api/accounts/3/revoke',staff,{confirmed:false,reason:'test'})).status,400);
 assert.equal((await request('/api/accounts/3/revoke',staff,{confirmed:true,reason:'Prototype access retired'})).status,200);
 assert.equal((await request('/api/my-case',old)).status,401);assert.equal((await login('patient@demo.local')).status,401);
 assert.equal((await login('family@demo.local')).status,200);
 }finally{sql.close();}
});
