// Accounts remain linked to one admission. Verification is a staff attestation,
// not automated identity checking. Temporary credentials never enter audit logs.
export async function accountRoute(context){
 const {path,method,body,session,get,all,batch,json,err,derive,random,now}=context;
 const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n;
 const verified=()=>{if(body.identity_confirmed!==true||body.authorisation_confirmed!==true)err(400,'Confirm that requester identity and patient or hospital authorisation have been checked.');};
 const staff=()=>{if(!['admin','coordinator'].includes(session.role))err(403,'Coordinator access required.');};
 if(path==='/api/accounts'&&method==='GET'){
  staff();const rows=await all(`SELECT u.id,u.name,u.email,(SELECT upper(alias) FROM login_aliases WHERE user_id=u.id AND alias NOT LIKE '%@%' LIMIT 1) AS login_id,COALESCE(g.case_id,a.case_id) AS case_id,COALESCE(g.relationship,'prototype') AS relationship,g.granted_at,g.verified_at,g.revoked_at,g.must_change,g.credential_expires_at,g.password_changed_at,c.display_name AS patient_name FROM users u LEFT JOIN account_access g ON g.user_id=u.id LEFT JOIN access a ON a.user_id=u.id LEFT JOIN cases c ON c.id=COALESCE(g.case_id,a.case_id) WHERE u.role='patient' AND COALESCE(g.case_id,a.case_id) IS NOT NULL ORDER BY u.id DESC`);
  return json({accounts:rows.map(r=>({...r,status:r.revoked_at?'revoked':r.must_change&&r.credential_expires_at<=Date.now()?'temporary_expired':r.must_change?'awaiting_password_change':'active'}))});
 }
 if(path==='/api/accounts'&&method==='POST'){
  staff();verified();
  if(!text(body.name,80)||!text(body.email,254)||!/^\S+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())||!text(body.case_id,40)||!['patient','relative'].includes(body.relationship)||(body.role!==undefined&&body.role!=='patient'))err(400,'Enter a name, valid email, admission and patient or relative relationship.');
  const email=body.email.trim().toLowerCase();
  const c=await get('SELECT id FROM cases WHERE id=?',body.case_id);if(!c)err(404,'That admission does not exist. Register the case first.');
  if(await get('SELECT case_id FROM departures WHERE case_id=?',body.case_id))err(409,'Create new access only for an active admission.');
  if(await get('SELECT id FROM users WHERE email=?',email))err(409,'That email is already registered. Existing accounts cannot be silently relinked.');
  const temporary_password=random().slice(0,24).toUpperCase().match(/.{1,6}/g).join('-');const salt=random();const hash=salt+':'+await derive(temporary_password,salt);const at=now();const expires=Date.now()+2*60*60*1000;
  await batch([
   ['INSERT INTO users(email,name,password_hash,role,hospital_id) SELECT ?,?,?,?,hospital_id FROM cases WHERE id=?',email,body.name.trim(),hash,'patient',body.case_id],
   ["INSERT INTO login_aliases(alias,user_id) SELECT lower(?||printf('%06d',id)),id FROM users WHERE email=?",body.relationship==='relative'?'REL-':'PAT-',email],
   ['INSERT INTO access(user_id,case_id) SELECT id,? FROM users WHERE email=?',body.case_id,email],
   ['INSERT INTO account_access(user_id,case_id,relationship,granted_by,granted_at,verified_at,must_change,credential_expires_at) SELECT id,?,?,?,?,?,1,? FROM users WHERE email=?',body.case_id,body.relationship,session.user_id,at,at,expires,email],
   ['INSERT INTO audit(user_id,event,occurred_at) VALUES(?,?,?)',session.user_id,'patient_access_granted '+email+' '+body.case_id+' '+body.relationship,at]
  ]);
  const login=await get("SELECT upper(alias) AS id FROM login_aliases l JOIN users u ON u.id=l.user_id WHERE u.email=? AND alias NOT LIKE '%@%' LIMIT 1",email);return json({email,login_id:login?.id,case_id:body.case_id,temporary_password,expires_at:new Date(expires).toISOString(),must_change:true},201);
 }
 const match=path.match(/^\/api\/accounts\/(\d+)\/(revoke|reissue)$/);
 if(match&&method==='POST'){
  staff();const id=Number(match[1]);const target=await get('SELECT id,email,role FROM users WHERE id=?',id);if(!target||target.role!=='patient')err(404,'Patient or relative account not found.');
  const grant=await get('SELECT * FROM account_access WHERE user_id=?',id);const link=await get('SELECT case_id FROM access WHERE user_id=?',id);
  if(!grant&&!link)err(409,'No admission access is linked to this account.');
  if(grant?.revoked_at)err(409,'This account is already revoked.');
  const at=now();
  if(match[2]==='revoke'){
   if(body.confirmed!==true||!text(body.reason,300))err(400,'Confirm revocation and provide an operational reason.');
   const commands=grant?[['UPDATE account_access SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL',at,session.user_id,id]]:[['INSERT INTO account_access(user_id,case_id,relationship,granted_by,granted_at,revoked_at,revoked_by,must_change) VALUES(?,?,?,?,?,?,?,0)',id,link.case_id,'prototype',session.user_id,at,at,session.user_id]];
   commands.push(['DELETE FROM access WHERE user_id=?',id],['DELETE FROM sessions WHERE user_id=?',id],['INSERT INTO audit(user_id,event,occurred_at) VALUES(?,?,?)',session.user_id,'patient_access_revoked '+id+' '+body.reason.trim(),at]);await batch(commands);return json({ok:true});
  }
  verified();if(!grant)err(409,'Reissue is available for newly provisioned accounts.');
  if(await get('SELECT case_id FROM departures WHERE case_id=?',grant.case_id))err(409,'Temporary credentials cannot be reissued for a departed admission.');
  const temporary_password=random().slice(0,24).toUpperCase().match(/.{1,6}/g).join('-');const salt=random();const hash=salt+':'+await derive(temporary_password,salt);const expires=Date.now()+7200000;
  const results=await batch([
   ['UPDATE users SET password_hash=? WHERE id=? AND EXISTS(SELECT 1 FROM account_access WHERE user_id=? AND revoked_at IS NULL)',hash,id,id],
   ['UPDATE account_access SET must_change=1,credential_expires_at=?,verified_at=? WHERE user_id=? AND revoked_at IS NULL',expires,at,id],
   ['DELETE FROM sessions WHERE user_id=?',id],
   ['INSERT INTO audit(user_id,event,occurred_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM account_access WHERE user_id=? AND revoked_at IS NULL)',session.user_id,'temporary_credentials_reissued '+id,at,id]
  ]);if(!results[0].meta.changes)err(409,'Access changed. Refresh before trying again.');
  const login=await get("SELECT upper(alias) AS id FROM login_aliases WHERE user_id=? AND alias NOT LIKE '%@%' LIMIT 1",id);return json({email:target.email,login_id:login?.id,case_id:grant.case_id,temporary_password,expires_at:new Date(expires).toISOString(),must_change:true});
 }
 if(path==='/api/password'&&method==='POST'){
  if(session.role!=='patient'||!session.must_change)err(403,'This password step is only for an account using temporary credentials.');
  if(typeof body.current_password!=='string'||body.current_password.length>256||typeof body.new_password!=='string'||body.new_password.length<12||body.new_password.length>128||body.confirm_password!==body.new_password)err(400,'Enter the temporary password and matching new passwords of 12 to 128 characters.');
  const u=await get('SELECT password_hash FROM users WHERE id=?',session.user_id);const [oldSalt,oldHash]=u.password_hash.split(':');
  if(await derive(body.current_password,oldSalt)!==oldHash)err(400,'The temporary password is incorrect.');
  if(body.current_password===body.new_password)err(400,'Choose a password different from the temporary password.');
  const salt=random();const hash=salt+':'+await derive(body.new_password,salt);const at=now();
  const guard='EXISTS(SELECT 1 FROM users u JOIN account_access g ON g.user_id=u.id WHERE u.id=? AND u.password_hash=? AND g.must_change=1 AND g.revoked_at IS NULL AND g.credential_expires_at>?)';const args=[session.user_id,u.password_hash,Date.now()];
  const results=await batch([
   ['INSERT INTO audit(user_id,event,occurred_at) SELECT ?,?,? WHERE '+guard,session.user_id,'temporary_password_replaced',at,...args],
   ['UPDATE account_access SET must_change=0,credential_expires_at=NULL,password_changed_at=? WHERE user_id=? AND '+guard,at,session.user_id,...args],
   // The successful metadata update gates replacement of the credential.
   ['UPDATE users SET password_hash=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM account_access WHERE user_id=? AND revoked_at IS NULL AND password_changed_at=?)',hash,session.user_id,u.password_hash,session.user_id,at],
   ['DELETE FROM sessions WHERE user_id=?',session.user_id]
  ]);
  if(!results[2].meta.changes)err(409,'Access or credentials changed. Sign in again or ask the coordinator for help.');
  return json({ok:true,sign_in_required:true},200,{'Set-Cookie':'df_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
 }
 return null;
}
