// Adds a fixed fictional cohort once; never replaces existing cases or passwords.
export async function ensureSampleCohort({get,batch,now}){
 const key='fictional-cohort-2026-01';if(await get('SELECT key FROM sample_batches WHERE key=?',key))return;
 const at=now();const base=Date.parse(at);const ago=m=>new Date(base-m*60000).toISOString();
 const commands=[['INSERT OR IGNORE INTO sample_batches VALUES(?,?)',key,at]];
 const legacy=[['coordinator@demo.local','STAFF-000001','coordinator@dischargeflow.test'],['family@demo.local','REL-000002','relative@dischargeflow.test'],['patient@demo.local','PAT-000003','patient@dischargeflow.test']];
 for(const[email,id,alias]of legacy)for(const name of[id,alias])commands.push(['INSERT OR IGNORE INTO login_aliases(alias,user_id) SELECT ?,id FROM users WHERE email=?',name.toLowerCase(),email]);
 const names=['Aarav Mehta','Ananya Kapoor','Kabir Sharma','Diya Malhotra','Rohan Verma','Ishita Rao','Arjun Nair','Meera Sethi','Dev Khanna','Sana Mir','Vihaan Shah','Tara Gill','Aditya Sen','Naina Joshi','Reyansh Gupta','Aisha Khan','Vivaan Bansal','Avni Desai','Krish Patel','Myra Anand','Atharv Menon','Kiara Bose','Samar Arora','Riya Suri','Neil Dutta','Sara Thomas','Ishan Bedi','Zoya Ali','Dhruv Saxena','Anika Roy'];
 const definitions=[['Discharge documentation','Treating team'],['Pharmacy clearance','Pharmacy'],['Final billing','Billing'],['Insurance authorisation','Insurance desk'],['Final checks','Discharge coordinator']];
 for(let n=0;n<30;n++){
  const id='IPD-2026-'+(100201+n);const insured=n%2===0;const kind=n%10;const departed=n>=25;const cleared=ago(insured&&kind===0?300:80+n*5);
  let states=kind===0?['complete','complete','complete','pending','pending']:kind===1?['complete','processing','pending','not_applicable','pending']:kind===2?['complete','complete','processing','pending','pending']:kind===3?['processing','pending','pending','not_applicable','pending']:kind===4?['complete','complete','complete','complete','processing']:['pending','pending','pending',insured?'pending':'not_applicable','pending'];
  if(!insured)states[3]='not_applicable';if(departed)states=states.map((_,i)=>i===3&&!insured?'not_applicable':'complete');
  commands.push(['INSERT OR IGNORE INTO cases(id,display_name,ward,pathway,cleared_at) VALUES(?,?,?,?,?)',id,names[n],['North Wing','South Wing','East Wing'][n%3]+' · Ward '+(1+n%4)+' · Bed '+String(11+n).padStart(2,'0'),insured?'insured':'cash',cleared],['INSERT OR IGNORE INTO case_clearance VALUES(?,?)',id,'Fictional treating clinician']);
  definitions.forEach(([label,owner],i)=>commands.push(['INSERT OR IGNORE INTO tasks VALUES(?,?,?,?,?,?)',id,i,label,owner,states[i],ago(departed?30:20+(n%4)*10)]));
  commands.push(['INSERT INTO task_events(case_id,user_id,action,note,occurred_at) SELECT ?,1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM task_events WHERE case_id=?)',id,'fictional_sample_created','Synthetic sample for hackathon demonstration. Earlier workflow actions are not reconstructed.',at,id]);
  if(insured&&kind===0){commands.push(['INSERT OR IGNORE INTO insurance_receipts VALUES(?,?,?,?,?,?)',id,ago(220),'ACK-2026-'+(7100+n),'Cedar Health Assurance (fictional)',1,at]);}
  if(insured&&kind===4)commands.push(['INSERT OR IGNORE INTO insurance_receipts VALUES(?,?,?,?,?,?)',id,ago(60),'ACK-2026-'+(7100+n),'Cedar Health Assurance (fictional)',1,at]);
  if(departed)commands.push(['INSERT OR IGNORE INTO departures VALUES(?,?,?,?,?)',id,ago(15),at,1,'Fictional historical discharge record.']);
 }
 // One atomic batch prevents duplicate cohorts if two coordinators open the page together.
 await batch(commands);
}
