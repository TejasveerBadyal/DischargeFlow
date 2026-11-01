import {loadAppointmentExamples} from './appointment-samples.js';
// Appointment coordination uses a fictional directory and manual availability checks.
export const DEPARTMENTS=['General medicine','Cardiology','Orthopaedics','Other follow-up'];
export const PREPARATION=[['belongings','I have checked my personal belongings.'],['transport','I have arranged transport or asked staff for assistance.'],['questions','I have prepared questions for the hospital team.']];
export async function followupRoute(ctx){
 const{path,method,body,session,get,all,batch,json,err,now}=ctx;const staff=['admin','coordinator'].includes(session.role);
 const linked=async()=>{const a=await get('SELECT case_id FROM access WHERE user_id=?',session.user_id);if(!a)err(403,'No admission is linked.');return a.case_id;};
 const text=(s,n)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=n;
 const future=s=>{const n=Date.parse(s);return Number.isFinite(n)&&n>Date.now()+5*60000&&n<Date.now()+366*86400000;};
 const selection=async(hospital,doctor)=>{if(!Number.isInteger(hospital)||!Number.isInteger(doctor))err(400,'Select a hospital and doctor.');const d=await get('SELECT d.*,h.name AS hospital_name FROM doctors d JOIN hospitals h ON h.id=d.hospital_id WHERE d.id=? AND d.hospital_id=? AND d.active=1 AND h.active=1',doctor,hospital);if(!d)err(409,'That doctor is unavailable in the selected active hospital. Refresh the directory.');return d;};
 if(path==='/api/preparation'){
  if(staff)err(403,'Patient access required.');const id=await linked();
  if(method==='GET'){const rows=await all('SELECT * FROM case_preparations WHERE case_id=?',id);return json({items:PREPARATION.map(([key,label])=>({key,label,done:!!rows.find(r=>r.item_key===key)?.is_done}))});}
  if(method==='POST'){if(!PREPARATION.some(([key])=>key===body.key)||typeof body.done!=='boolean')err(400,'Choose a valid preparation item.');await batch([['INSERT INTO case_preparations VALUES(?,?,?,?,?) ON CONFLICT(case_id,item_key) DO UPDATE SET is_done=excluded.is_done,updated_by=excluded.updated_by,updated_at=excluded.updated_at',id,body.key,body.done?1:0,session.user_id,now()]]);return json({ok:true});}
 }
 if(path==='/api/appointments/examples'&&method==='POST'){if(!staff||session.role==='coordinator'&&session.hospital_id!==1)err(403,'These legacy examples belong to Cedar Valley Hospital.');return json({created:await loadAppointmentExamples({get,batch,now})});}
 if(path==='/api/appointments'&&method==='GET'){
  const id=staff?null:await linked();const query='SELECT a.*,c.display_name,u.name AS requester,h.name AS hospital_name,d.name AS directory_doctor_name FROM appointment_requests a JOIN cases c ON c.id=a.case_id JOIN users u ON u.id=a.requested_by LEFT JOIN hospitals h ON h.id=a.hospital_id LEFT JOIN doctors d ON d.id=a.doctor_id';
  const rows=await all(query+(staff?'':' WHERE a.case_id=?')+' ORDER BY a.updated_at DESC,a.id DESC',...(staff?[]:[id]));
  return json({departments:DEPARTMENTS,appointments:rows.map(r=>({...r,can_cancel:staff||r.requested_by===session.user_id&&!(r.status==='confirmed'&&Date.parse(r.confirmed_at)<=Date.now()),can_reschedule:r.requested_by===session.user_id&&['missed','cancelled','declined'].includes(r.status),attendance_review_due:r.status==='confirmed'&&Date.parse(r.confirmed_at)<=Date.now()})),manual_confirmation:true});
 }
 if(path==='/api/appointments'&&method==='POST'){
  if(staff)err(403,'Use a linked patient account to request an appointment.');const id=await linked();const d=await selection(body.hospital_id,body.doctor_id);
  if(!future(body.preferred_at)||typeof body.note!=='string'||body.note.length>300)err(400,'Choose a preferred time at least five minutes ahead, within one year, and keep notes to 300 characters.');const preferred=new Date(Date.parse(body.preferred_at)).toISOString();
  let parent=null;if(body.rescheduled_from!==undefined&&body.rescheduled_from!==null){if(!Number.isInteger(body.rescheduled_from))err(400,'Invalid rescheduling reference.');parent=await get('SELECT * FROM appointment_requests WHERE id=?',body.rescheduled_from);if(!parent||parent.case_id!==id||parent.requested_by!==session.user_id||!['missed','cancelled','declined'].includes(parent.status))err(409,'Reschedule one of your missed, cancelled or declined visits.');}
  if((await get("SELECT COUNT(*) n FROM appointment_requests WHERE requested_by=? AND status IN('requested','confirmed')",session.user_id)).n>=5)err(409,'You already have five open requests. Cancel an unused request or contact the coordinator.');
  if(await get("SELECT id FROM appointment_requests WHERE case_id=? AND department=? AND preferred_at=? AND status IN('requested','confirmed')",id,d.specialty,preferred))err(409,'This admission already has that appointment request.');
  const at=now();try{await batch([
   ['INSERT INTO appointment_requests(case_id,requested_by,department,preferred_at,status,note,updated_at,hospital_id,doctor_id,clinician,rescheduled_from) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,session.user_id,d.specialty,preferred,'requested',body.note.trim(),at,d.hospital_id,d.id,d.name,parent?.id||null],
   ["INSERT INTO appointment_events(appointment_id,user_id,action,note,occurred_at) SELECT id,?,?,?,? FROM appointment_requests WHERE case_id=? AND preferred_at=? AND doctor_id=? AND requested_by=? AND status='requested' ORDER BY id DESC LIMIT 1",session.user_id,parent?'reschedule_requested':'requested',d.hospital_name+' / '+d.name+(parent?' / from APPT-'+parent.id:''),at,id,preferred,d.id,session.user_id]
  ]);}catch(e){if(/unique|constraint/i.test(e.message))err(409,'That request already exists. Refresh the list.');throw e;}return json({ok:true,status:'requested'},201);
 }
 const match=path.match(/^\/api\/appointments\/(\d+)(?:\/(history))?$/);if(!match)return null;
 const id=Number(match[1]),a=await get('SELECT * FROM appointment_requests WHERE id=?',id);if(!a||!staff&&a.case_id!==await linked())err(404,'Appointment request not found.');
 if(match[2]==='history'&&method==='GET')return json({events:await all('SELECT e.*,u.name AS actor FROM appointment_events e JOIN users u ON u.id=e.user_id WHERE appointment_id=? ORDER BY e.id',id)});
 if(match[2]||method!=='POST')return null;
 if(!staff&&a.requested_by!==session.user_id)err(404,'Appointment request not found.');
 if(a.updated_at!==body.expected_updated_at)err(409,'This request changed. Refresh before trying again.');
 if(!['requested','confirmed'].includes(a.status))err(409,'This request is closed. Create a new request if needed.');
 if(body.action==='cancel'&&!staff&&a.status==='confirmed'&&Date.parse(a.confirmed_at)<=Date.now())err(409,'A past visit needs staff attendance review. Contact the coordinator.');
 const attendance=['attended','missed'].includes(body.action);
 if(!['confirm','decline','cancel','attended','missed'].includes(body.action)||!staff&&body.action!=='cancel')err(403,'Only hospital staff can confirm or record attendance.');
 if(attendance&&(a.status!=='confirmed'||Date.parse(a.confirmed_at)>Date.now()||body.attendance_confirmed!==true||!text(body.staff_note,300)))err(400,'After the appointment time, verify attendance and enter a factual note before marking attended or missed.');
 if(['confirm','decline'].includes(body.action)&&a.status!=='requested')err(409,'Only pending requests can be confirmed or declined.');
 const confirm=body.action==='confirm';let doctor=null;
 if(confirm){doctor=await selection(body.hospital_id??a.hospital_id,body.doctor_id??a.doctor_id);if(a.hospital_id&&doctor.hospital_id!==a.hospital_id)err(409,'Confirm within the requested hospital, or ask the patient to submit a new request.');if(a.doctor_id&&doctor.id!==a.doctor_id&&!text(body.staff_note,300))err(400,'Explain a change of doctor in the patient-visible reply.');if(!future(body.confirmed_at)||!text(body.location,120)||body.availability_confirmed!==true)err(400,'Verify hospital availability, then enter location and a future appointment time.');}
 if(body.staff_note!==undefined&&(typeof body.staff_note!=='string'||body.staff_note.length>300))err(400,'Keep the operational note to 300 characters.');if(body.action==='decline'&&!text(body.staff_note,300))err(400,'Explain why the request cannot be confirmed.');
 const time=confirm?new Date(Date.parse(body.confirmed_at)).toISOString():a.confirmed_at,clinician=doctor?.name||a.clinician,location=confirm?body.location.trim():a.location;
 if(confirm&&await get("SELECT id FROM appointment_requests WHERE status='confirmed' AND doctor_id=? AND confirmed_at=? AND id<>?",doctor.id,time,id))err(409,'That doctor already has a confirmed appointment at this exact time in the prototype.');
 const status={confirm:'confirmed',decline:'declined',cancel:'cancelled',attended:'attended',missed:'missed'}[body.action];const at=new Date(Math.max(Date.now(),Date.parse(a.updated_at)+1)).toISOString();const note=staff?(body.staff_note?.trim()||''):a.staff_note;const guard='EXISTS(SELECT 1 FROM appointment_requests WHERE id=? AND updated_at=?)';
 try{const results=await batch([
  ['INSERT INTO audit(user_id,event,occurred_at) SELECT ?,?,? WHERE '+guard,session.user_id,'appointment_'+status+' '+id,at,id,a.updated_at],
  ['INSERT INTO appointment_events(appointment_id,user_id,action,note,occurred_at) SELECT ?,?,?,?,? WHERE '+guard,id,session.user_id,status,body.staff_note?.trim()||(status==='cancelled'?'Cancelled by account holder':clinician+' / '+time),at,id,a.updated_at],
  ['UPDATE appointment_requests SET status=?,confirmed_at=?,clinician=?,location=?,staff_note=?,updated_at=?,hospital_id=?,doctor_id=? WHERE id=? AND updated_at=?',status,time,clinician,location,note,at,doctor?.hospital_id||a.hospital_id,doctor?.id||a.doctor_id,id,a.updated_at]
 ]);if(!results.at(-1).meta.changes)err(409,'This request changed. Refresh the list.');}catch(e){if(/unique|constraint/i.test(e.message))err(409,'That confirmed time is already assigned to this doctor.');throw e;}
 return json({ok:true,status});
}
