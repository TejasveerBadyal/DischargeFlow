export const isStaff=session=>['admin','coordinator'].includes(session.role);
// Scoped read views apply to every operational module, including ID lookups
// used to authorise mutations. Write endpoints must validate targets through get().
export function scopedReads(session,{get,all}){
 const id=session.role==='coordinator'?session.hospital_id:session.scope_hospital_id;
 if(session.role!=='coordinator'&&!id)return{get,all};
 if(!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('A valid hospital assignment is required.'),{code:403});
 const tables=['tasks','task_holds','task_events','case_clearance','departures','insurance_receipts','insurance_workflows','insurance_contact_events','case_preparations','access','account_access','help_threads','support_tickets','mock_events','appointment_requests'];
 const definitions=[`cases AS (SELECT * FROM main.cases WHERE hospital_id=${id})`,...tables.map(t=>`${t} AS (SELECT * FROM main.${t} WHERE case_id IN(SELECT id FROM cases))`),`appointment_events AS (SELECT * FROM main.appointment_events WHERE appointment_id IN(SELECT id FROM appointment_requests))`,`help_messages AS (SELECT * FROM main.help_messages WHERE thread_id IN(SELECT id FROM help_threads))`,`support_replies AS (SELECT * FROM main.support_replies WHERE ticket_id IN(SELECT id FROM support_tickets))`];
 const prefix='WITH '+definitions.join(',')+' ';
 return{get:(sql,...args)=>get(prefix+sql,...args),all:(sql,...args)=>all(prefix+sql,...args)};
}
