export const ISSUE_CATEGORIES={billing:{label:'Billing and payments',issues:{itemised:'Need itemised bill',unexpected:'Unexpected or unclear charge',duplicate:'Possible duplicate charge',payment:'Payment not reflected',deposit:'Deposit adjustment',refund:'Refund status',package:'Package or tariff mismatch',pharmacy:'Pharmacy charge question',copay:'Co-pay / deductible clarification',other:'Other billing issue'}},insurance:{label:'Insurance / TPA',issues:{delay:'Final authorisation delay',query:'Insurer query or documents',coverage:'Coverage clarification',rejection:'Cashless rejection clarification',other:'Other insurance issue'}},documents:{label:'Discharge documents',issues:{summary:'Discharge summary request',invoice:'Invoice / receipt request',correction:'Document correction',other:'Other document issue'}},appointments:{label:'Follow-up appointment',issues:{request:'Help requesting a visit',change:'Change or cancel a visit',confirmation:'Confirmation not received',other:'Other appointment issue'}},discharge:{label:'Discharge coordination',issues:{status:'Pending task update',transport:'Transport coordination',accessibility:'Accessibility or assistance',other:'Other coordination issue'}},other:{label:'Something else',issues:{other:'Describe another non-urgent issue'}}};
export const SUPPORT_STATES={open:'Open',awaiting_patient:'Waiting for patient information',awaiting_billing:'Waiting for billing review',awaiting_insurance:'Waiting for insurance desk',resolved:'Resolved'};
export async function supportRoute(ctx){
 const{path,method,body,session,get,all,batch,json,err,now}=ctx;const staff=['admin','coordinator'].includes(session.role);
 if(path==='/api/support'&&method==='GET'){
  const query='SELECT t.*,c.display_name,u.name AS requester FROM support_tickets t JOIN cases c ON c.id=t.case_id JOIN users u ON u.id=t.requested_by';
  const rows=await all(query+(staff?'':' WHERE t.requested_by=?')+' ORDER BY t.updated_at DESC,t.id DESC',...(staff?[]:[session.user_id]));return json({categories:ISSUE_CATEGORIES,states:SUPPORT_STATES,tickets:rows});
 }
 if(path==='/api/support'&&method==='POST'){
  if(staff)err(403,'Use the linked patient view to open a ticket.');const a=await get('SELECT case_id FROM access WHERE user_id=?',session.user_id);if(!a)err(403,'No linked admission.');
  const cat=Object.hasOwn(ISSUE_CATEGORIES,body.category)?ISSUE_CATEGORIES[body.category]:null;if(!cat||!Object.hasOwn(cat.issues,body.issue)||typeof body.description!=='string'||!body.description.trim()||body.description.length>800||typeof body.reference!=='string'||body.reference.length>100)err(400,'Choose a valid issue and describe the non-urgent problem in up to 800 characters.');
  if((await get("SELECT COUNT(*) n FROM support_tickets WHERE requested_by=? AND state<>'resolved'",session.user_id)).n>=10)err(409,'You already have ten open tickets. Add a reply to an existing ticket.');
  const owner=body.category==='billing'?'Billing desk':body.category==='insurance'?'Insurance desk':'Discharge coordinator';
  await batch([['INSERT INTO support_tickets(case_id,requested_by,category,issue,description,reference,state,owner,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',a.case_id,session.user_id,body.category,body.issue,body.description.trim(),body.reference.trim(),'open',owner,now()]]);return json({ok:true},201);
 }
 const m=path.match(/^\/api\/support\/(\d+)$/);if(!m)return null;const id=Number(m[1]);const t=await get('SELECT * FROM support_tickets WHERE id=?',id);if(!t||(!staff&&t.requested_by!==session.user_id))err(404,'Ticket not found.');
 if(method==='GET')return json({ticket:t,replies:await all('SELECT r.id,r.text,r.created_at,u.name AS sender,u.role FROM support_replies r JOIN users u ON u.id=r.user_id WHERE ticket_id=? ORDER BY r.id',id)});
 if(method==='POST'){
  if(typeof body.text!=='string'||!body.text.trim()||body.text.length>1000)err(400,'Enter a reply up to 1,000 characters.');if(t.updated_at!==body.expected_updated_at)err(409,'This ticket changed. Refresh before replying.');
  const state=staff?body.state:'open';if(!Object.hasOwn(SUPPORT_STATES,state))err(400,'Choose a valid ticket status.');
  if(!staff&&t.state==='resolved')err(409,'This ticket is resolved. Open a new issue if the problem recurs.');
  const owner=staff&&typeof body.owner==='string'&&body.owner.trim()&&body.owner.length<=80?body.owner.trim():t.owner;
  const at=new Date(Math.max(Date.now(),Date.parse(t.updated_at)+1)).toISOString();const guard='EXISTS(SELECT 1 FROM support_tickets WHERE id=? AND updated_at=?)';
  const results=await batch([
   ['INSERT INTO support_replies(ticket_id,user_id,text,created_at) SELECT ?,?,?,? WHERE '+guard,id,session.user_id,body.text.trim(),at,id,t.updated_at],
   ['UPDATE support_tickets SET state=?,owner=?,updated_at=? WHERE id=? AND updated_at=?',state,owner,at,id,t.updated_at]
  ]);if(!results.at(-1).meta.changes)err(409,'This ticket changed. Refresh before replying.');return json({ok:true});
 }
 return null;
}
