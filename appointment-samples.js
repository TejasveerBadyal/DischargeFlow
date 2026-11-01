// Explicitly loaded fictional attendance snapshots, never fabricated live insurer/doctor activity.
export async function loadAppointmentExamples({get,batch,now}){
 const key='appointment-attendance-examples-v1';if(await get('SELECT key FROM sample_batches WHERE key=?',key))return false;
 const at=now(),base=Date.parse(at),ago=m=>new Date(base-m*60000).toISOString();const commands=[['INSERT OR IGNORE INTO sample_batches VALUES(?,?)',key,at]];
 for(const [n,status,minutes,doctorId]of [[1,'missed',60,1],[2,'attended',90,2],[3,'confirmed',30,3]]){
  const d=await get('SELECT d.*,h.name AS hospital_name FROM doctors d JOIN hospitals h ON h.id=d.hospital_id WHERE d.id=?',doctorId);if(!d||!await get('SELECT id FROM cases WHERE id=?','DF-104'))continue;
  const note='Fictional attendance example '+n+' / '+key;const time=ago(minutes);
  commands.push(["INSERT INTO appointment_requests(case_id,requested_by,department,preferred_at,confirmed_at,clinician,location,status,note,staff_note,updated_at,hospital_id,doctor_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM appointment_requests WHERE note=?)",'DF-104',2,d.specialty,time,time,d.name,d.clinic,status,note,'Fictional starting snapshot. No real visit or attendance verification occurred.',at,d.hospital_id,d.id,note]);
  commands.push(["INSERT INTO appointment_events(appointment_id,user_id,action,note,occurred_at) SELECT id,1,'fictional_snapshot',?,? FROM appointment_requests a WHERE note=? AND NOT EXISTS(SELECT 1 FROM appointment_events e WHERE e.appointment_id=a.id AND e.action='fictional_snapshot')",'Fictional '+status+' example; earlier events are not reconstructed.',at,note]);
 }
 await batch(commands);return true;
}
