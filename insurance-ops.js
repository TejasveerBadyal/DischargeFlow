export const INSURANCE_STAGES={preparing:'Preparing final request',submitted:'Submitted / awaiting review',query_received:'Insurer query received',response_sent:'Query response sent',escalated:'Escalated for follow-up',approved:'Final authorisation recorded',rejected:'Insurer rejection recorded'};
export const DELAY_REASONS={unknown:'Cause not yet verified',documents:'Missing or incomplete documents',query:'Insurer clarification request',bill:'Bill or package mismatch',coverage:'Coverage / policy review',external:'Insurer or TPA processing',technical:'Portal or technical issue',other:'Other verified cause'};
export async function insuranceOpsRoute(ctx){
 const{path,method,body,session,get,all,batch,json,err,now,tasks,activeCases}=ctx;const staff=['admin','coordinator'].includes(session.role);
 if(path==='/api/insurance-desk'&&method==='GET'){
  if(!staff)err(403,'Coordinator access required.');const workflows=await all('SELECT * FROM insurance_workflows');const events=await all('SELECT e.*,u.name AS actor FROM insurance_contact_events e JOIN users u ON u.id=e.user_id ORDER BY e.id DESC');
  return json({stages:INSURANCE_STAGES,reasons:DELAY_REASONS,cases:(await activeCases()).filter(c=>c.pathway==='insured').map(c=>({...c,workflow:workflows.find(w=>w.case_id===c.id)||null,contacts:events.filter(e=>e.case_id===c.id).slice(0,30)}))});
 }
 if(path==='/api/my-insurance'&&method==='GET'){
  if(staff)err(403,'Patient access required.');const a=await get('SELECT case_id FROM access WHERE user_id=?',session.user_id);if(!a)err(403,'No linked admission.');const c=await get('SELECT pathway FROM cases WHERE id=?',a.case_id);const w=await get('SELECT * FROM insurance_workflows WHERE case_id=?',a.case_id);
  return json({applicable:c.pathway==='insured',workflow:w?{stage:INSURANCE_STAGES[w.stage],delay_reason:DELAY_REASONS[w.delay_reason],cause_verified:!!w.cause_verified,owner:w.owner,next_followup_at:w.next_followup_at,public_update:w.public_update,updated_at:w.updated_at}:null});
 }
 const m=path.match(/^\/api\/insurance-desk\/([A-Za-z0-9-]+)$/);if(!m||method!=='POST')return null;if(!staff)err(403,'Coordinator access required.');const id=m[1];const c=await get('SELECT * FROM cases WHERE id=?',id);if(!c||c.pathway!=='insured')err(404,'Insured case not found.');if(await get('SELECT case_id FROM departures WHERE case_id=?',id))err(409,'Departed records are read-only.');
 const str=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
 if(body.action==='contact'){
  if(!['phone','email','portal','in_person'].includes(body.channel)||!['attempted','reached','no_response','response_received'].includes(body.outcome)||!str(body.contact_party,120)||!str(body.reference,100)||!str(body.note,500)||body.actual_contact_confirmed!==true)err(400,'Record an actual contact attempt, its channel, party, reference and factual outcome.');
  await batch([['INSERT INTO insurance_contact_events(case_id,user_id,channel,contact_party,reference,outcome,note,occurred_at) VALUES(?,?,?,?,?,?,?,?)',id,session.user_id,body.channel,body.contact_party.trim(),body.reference.trim(),body.outcome,body.note.trim(),now()]]);return json({ok:true},201);
 }
 if(body.action!=='workflow'||!Object.hasOwn(INSURANCE_STAGES,body.stage)||!Object.hasOwn(DELAY_REASONS,body.delay_reason)||!str(body.owner,80)||typeof body.public_update!=='string'||body.public_update.length>500)err(400,'Choose a stage, cause category, responsible owner and patient-facing update.');
 if(body.delay_reason!=='unknown'&&(body.cause_verified!==true||!str(body.evidence_reference,150)))err(400,'Verify the cause with evidence before recording it as established. Otherwise keep cause unknown.');
 const ts=await tasks(id);const receipt=await get('SELECT * FROM insurance_receipts WHERE case_id=?',id);
 if(body.stage!=='preparing'&&!receipt)err(409,'Record the verified insurer receipt in the case first.');
 if(body.stage==='approved'&&ts[3].status!=='complete')err(409,'Only record final authorisation after the insurance task is completed by staff.');
 if(body.stage!=='approved'&&ts[3].status==='complete')err(409,'The insurance task is already complete. Review its recorded authorisation.');
 let next=null;if(body.next_followup_at){const t=Date.parse(body.next_followup_at);if(!Number.isFinite(t)||t<=Date.now()||t>Date.now()+30*86400000)err(400,'Choose a future follow-up time within 30 days.');next=new Date(t).toISOString();}
 if(!['approved','rejected'].includes(body.stage)&&!next)err(400,'Set the next follow-up time so the case has an actionable next step.');
 const prior=await get('SELECT * FROM insurance_workflows WHERE case_id=?',id);if((prior?.updated_at||null)!==(body.expected_updated_at||null))err(409,'This insurance review changed. Refresh it.');
 const at=new Date(Math.max(Date.now(),prior?Date.parse(prior.updated_at)+1:0)).toISOString();const values=[body.stage,body.delay_reason,body.delay_reason==='unknown'?0:1,body.evidence_reference?.trim()||'',body.owner.trim(),next,body.public_update.trim(),session.user_id,at];
 const results=await batch([
  ['INSERT INTO task_events(case_id,user_id,action,note,occurred_at) SELECT ?,?,?,?,? WHERE '+(prior?'EXISTS(SELECT 1 FROM insurance_workflows WHERE case_id=? AND updated_at=?)':'NOT EXISTS(SELECT 1 FROM insurance_workflows WHERE case_id=?)'),id,session.user_id,'insurance_review_updated',body.stage+' / '+body.delay_reason,at,...(prior?[id,prior.updated_at]:[id])],
  prior?['UPDATE insurance_workflows SET stage=?,delay_reason=?,cause_verified=?,evidence_reference=?,owner=?,next_followup_at=?,public_update=?,updated_by=?,updated_at=? WHERE case_id=? AND updated_at=?',...values,id,prior.updated_at]:['INSERT INTO insurance_workflows VALUES(?,?,?,?,?,?,?,?,?,?)',id,...values]
 ]);if(!results.at(-1).meta.changes)err(409,'This review changed. Refresh it.');return json({ok:true});
}
