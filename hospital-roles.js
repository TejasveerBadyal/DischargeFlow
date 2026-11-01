// Fictional demonstration accounts contain salted hashes, never plaintext passwords.
const ACCOUNTS=[["admin", "Platform administrator", "admin", null, "ab214a2b1717cfc7a0aa756667d17eec2e1e12a5f5c510009a727fcecd3d41dc:b5bcf3c9bc2f3bdccf73fceaa6db2ffe3a34ea6d2e037551e8f988537d255022"], ["cedar.staff", "Cedar coordinator", "coordinator", 1, "93c78efa97c7b4e1905a5ceee37d8e36a0367f380d5e0219be9c5366ff57c322:b3871576ae8181913ac00f8e1b34968121735a5e40ee9a5f0ca45cafd54c0126"], ["cedar.patient", "Cedar patient / relative", "patient", 1, "e77370132eba28dc990b4e8d339a725f494d03ccde7b0bd460fa3a552cc541f2:b3a3deea876912ec21a2d228e849972c2d2986753b8806a8de39937bd41528b3"], ["harbor.staff", "Harbor coordinator", "coordinator", 2, "fed5c82c54ce1344dd17827e305ea75854d2874ec5fe05eb4785d474e99bdd0f:c3b3dc12b34017b6541498f3c52f2c4f71397aa8c6a54db7fe4c6d77db9d284a"], ["harbor.patient", "Harbor patient / relative", "patient", 2, "39bb87cedbb005405acd8d51dd16e9df5a29c5305e4652ab16edef499bffcbf8:abc26cdd982ea449080f62305964e0fc956e40674c95163a391a0e8e2a45758a"], ["northgate.staff", "Northgate coordinator", "coordinator", 3, "465575bae6d1b115d769e22f4af0dd3a0c66dceecfdc4d866b2ec9a72c19ed21:1e354c2d596d3e0af0fbde2f4508a3c278c4798317c108ca9b92c3b0e3b2fe28"], ["northgate.patient", "Northgate patient / relative", "patient", 3, "9b1034862e8ba4363afb3f2d286f806c8854a15347b7fa55a59cbeaf3a6ee0f3:46652be3b8db4f0b0455ef398bf8daeb9db4740f7a6204a42f23a52742a3eada"], ["sunrise.staff", "Sunrise coordinator", "coordinator", 4, "a03fbea281cb77d5eb076158afbd79657558c8ace04a6b6811cc50238f2a635c:7712df233fb5dc892fd9ea209e6e92c11c80a3fad401ce5ae2c4feb409dd638c"], ["sunrise.patient", "Sunrise patient / relative", "patient", 4, "ba376c69869465e77911433583d75f2885a78b5e90dc85da73043fc686a7ea30:a6782d7977e1b8df1ee9143c106ed27d248e4e3de4bec6dec49716c0a6529b5b"]];
export async function ensureHospitalRoles({get,batch,now}){
 const key='four-hospital-roles-v1';if(await get('SELECT key FROM sample_batches WHERE key=?',key))return;const at=now();
 const commands=[['INSERT OR IGNORE INTO sample_batches VALUES(?,?)',key,at],['INSERT OR IGNORE INTO hospitals VALUES(?,?,?,?,?,?)',4,'Sunrise Community Hospital (fictional)','West District','Fictional campus, West District',1,at]];
 for(const [i,name,specialty]of[[10,'Dr. Kavya Das','General medicine'],[11,'Dr. Sameer Roy','Cardiology'],[12,'Dr. Leena Paul','Orthopaedics']])commands.push(['INSERT OR IGNORE INTO doctors VALUES(?,?,?,?,?,?,?)',i,4,name+' (fictional)',specialty,'Outpatient clinic',1,at]);
 commands.push(["UPDATE users SET hospital_id=1 WHERE role='coordinator' AND hospital_id IS NULL"],["UPDATE cases SET hospital_id=1 WHERE hospital_id IS NULL"]);
 // Distribute only the existing labelled synthetic cohort; no workflow histories change.
 commands.push(["UPDATE cases SET hospital_id=((CAST(substr(id,10) AS INTEGER)-100201)%4)+1 WHERE id GLOB 'IPD-2026-1002[0-9][0-9]'"]);
 for(const [login,name,role,hospital,hash]of ACCOUNTS){
  const email=login+'@dischargeflow.test';commands.push(['INSERT OR IGNORE INTO users(email,name,password_hash,role,hospital_id) VALUES(?,?,?,?,?)',email,name,hash,role,hospital],['INSERT OR IGNORE INTO login_aliases(alias,user_id) SELECT ?,id FROM users WHERE email=?',login,email]);
 }
 const steps=[['Discharge documentation','Treating team'],['Pharmacy clearance','Pharmacy'],['Final billing','Billing'],['Insurance authorisation','Insurance desk'],['Final checks','Discharge coordinator']];
 for(let h=1;h<=4;h++){
  const staff=ACCOUNTS.find(a=>a[2]==='coordinator'&&a[3]===h)[0]+'@dischargeflow.test';
  commands.push(['INSERT OR IGNORE INTO hospital_alert_settings SELECT ?,settings FROM alert_settings WHERE id=1',h]);
  for(let n=1;n<=4;n++){
   const id=`H${h}-2026-${String(n).padStart(3,'0')}`,insured=n%2===1;const ago=m=>new Date(Date.parse(at)-m*60000).toISOString();
   commands.push(['INSERT OR IGNORE INTO cases(id,display_name,ward,pathway,cleared_at,hospital_id) VALUES(?,?,?,?,?,?)',id,`Fictional hospital ${h} patient ${n}`,`Ward ${n} / Bed ${h}${n}`,insured?'insured':'cash',ago(240-n*20),h],['INSERT OR IGNORE INTO case_clearance VALUES(?,?)',id,'Fictional authorised clinician']);
   const states=n===1?['complete','complete','complete','pending','pending']:n===2?['complete','processing','pending','not_applicable','pending']:n===3?['pending','pending','pending','pending','pending']:['complete','complete','complete','not_applicable','complete'];
   steps.forEach(([label,owner],i)=>commands.push(['INSERT OR IGNORE INTO tasks VALUES(?,?,?,?,?,?)',id,i,label,owner,states[i],ago(20)]));
   commands.push(['INSERT INTO task_events(case_id,user_id,action,note,occurred_at) SELECT ?,id,?,?,? FROM users WHERE email=?',id,'fictional_sample_created','Fictional starting snapshot; earlier actions are not reconstructed.',at,staff]);
   if(n===1)commands.push(['INSERT OR IGNORE INTO insurance_receipts(case_id,received_at,reference,insurer_name,recorded_by,recorded_at) SELECT ?,?,?,?,id,? FROM users WHERE email=?',id,ago(190),'FICTIONAL-H'+h,'Fictional assurance provider',at,staff]);
   if(n===4)commands.push(['INSERT OR IGNORE INTO departures(case_id,departed_at,recorded_at,user_id,note) SELECT ?,?,?,id,? FROM users WHERE email=?',id,ago(10),at,'Fictional completed admission',staff]);
  }
  commands.push(['INSERT OR IGNORE INTO access(user_id,case_id) SELECT id,? FROM users WHERE email=?',`H${h}-2026-001`,ACCOUNTS.find(a=>a[2]==='patient'&&a[3]===h)[0]+'@dischargeflow.test']);
 }
 for(let h=1;h<=4;h++){
  const patient=ACCOUNTS.find(a=>a[2]==='patient'&&a[3]===h)[0]+'@dischargeflow.test',staff=ACCOUNTS.find(a=>a[2]==='coordinator'&&a[3]===h)[0]+'@dischargeflow.test',id=`H${h}-2026-001`,doctor=(h-1)*3+1;
  for(const [status,offset]of[['missed',-1440],['requested',1440]]){
   const time=new Date(Date.parse(at)+offset*60000).toISOString(),note='Fictional '+status+' appointment snapshot / hospital '+h;
   commands.push(['INSERT INTO appointment_requests(case_id,requested_by,department,preferred_at,confirmed_at,clinician,status,note,staff_note,updated_at,hospital_id,doctor_id) SELECT ?,u.id,d.specialty,?,?,d.name,?,?,?,?,?,d.id FROM users u JOIN doctors d ON d.id=? WHERE u.email=?',id,time,status==='missed'?time:null,status,note,'Fictional snapshot; no actual visit or attendance verification occurred.',at,h,doctor,patient]);
   commands.push(['INSERT INTO appointment_events(appointment_id,user_id,action,note,occurred_at) SELECT a.id,u.id,?,?,? FROM appointment_requests a JOIN users u ON u.email=? WHERE a.case_id=? AND a.note=?','fictional_snapshot','Synthetic starting snapshot, not a record of real actions.',at,staff,id,note]);
  }
  commands.push(['INSERT INTO support_tickets(case_id,requested_by,category,issue,description,reference,state,owner,updated_at) SELECT ?,id,?,?,?,?,?,?,? FROM users WHERE email=?',id,'billing','itemised','Fictional request for an itemised bill. No real charges or payment.','SAMPLE-H'+h,'open','Billing desk',at,patient]);
 }
 await batch(commands);
}
