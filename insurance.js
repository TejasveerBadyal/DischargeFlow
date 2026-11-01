export const INSURANCE_SOURCE='https://actuariesindia.org/sites/default/files/inline-files/5.%20Master%20Circular%20on%20Health%20Insurance%20Business%202024.pdf';
export const TIMELINE_SOURCE='https://www.pib.gov.in/newsite/erelcontent.aspx?lang=2&reg=48&relid=286915';
export const RIGHTS_TEXT='For cashless discharge, IRDAI’s 29 May 2024 circular sets a three-hour final-authorisation timeline from the insurer’s receipt of the hospital’s request. It says additional hospital charges arising from delay beyond this window are to be borne by the insurer. This is not an automatic cash payout or claim approval. Ask the insurance desk to verify receipt time, applicable charges and policy details. Keep the request acknowledgement and itemised bill.';
export function insuranceStatus(c,tasks,receipt,clock=Date.now()){
 const base={source:INSURANCE_SOURCE,timeline_source:TIMELINE_SOURCE,checked_on:'2026-10-31',threshold_minutes:180};
 if(c.pathway!=='insured')return{...base,status:'not_applicable',phase:'not_applicable',notify:false};
 if(!receipt)return{...base,status:'unverified',phase:'unverified',notify:false};
 const task=tasks.find(t=>t.position===3);const approved=task?.status==='complete';const end=approved?Date.parse(task.updated_at):clock;const start=Date.parse(receipt.received_at);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return{...base,status:'needs_review',phase:'needs_review',notify:false};
 const late=end-start>180*60000;
 return{...base,status:approved?(late?'approved_late':'approved_on_time'):(late?'overdue':'pending'),phase:approved?'authorised':'awaiting_insurer',notify:late,elapsed_minutes:Math.floor((end-start)/60000),received_at:receipt.received_at,deadline:new Date(start+180*60000).toISOString(),reference:receipt.reference,insurer_name:receipt.insurer_name,recorded_at:receipt.recorded_at,authorised_at:approved?task.updated_at:null,rights_text:late?RIGHTS_TEXT:null};
}
export async function insuranceRoute(ctx){
 const{path,method,body,session,get,batch,json,err,now,tasks}=ctx;const match=path.match(/^\/api\/cases\/([A-Za-z0-9-]+)\/insurance-receipt$/);if(!match||method!=='POST')return null;
 if(!['admin','coordinator'].includes(session.role))err(403,'Coordinator access required.');
 const id=match[1];const c=await get('SELECT * FROM cases WHERE id=?',id);if(!c)err(404,'Case not found.');if(c.pathway!=='insured')err(409,'This is not a cashless insured case.');if(await get('SELECT case_id FROM departures WHERE case_id=?',id))err(409,'Departed records are read-only.');
 const ts=await tasks(id);if(ts.slice(0,3).some(t=>t.status!=='complete'))err(409,'Complete documentation, pharmacy and billing before recording receipt of the final request.');
 const date=Date.parse(body.received_at);if(!Number.isFinite(date)||date<Date.parse(c.cleared_at)||date>Date.now()||body.receipt_confirmed!==true||typeof body.reference!=='string'||!body.reference.trim()||body.reference.length>100||typeof body.insurer_name!=='string'||!body.insurer_name.trim()||body.insurer_name.length>100)err(400,'Record a verified insurer receipt time, acknowledgement reference and insurer/TPA name. The time must be after clearance and no later than now.');
 const prior=await get('SELECT * FROM insurance_receipts WHERE case_id=?',id);if(prior&&(body.expected_recorded_at!==prior.recorded_at||typeof body.correction_reason!=='string'||!body.correction_reason.trim()||body.correction_reason.length>300))err(409,'To correct a receipt, refresh it and provide an operational correction reason. Do not reset the clock for queries.');
 if(ts[3].status==='complete'&&date>Date.parse(ts[3].updated_at))err(400,'Receipt cannot be later than the recorded final authorisation.');
 const at=new Date(Math.max(Date.now(),prior?Date.parse(prior.recorded_at)+1:0)).toISOString();
 const guard=prior?'EXISTS(SELECT 1 FROM insurance_receipts WHERE case_id=? AND recorded_at=?)':'NOT EXISTS(SELECT 1 FROM insurance_receipts WHERE case_id=?)';const args=prior?[id,prior.recorded_at]:[id];
 const commands=[['INSERT INTO task_events(case_id,user_id,action,note,occurred_at) SELECT ?,?,?,?,? WHERE '+guard,id,session.user_id,prior?'insurance_receipt_corrected':'insurance_receipt_recorded',`Receipt ${new Date(date).toISOString()} · ${body.reference.trim()}`+(prior?' · '+body.correction_reason.trim():''),at,...args]];
 commands.push(prior?['UPDATE insurance_receipts SET received_at=?,reference=?,insurer_name=?,recorded_by=?,recorded_at=? WHERE case_id=? AND recorded_at=?',new Date(date).toISOString(),body.reference.trim(),body.insurer_name.trim(),session.user_id,at,id,prior.recorded_at]:['INSERT INTO insurance_receipts VALUES(?,?,?,?,?,?)',id,new Date(date).toISOString(),body.reference.trim(),body.insurer_name.trim(),session.user_id,at]);
 const result=await batch(commands);if(!result.at(-1).meta.changes)err(409,'Receipt changed. Refresh the case.');return json({insurance:insuranceStatus(c,ts,{received_at:new Date(date).toISOString(),reference:body.reference.trim(),insurer_name:body.insurer_name.trim(),recorded_at:at})});
}
