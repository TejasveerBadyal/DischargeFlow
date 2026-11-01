import {ensureHospitalRoles} from './hospital-roles.js';
import {scopedReads,isStaff} from './hospital-scope.js';
import {caseHistoryRoute} from './case-history.js';
import {ensureDirectory,directoryRoute} from './directory.js';
import {insuranceOpsRoute} from './insurance-ops.js';
import {supportRoute} from './support.js';
import {followupRoute} from './followup.js';
import {insuranceRoute,insuranceStatus} from './insurance.js';
import {ensureSampleCohort} from './samples.js';
import {accountRoute} from './accounts.js';
import {HTML} from './assets.js';
import {simulate,DEFAULT_MODEL,STAGES} from './model.js';
import {assistantAnswer} from './assistant.js';
const LIMITS={queue:30,processing:45,hold:30,stale:60,total:120};
const deps=i=>i<2?[]:i===2?[0,1]:i===3?[2]:[0,1,2,3];
const closed=s=>['complete','not_applicable'].includes(s);
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
async function derive(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));}
const equal=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const steps=[['Discharge documentation','Treating team'],['Pharmacy clearance','Pharmacy'],['Final billing','Billing'],['Insurance authorisation','Insurance desk'],['Final checks','Discharge coordinator']];
const pagePaths=['/coordinator/directory','/coordinator/case-history','/coordinator/insurance','/coordinator/appointments','/coordinator','/coordinator/cases','/coordinator/new','/coordinator/alerts','/coordinator/simulator','/coordinator/help','/coordinator/history','/coordinator/integration','/coordinator/access','/change-password','/patient'];
const err=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n;
export async function handle(request,env){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
 const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json',...extra}});
 const redirect=path=>new Response(null,{status:302,headers:{...headers,Location:path}});
 try{
  if(!env.DB)return json({error:'The shared database is not configured.'},503);
  const db=env.DB;
  const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
  let get=async(sql,...args)=>stmt(sql,...args).first();
  let all=async(sql,...args)=>(await stmt(sql,...args).all()).results;
  const run=async(sql,...args)=>stmt(sql,...args).run();
  const batch=async commands=>db.batch(commands.map(([sql,...args])=>stmt(sql,...args)));
  const now=()=>new Date().toISOString();
  const tasks=async id=>all("SELECT t.*,h.reason AS hold_reason,CASE WHEN h.reason IS NOT NULL THEN 'on_hold' ELSE t.status END AS status FROM tasks t LEFT JOIN task_holds h ON h.case_id=t.case_id AND h.position=t.position WHERE t.case_id=? ORDER BY t.position",id);
  async function activeCases(){
   const cs=await all('SELECT c.*,h.name AS hospital_name FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.id NOT IN (SELECT case_id FROM departures) ORDER BY c.cleared_at,c.id');
   const records=await all("SELECT t.*,h.reason AS hold_reason,CASE WHEN h.reason IS NOT NULL THEN 'on_hold' ELSE t.status END AS status FROM tasks t LEFT JOIN task_holds h ON h.case_id=t.case_id AND h.position=t.position WHERE t.case_id NOT IN(SELECT case_id FROM departures) ORDER BY t.position");
   const receipts=await all('SELECT * FROM insurance_receipts');
   return cs.map(c=>{const ts=records.filter(t=>t.case_id===c.id);return {...c,tasks:ts,insurance:insuranceStatus(c,ts,receipts.find(r=>r.case_id===c.id))};});
  }
  if(!(await get('SELECT id FROM users LIMIT 1'))){
   if(!env.BOOTSTRAP_PASSWORD)return json({error:'Prototype accounts have not been configured.'},503);
   const commands=[];for(const [id,email,name,role]of[[1,'coordinator@demo.local','Demo coordinator','coordinator'],[2,'family@demo.local','Demo family member','patient'],[3,'patient@demo.local','Demo patient','patient']]){const salt=random();commands.push(['INSERT OR IGNORE INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)',id,email,name,salt+':'+await derive(env.BOOTSTRAP_PASSWORD,salt),role]);}
   const date=new Date();const ago=m=>new Date(date.getTime()-m*60000).toISOString();
   commands.push(['INSERT OR IGNORE INTO cases(id,display_name,ward,pathway,cleared_at) VALUES(?,?,?,?,?)','DF-104','Fictional patient A','Ward A · Bed 12','insured',ago(95)],['INSERT OR IGNORE INTO cases(id,display_name,ward,pathway,cleared_at) VALUES(?,?,?,?,?)','DF-105','Fictional patient B','Ward B · Bed 06','cash',ago(42)],['INSERT OR IGNORE INTO access VALUES(?,?)',2,'DF-104'],['INSERT OR IGNORE INTO access VALUES(?,?)',3,'DF-105']);
   for(const [id,statuses]of[['DF-104',['complete','complete','processing','pending','pending']],['DF-105',['complete','processing','pending','not_applicable','pending']]])steps.forEach(([label,owner],i)=>commands.push(['INSERT OR IGNORE INTO tasks VALUES(?,?,?,?,?,?)',id,i,label,owner,statuses[i],ago(10)]));
   commands.push(['INSERT OR IGNORE INTO alert_settings VALUES(1,?)',JSON.stringify(LIMITS)]);await batch(commands);
  }
  await ensureDirectory({get,batch,now});
  if(env.ENABLE_SAMPLE_COHORT!=='0')await ensureSampleCohort({get,batch,now});
  await ensureHospitalRoles({get,batch,now});
  const url=new URL(request.url);const path=url.pathname;const method=request.method;
  if(path==='/')return redirect('/login');
  if(path==='/login'&&method==='GET')return new Response(HTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  const mutating=!['GET','HEAD'].includes(method);let body={};
  if(mutating){if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||request.headers.get('x-dischargeflow')!=='1'||(request.headers.get('origin')&&request.headers.get('origin')!==url.origin))return json({error:'Request verification failed.'},403);const raw=await request.text();if(raw.length>4096)return json({error:'Request too large.'},413);try{body=JSON.parse(raw||'{}');}catch{return json({error:'Invalid JSON.'},400);}if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);}
  const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('df_session='))?.slice(11);
  if(path==='/api/login'&&method==='POST'){
   if(!text(body.email,254)||typeof body.password!=='string'||body.password.length>256)return json({error:'Enter a valid login ID or email and password.'},400);
   const email=body.email.trim().toLowerCase();const user=await get('SELECT u.* FROM users u LEFT JOIN login_aliases l ON l.user_id=u.id WHERE lower(u.email)=? OR l.alias=? LIMIT 1',email,email);const bucket=await digest(user?.email||email);const attempt=await get('SELECT * FROM login_attempts WHERE bucket=?',bucket);
   if(attempt&&Date.now()-attempt.window_start<900000&&attempt.failures>=10)return json({error:'Too many attempts. Try again in 15 minutes.'},429);
   const [salt,hash]=user?user.password_hash.split(':'):['dummy-salt','0'.repeat(64)];
   if(!equal(await derive(body.password,salt),hash)||!user){const t=Date.now();await run('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET failures=CASE WHEN ?-window_start>=900000 THEN 1 ELSE failures+1 END,window_start=CASE WHEN ?-window_start>=900000 THEN ? ELSE window_start END',bucket,t,t,t,t);return json({error:'Login ID, email or password is incorrect.'},401);}
   const grant=await get('SELECT * FROM account_access WHERE user_id=?',user.id);
   if(grant&&(grant.revoked_at||(grant.must_change&&grant.credential_expires_at<=Date.now())||!(await get('SELECT user_id FROM access WHERE user_id=? AND case_id=?',user.id,grant.case_id))))return json({error:'This account is unavailable or its temporary credentials expired. Contact the coordinator.'},401);
   const sessionToken=random();const csrf=random();const commands=[['DELETE FROM login_attempts WHERE bucket=?',bucket],['DELETE FROM sessions WHERE expires_at<=?',Date.now()],['INSERT INTO sessions VALUES(?,?,?,?)',await digest(sessionToken),user.id,csrf,Date.now()+1800000],['INSERT INTO audit(user_id,event,occurred_at) VALUES(?,?,?)',user.id,'login',now()]];if(token)commands.push(['DELETE FROM sessions WHERE token_hash=?',await digest(token)]);await batch(commands);
   return json({user:{name:user.name,role:user.role,hospital_id:user.hospital_id,hospital_name:(await get('SELECT name FROM hospitals WHERE id=?',user.hospital_id))?.name||null,must_change:!!grant?.must_change},csrf},200,{'Set-Cookie':`df_session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`});
  }
  let session=token?await get('SELECT s.*,u.name,u.role,u.hospital_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?',await digest(token),Date.now()):null;
  if(session){
   const grant=await get('SELECT * FROM account_access WHERE user_id=?',session.user_id);
   if(grant&&(grant.revoked_at||(grant.must_change&&grant.credential_expires_at<=Date.now())||!(await get('SELECT user_id FROM access WHERE user_id=? AND case_id=?',session.user_id,grant.case_id))))session=null;
   else if(grant)session.must_change=!!grant.must_change;
  }
  if((pagePaths.includes(path)||path==='/admin')&&method==='GET'){
   if(!session)return redirect('/login');
   if(session.must_change&&path!=='/change-password')return redirect('/change-password');
   const own=session.role==='admin'?'/admin':session.role==='coordinator'?'/coordinator':'/patient';
   if(path==='/change-password'&&!session.must_change)return redirect(own);
   const allowed=session.role==='admin'?path==='/admin'||path.startsWith('/coordinator'):session.role==='coordinator'?path.startsWith('/coordinator')&&path!=='/coordinator/directory':['/patient','/change-password'].includes(path);
   if(!allowed)return new Response(`<!doctype html><html lang="en"><title>Access restricted</title><h1>Access restricted</h1><a href="${own}">Return to your workspace</a></html>`,{status:403,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
   return new Response(HTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  }
  if(!path.startsWith('/api/'))return json({error:'Page not found.'},404);
  if(!session)return json({error:'Please sign in to continue.'},401);
  if(mutating&&request.headers.get('x-csrf-token')!==session.csrf)return json({error:'Request verification failed.'},403);
  const staff=isStaff(session);
  if(session.role==='admin'&&request.headers.has('x-hospital-id')){const id=Number(request.headers.get('x-hospital-id'));if(!Number.isSafeInteger(id)||!await get('SELECT id FROM hospitals WHERE id=?',id))err(400,'Choose a valid hospital.');session.scope_hospital_id=id;}
  ({get,all}=scopedReads(session,{get,all}));const needStaff=()=>{if(!staff)err(403,'Coordinator access required.');};
  if(session.must_change&&!['/api/me','/api/logout','/api/password'].includes(path))return json({error:'Replace the temporary password before viewing case information.',password_change_required:true},403);
  const historyResponse=await caseHistoryRoute({path,method,session,get,all,json,err,tasks});if(historyResponse)return historyResponse;
  const directory=await directoryRoute({path,method,body,session,get,all,batch,json,err,now});if(directory)return directory;
  const insuranceOps=await insuranceOpsRoute({path,method,body,session,get,all,batch,json,err,now,tasks,activeCases});if(insuranceOps)return insuranceOps;
  const support=await supportRoute({path,method,body,session,get,all,batch,json,err,now});if(support)return support;
  const followup=await followupRoute({path,method,body,session,get,all,batch,json,err,now});if(followup)return followup;
  const insuranceResponse=await insuranceRoute({path,method,body,session,get,batch,json,err,now,tasks});if(insuranceResponse)return insuranceResponse;
  const accounts=await accountRoute({path,method,body,session,get,all,batch,json,err,derive,random,now});if(accounts)return accounts;
  if(path==='/api/admin/overview'&&method==='GET'){if(session.role!=='admin')err(403,'Platform administrator access required.');return json({hospitals:await all(`SELECT h.*,(SELECT COUNT(*) FROM cases c WHERE c.hospital_id=h.id AND c.id NOT IN(SELECT case_id FROM departures)) AS active_cases,(SELECT COUNT(*) FROM cases c JOIN departures d ON d.case_id=c.id WHERE c.hospital_id=h.id) AS previous_cases,(SELECT COUNT(*) FROM users u WHERE u.role='coordinator' AND u.hospital_id=h.id) AS coordinators FROM hospitals h ORDER BY h.id`),staff:await all("SELECT u.name,u.email,u.role,h.name AS hospital_name FROM users u LEFT JOIN hospitals h ON h.id=u.hospital_id WHERE u.role IN('admin','coordinator') ORDER BY u.role,u.hospital_id")});}
  if(path==='/api/me'&&method==='GET')return json({user:{name:session.name,role:session.role,hospital_id:session.hospital_id,hospital_name:(await get('SELECT name FROM hospitals WHERE id=?',session.hospital_id))?.name||null,must_change:!!session.must_change},csrf:session.csrf});
  if(path==='/api/logout'&&method==='POST'){await batch([['DELETE FROM sessions WHERE token_hash=?',session.token_hash],['INSERT INTO audit(user_id,event,occurred_at) VALUES(?,?,?)',session.user_id,'logout',now()]]);return json({ok:true},200,{'Set-Cookie':'df_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});}
  if(path==='/api/cases'&&method==='GET'){needStaff();return json({cases:await activeCases()});}
  if(path==='/api/my-case'&&method==='GET'){
   if(staff)err(403,'Patient access required.');const c=await get('SELECT c.* FROM cases c JOIN access a ON a.case_id=c.id WHERE a.user_id=?',session.user_id);if(!c)err(404,'No case is linked. Contact hospital staff.');const ts=await tasks(c.id);const insurance=insuranceStatus(c,ts,await get('SELECT * FROM insurance_receipts WHERE case_id=?',c.id));return json({case:{...c,insurance,departed_at:(await get('SELECT departed_at FROM departures WHERE case_id=?',c.id))?.departed_at||null,tasks:ts.map(({position,label,status,updated_at})=>({position,label,status,updated_at}))}});
  }
  async function createCase(input,imported=false){
   const hospital=session.role==='coordinator'?session.hospital_id:session.scope_hospital_id||Number(input.hospital_id);if(!Number.isInteger(hospital)||!await get('SELECT id FROM hospitals WHERE id=? AND active=1',hospital))err(400,'Select a hospital from the admin dashboard before registering a case.');const id=input.id;if(!text(id,40)||!/^[A-Za-z0-9-]+$/.test(id)||!text(input.name,80)||!text(input.ward,80)||!text(input.clinician,80)||!['cash','insured'].includes(input.pathway)||input.confirmed!==true)err(400,'Enter a valid admission ID, patient, ward, clinician and pathway, and confirm clearance.');const date=Date.parse(input.cleared_at);if(!Number.isFinite(date)||date>Date.now())err(400,'Clearance time is invalid or in the future.');if(await get('SELECT id FROM cases WHERE id=?',id))err(409,'That admission ID already exists.');const at=now();
   return [['INSERT INTO cases(id,display_name,ward,pathway,cleared_at,hospital_id) VALUES(?,?,?,?,?,?)',id,input.name.trim(),input.ward.trim(),input.pathway,new Date(date).toISOString(),hospital],['INSERT INTO case_clearance VALUES(?,?)',id,input.clinician.trim()],...steps.map(([label,owner],i)=>['INSERT INTO tasks VALUES(?,?,?,?,?,?)',id,i,label,owner,i===3&&input.pathway==='cash'?'not_applicable':'pending',at]),['INSERT INTO task_events(case_id,user_id,action,note,occurred_at) VALUES(?,?,?,?,?)',id,session.user_id,'case_created',`Clearance recorded from ${input.clinician.trim()}`,at]];
  }
  if(path==='/api/cases'&&method==='POST'){needStaff();await batch(await createCase(body));return json({id:body.id},201);}
  const taskRoute=path.match(/^\/api\/cases\/([A-Za-z0-9-]+)\/(tasks|history|departure)$/);
  if(taskRoute){
   needStaff();const id=taskRoute[1];const c=await get('SELECT * FROM cases WHERE id=?',id);if(!c)err(404,'Case not found.');const ts=await tasks(id);
   if(taskRoute[2]==='history'&&method==='GET')return json({events:await all('SELECT e.*,u.name AS actor FROM task_events e JOIN users u ON u.id=e.user_id WHERE case_id=? ORDER BY e.id DESC',id)});
   if(taskRoute[2]==='departure'&&method==='POST'){
    if(ts.some(t=>!closed(t.status))||body.confirmed!==true)err(409,'Complete every required task and confirm authorised departure first.');const date=Date.parse(body.departed_at);if(!Number.isFinite(date)||date<Date.parse(c.cleared_at)||date<Math.max(...ts.map(t=>Date.parse(t.updated_at)))||date>Date.now()||typeof body.note!=='string'||body.note.length>500)err(400,'Enter a valid departure time and note.');if(await get('SELECT case_id FROM departures WHERE case_id=?',id))err(409,'Departure already recorded.');await batch([['INSERT INTO departures VALUES(?,?,?,?,?)',id,new Date(date).toISOString(),now(),session.user_id,body.note.trim()],['INSERT INTO task_events(case_id,user_id,action,note,occurred_at) VALUES(?,?,?,?,?)',id,session.user_id,'departure_recorded',body.note.trim(),now()]]);return json({ok:true},201);
   }
   if(taskRoute[2]==='tasks'&&method==='POST'){
    if(await get('SELECT case_id FROM departures WHERE case_id=?',id))err(409,'Departed cases are read-only.');if(!Number.isInteger(body.position)||!['start','complete','hold','resume'].includes(body.action)||typeof body.expected_updated_at!=='string'||(body.note!==undefined&&typeof body.note!=='string')||(body.note?.length||0)>500)err(400,'Invalid task action or note.');const t=ts.find(t=>t.position===body.position);if(!t)err(404,'Task not found.');if(t.updated_at!==body.expected_updated_at)err(409,'This task changed. Refresh before trying again.');
    if(['start','complete'].includes(body.action)&&deps(t.position).some(i=>!closed(ts[i].status)))err(409,'Complete prerequisite tasks first.');if(closed(t.status))err(409,'This task is closed.');if(body.action==='start'&&t.status!=='pending')err(409,'Only pending tasks can be started.');if(body.action==='complete'&&t.status!=='processing')err(409,'Start or resume the task before completing it.');if(body.action==='hold'&&(!['pending','processing'].includes(t.status)||!text(body.note,500)))err(400,'A pending or in-progress task and hold reason are required.');if(body.action==='resume'&&t.status!=='on_hold')err(409,'This task is not on hold.');
    const original=await get('SELECT status FROM tasks WHERE case_id=? AND position=?',id,t.position);const next=body.action==='hold'?'on_hold':body.action==='resume'?original.status:body.action==='start'?'processing':'complete';const at=new Date(Math.max(Date.now(),Date.parse(t.updated_at)+1)).toISOString();const guard='EXISTS(SELECT 1 FROM tasks WHERE case_id=? AND position=? AND updated_at=?)';const g=[id,t.position,t.updated_at];
    const commands=[['INSERT INTO task_events(case_id,position,user_id,action,old_status,new_status,note,occurred_at) SELECT ?,?,?,?,?,?,?,? WHERE '+guard,id,t.position,session.user_id,body.action,t.status,next,body.note?.trim()||'',at,...g]];
    if(body.action==='hold')commands.push(['INSERT INTO task_holds SELECT ?,?,? WHERE '+guard,id,t.position,body.note.trim(),...g]);if(body.action==='resume')commands.push(['DELETE FROM task_holds WHERE case_id=? AND position=? AND '+guard,id,t.position,...g]);commands.push(['UPDATE tasks SET status=?,updated_at=? WHERE case_id=? AND position=? AND updated_at=?',next==='on_hold'?original.status:next,at,...g]);const results=await batch(commands);if(!results.at(-1).meta.changes)err(409,'This task changed. Refresh before trying again.');return json({tasks:await tasks(id)});
   }
  }
  if(path==='/api/history'&&method==='GET'){needStaff();const cs=await all('SELECT c.*,d.departed_at,d.recorded_at,d.note,u.name AS recorded_by FROM departures d JOIN cases c ON c.id=d.case_id JOIN users u ON u.id=d.user_id ORDER BY d.departed_at DESC');return json({cases:await Promise.all(cs.map(async c=>({...c,tasks:await tasks(c.id)})))});}
  if(path==='/api/help/inbox'&&method==='GET'){needStaff();return json({threads:await all('SELECT t.*,u.name AS requester,c.display_name FROM help_threads t JOIN users u ON u.id=t.user_id JOIN cases c ON c.id=t.case_id ORDER BY t.updated_at DESC,t.id DESC')});}
  const help=path.match(/^\/api\/help(?:\/(\d+))?$/);
  if(help){
   if(staff&&!help[1])err(400,'Choose a conversation from the inbox.');let thread=help[1]?await get('SELECT * FROM help_threads WHERE id=?',Number(help[1])):await get('SELECT * FROM help_threads WHERE user_id=?',session.user_id);if(help[1]&&(!thread||(!staff&&thread.user_id!==session.user_id)))err(404,'Conversation not found.');
   if(method==='GET')return json({thread:thread||null,messages:thread?await all('SELECT m.id,m.text,m.created_at,u.name AS sender,u.role FROM help_messages m JOIN users u ON u.id=m.user_id WHERE thread_id=? ORDER BY m.id',thread.id):[]});
   if(method==='POST'){
    if(!text(body.text,1000))err(400,'Enter a message between 1 and 1000 characters.');if((await get('SELECT COUNT(*) n FROM help_messages WHERE user_id=? AND created_at>?',session.user_id,new Date(Date.now()-60000).toISOString())).n>=20)err(429,'Please wait a minute before sending more messages.');const at=now();const commands=[];
    if(!thread){const a=await get('SELECT case_id FROM access WHERE user_id=?',session.user_id);if(!a)err(404,'No case is linked.');commands.push(['INSERT OR IGNORE INTO help_threads(user_id,case_id,state,updated_at) VALUES(?,?,?,?)',session.user_id,a.case_id,'waiting',at]);}
    if(thread)commands.push(['INSERT INTO help_messages(thread_id,user_id,text,created_at) VALUES(?,?,?,?)',thread.id,session.user_id,body.text.trim(),at],['UPDATE help_threads SET state=?,updated_at=? WHERE id=?',staff?'replied':'waiting',at,thread.id]);else commands.push(['INSERT INTO help_messages(thread_id,user_id,text,created_at) SELECT id,?,?,? FROM help_threads WHERE user_id=?',session.user_id,body.text.trim(),at,session.user_id],['UPDATE help_threads SET state=?,updated_at=? WHERE user_id=?','waiting',at,session.user_id]);await batch(commands);return json({ok:true},201);
   }
  }
  if(path==='/api/assistant'&&method==='POST'){
   if(staff)err(403,'Patient access required.');if(!text(body.message,500))err(400,'Ask a question between 1 and 500 characters.');const c=await get('SELECT c.* FROM cases c JOIN access a ON a.case_id=c.id WHERE a.user_id=?',session.user_id);if(!c)err(404,'No case is linked.');const l=await get('SELECT * FROM assistant_limits WHERE user_id=?',session.user_id);if(l&&Date.now()-l.window_start<60000&&l.count>=20)err(429,'Please wait a minute before asking more questions.');const at=Date.now();await run('INSERT INTO assistant_limits VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN ?-window_start>=60000 THEN 1 ELSE count+1 END,window_start=CASE WHEN ?-window_start>=60000 THEN ? ELSE window_start END',session.user_id,at,at,at,at);const ts=await tasks(c.id);const insurance=insuranceStatus(c,ts,await get('SELECT * FROM insurance_receipts WHERE case_id=?',c.id));if(/three.hour|3.hour|benefit|compensation|additional charge|insurance delay|insurance.*right/i.test(body.message)&&!/pain|breath|bleed|emergency|urgent|unwell|symptom|medicin|dose|fever|vomit|treatment|diagnos/i.test(body.message))return json({case_id:c.id,as_of:now(),latest_event:ts.map(t=>t.updated_at).sort().at(-1),kind:'rules',handoff:true,answer:insurance.notify?insurance.rights_text:insurance.status==='not_applicable'?'The cashless final-authorisation timer does not apply to your recorded self-pay pathway.':insurance.status==='unverified'?'The insurer receipt time is not verified, so I cannot establish whether the three-hour window has passed. Ask the coordinator to check the acknowledgement.':'The recorded final-authorisation interval has not exceeded three hours. Ask the coordinator to verify the receipt and your policy details.'});return json({...assistantAnswer(c,ts,body.message.trim()),as_of:now(),kind:'rules'});
  }
  if(path==='/api/insights'){
   needStaff();if(method==='POST'){if(!body.limits||Object.keys(LIMITS).some(k=>!Number.isInteger(body.limits[k])||body.limits[k]<1||body.limits[k]>1440))err(400,'Thresholds must be whole minutes from 1 to 1440.');await batch([session.hospital_id||session.scope_hospital_id?['INSERT INTO hospital_alert_settings(hospital_id,settings) VALUES(?,?) ON CONFLICT(hospital_id) DO UPDATE SET settings=excluded.settings',session.hospital_id||session.scope_hospital_id,JSON.stringify(body.limits)]:['UPDATE alert_settings SET settings=? WHERE id=1',JSON.stringify(body.limits)],['INSERT INTO audit(user_id,event,occurred_at) VALUES(?,?,?)',session.user_id,'alert_thresholds_changed',now()]]);}
   const limits=JSON.parse(((session.hospital_id||session.scope_hospital_id?await get('SELECT settings FROM hospital_alert_settings WHERE hospital_id=?',session.hospital_id||session.scope_hospital_id):null)||await get('SELECT settings FROM alert_settings WHERE id=1')).settings);const alerts=[];const queues=new Map();const age=t=>Math.max(0,Math.floor((Date.now()-Date.parse(t))/60000));
   const allEvents=await all('SELECT * FROM task_events ORDER BY id DESC');
   const insuranceReviews=await all('SELECT * FROM insurance_workflows');
   for(const c of await activeCases()){
    const ts=c.tasks;const review=insuranceReviews.find(w=>w.case_id===c.id);const events=allEvents.filter(e=>e.case_id===c.id);const add=(t,type,minutes,limit,reason)=>alerts.push({case_id:c.id,position:t?.position??null,department:t?.owner??'Discharge coordinator',type,minutes,limit,reason});
    if(review?.next_followup_at&&Date.parse(review.next_followup_at)<=Date.now()&&!['approved','rejected'].includes(review.stage))add(ts[3],'insurance_followup_due',age(review.next_followup_at),0,'The assigned insurance follow-up time has passed. Review the insurer response and record the next action.');
    if(c.insurance.phase==='awaiting_insurer'&&!c.insurance.notify&&c.insurance.elapsed_minutes>=150)add(ts[3],'insurance_deadline_approaching',c.insurance.elapsed_minutes,180,'Verified insurer receipt is approaching the three-hour final-authorisation deadline. Contact the insurance desk and record the outcome.');
    if(c.insurance.notify&&c.insurance.phase==='awaiting_insurer')add(ts[3],'insurance_final_authorisation',c.insurance.elapsed_minutes,180,'Verified insurer receipt is more than three hours old. The linked patient view displays sourced rights information; check any additional hospital charges with the insurer.');
    if(ts.some(t=>!closed(t.status))&&age(c.cleared_at)>=limits.total)add(null,'elapsed',age(c.cleared_at),limits.total,'Time since medical clearance exceeds the demo target. This is elapsed time, not a departure prediction.');
    for(const t of ts){if(!queues.has(t.owner))queues.set(t.owner,{department:t.owner,eligible:0,processing:0,held:0,blocked:0,external:0});const row=queues.get(t.owner);if(closed(t.status))continue;const last=events.find(e=>e.position===t.position);const eligible=deps(t.position).every(i=>closed(ts[i].status));
     if(t.position===3&&c.insurance.phase==='awaiting_insurer'&&t.status!=='on_hold'){row.external++;}else if(t.status==='on_hold'){row.held++;if(age(t.updated_at)>=limits.hold)add(t,'hold',age(t.updated_at),limits.hold,'Task has remained on hold beyond the demo threshold. Review its recorded reason.');}else if(t.status==='processing'){row.processing++;if(last&&['start','resume'].includes(last.action)&&age(last.occurred_at)>=limits.processing)add(t,'processing',age(last.occurred_at),limits.processing,'Current uninterrupted work interval exceeds the demo threshold.');}else if(eligible){row.eligible++;const ready=[c.cleared_at,...deps(t.position).filter(i=>ts[i].status!=='not_applicable').map(i=>ts[i].updated_at),...(last?.action==='resume'?[last.occurred_at]:[])].sort().at(-1);if(age(ready)>=limits.queue)add(t,'queue',age(ready),limits.queue,'Prerequisites are complete, but the task is not started.');}else row.blocked++;
     if(age(t.updated_at)>=limits.stale)add(t,'stale',age(t.updated_at),limits.stale,'No recent status event. Confirm the status before acting; this does not prove work stopped.');
    }
   }return json({generated_at:now(),limits,alerts:alerts.sort((a,b)=>b.minutes-a.minutes),queues:[...queues.values()].sort((a,b)=>b.eligible-a.eligible||a.department.localeCompare(b.department))});
  }
  if(path==='/api/simulation'){
   needStaff();const cs=(await activeCases()).filter(c=>c.tasks.some(t=>!closed(t.status)));const running=[0,0,0,0,0];for(const c of cs)c.tasks.forEach((t,i)=>{if(t.status==='processing'&&!(i===3&&c.insurance.phase==='awaiting_insurer'))running[i]++;});
   if(method==='GET')return json({defaults:{...DEFAULT_MODEL,capacity:DEFAULT_MODEL.capacity.map((n,i)=>Math.max(n,running[i]))},stages:STAGES,active_cases:cs.length,in_progress:running});
   if(method==='POST'){
    const m=body.baseline;const valid=m&&Array.isArray(m.capacity)&&m.capacity.length===5&&m.capacity.every(n=>Number.isInteger(n)&&n>=1&&n<=10)&&Array.isArray(m.minutes)&&m.minutes.length===5&&m.minutes.every(n=>Number.isInteger(n)&&n>=1&&n<=240)&&['insurer_minutes','hold_minutes'].every(k=>Number.isInteger(m[k])&&m[k]>=0&&m[k]<=1440)&&Number.isInteger(m.cutoff_minutes)&&m.cutoff_minutes>=1&&m.cutoff_minutes<=2880;
    if(!valid||!Number.isInteger(body.stage)||body.stage<0||body.stage>4||!Number.isInteger(body.proposed_capacity)||body.proposed_capacity<1||body.proposed_capacity>10)err(400,'Enter valid whole-number model assumptions.');if(cs.length>200)err(400,'Maximum 200 active cases per simulation.');if(m.capacity.some((n,i)=>n<running[i])||body.proposed_capacity<running[body.stage])err(409,'Capacity cannot be below current in-progress work. Refresh inputs.');const proposed={...m,capacity:[...m.capacity]};proposed.capacity[body.stage]=body.proposed_capacity;const baseline=simulate(cs,m);const scenario=simulate(cs,proposed);return json({generated_at:now(),count:cs.length,held_tasks:cs.reduce((n,c)=>n+c.tasks.filter(t=>t.status==='on_hold').length,0),model:m,proposed,stage:STAGES[body.stage],baseline,scenario,mean_minutes_saved:Math.round((baseline.mean_remaining-scenario.mean_remaining)*10)/10,read_only:true});
   }
  }
  if(path==='/api/mock-hospital'&&method==='POST'){
   needStaff();if(!text(body.event_id,80)||!/^[A-Za-z0-9-]+$/.test(body.event_id)||!text(body.case_id,40)||!/^[A-Za-z0-9-]+$/.test(body.case_id)||!['medical_clearance','documentation_complete','pharmacy_complete','billing_complete','insurance_complete','final_checks_complete'].includes(body.event_type))err(400,'Enter a supported mock event and valid IDs.');
   const prior=await get('SELECT * FROM mock_events WHERE event_id=?',body.event_id);if(prior){if(prior.case_id!==body.case_id||prior.event_type!==body.event_type)err(409,'Event ID already used for another event.');return json({ok:true,duplicate:true});}
   const at=now();const commands=[];
   if(body.event_type==='medical_clearance')commands.push(...await createCase({id:body.case_id,name:'Fictional imported patient',ward:'Mock hospital · Ward M',clinician:'Mock authorised clinician',pathway:body.pathway,hospital_id:body.hospital_id,cleared_at:at,confirmed:true}));
   else{const position={documentation_complete:0,pharmacy_complete:1,billing_complete:2,insurance_complete:3,final_checks_complete:4}[body.event_type];const ts=await tasks(body.case_id);if(!ts.length||await get('SELECT case_id FROM departures WHERE case_id=?',body.case_id))err(409,'Use an existing active case.');const t=ts[position];if(['not_applicable','on_hold'].includes(t.status)||deps(position).some(i=>!closed(ts[i].status)))err(409,'The mock event conflicts with prerequisites, a hold or the payment pathway.');if(t.status!=='complete')commands.push(['UPDATE tasks SET status=?,updated_at=? WHERE case_id=? AND position=?','complete',at,body.case_id,position]);}
   commands.push(['INSERT INTO mock_events VALUES(?,?,?,?,?)',body.event_id,body.case_id,body.event_type,at,session.user_id],['INSERT INTO task_events(case_id,user_id,action,note,occurred_at) VALUES(?,?,?,?,?)',body.case_id,session.user_id,'mock_hospital_event',body.event_type+' · '+body.event_id,at]);await batch(commands);return json({ok:true,duplicate:false},201);
  }
  return json({error:'Page not found.'},404);
 }catch(e){console.error('DischargeFlow request:',e.code||e.name);return json({error:e.code?e.message:/UNIQUE constraint/.test(e.message)?'That record already exists. Refresh and try again.':'The request could not be completed. Please try again.'},e.code||(/UNIQUE constraint/.test(e.message)?409:500));}
}
