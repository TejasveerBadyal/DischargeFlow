// Operational admission history only. This is not an electronic medical record.
export async function caseHistoryRoute(ctx){
 const{path,method,session,get,all,json,err,tasks}=ctx;if(method!=='GET')return null;const m=path.match(/^\/api\/case-history(?:\/([A-Za-z0-9-]+))?$/);if(!m)return null;
 const staff=['admin','coordinator'].includes(session.role);let id=m[1];
 if(staff&&!id)return json({cases:await all('SELECT c.*,d.departed_at FROM cases c LEFT JOIN departures d ON d.case_id=c.id ORDER BY c.cleared_at DESC')});
 if(!staff){const a=await get('SELECT case_id FROM access WHERE user_id=?',session.user_id);if(!a||id&&id!==a.case_id)err(404,'Admission history not found.');id=a.case_id;}
 const c=await get('SELECT * FROM cases WHERE id=?',id);if(!c)err(404,'Admission history not found.');
 const events=await all('SELECT e.*,u.name AS actor FROM task_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.case_id=? ORDER BY e.id',id);
 const appointments=await all('SELECT a.id,a.department,a.status,a.preferred_at,a.confirmed_at,a.clinician,a.rescheduled_from,h.name AS hospital_name FROM appointment_requests a LEFT JOIN hospitals h ON h.id=a.hospital_id WHERE a.case_id=? ORDER BY a.id DESC',id);
 const ts=await tasks(id);return json({kind:'operational_history',case:{...c,departed_at:(await get('SELECT departed_at FROM departures WHERE case_id=?',id))?.departed_at||null},tasks:staff?ts:ts.map(({label,status,position,updated_at})=>({label,status,position,updated_at})),events:staff?events:events.map(({action,position,occurred_at})=>({action,position,occurred_at,actor:'Hospital team'})),appointments});
}
