const closed=s=>['complete','not_applicable'].includes(s);
export function assistantAnswer(c,tasks,message) {
 const q=message.toLowerCase();
 const base={case_id:c.id,as_of:new Date().toISOString(),latest_event:tasks.map(t=>t.updated_at).sort().at(-1),handoff:false};
 const reply=(answer,handoff=false)=>({...base,answer,handoff});
 if(/pain|breath|bleed|emergency|urgent|unwell|symptom|medicin|medication|dose|fever|vomit|treatment|diagnos/.test(q))return reply('I cannot assess symptoms or give treatment or medication advice. Contact your ward nurse or treating team directly now for medical or urgent concerns. This chatbot and the message inbox are not emergency channels.',true);
 if(/\b(?:df|ipd)-[a-z0-9-]+\b/i.test(message)&&![...message.matchAll(/\b(?:df|ipd)-[a-z0-9-]+\b/gi)].every(m=>m[0].toLowerCase()===c.id.toLowerCase()))return reply('I can only discuss the discharge case linked to your account. Please ask the coordinator about access to a different case.',true);
 if(/when|how long|estimate|eta|time left|what time|can i leave|can we leave|go home|ready to leave|leave now/.test(q))return reply('I cannot promise a discharge time or authorise you to leave. Recorded task completion is only part of the process. Please ask authorised hospital staff to confirm readiness and departure.',true);
 const meanings=[[/what.*(summary|document)|explain.*(summary|document)/,'Discharge documentation is the paperwork prepared by the treating team for discharge. Ask hospital staff to explain any clinical instructions.'],[/what.*pharmacy|explain.*pharmacy/,'Pharmacy clearance records the pharmacy team’s required discharge work. It does not replace medication instructions from your clinical team.'],[/what.*bill|explain.*bill/,'Final billing records completion of the hospital’s billing requirements. The chatbot cannot calculate charges or confirm payment.'],[/what.*(insurance|tpa)|explain.*(insurance|tpa)/,c.pathway==='cash'?'Insurance authorisation is not required in your recorded self-pay pathway.':'Insurance authorisation records the cashless approval step. A pending status does not mean a claim is rejected, and the chatbot cannot approve it.'],[/what.*final|explain.*final/,'Final checks are the required hospital checks before staff confirm departure. Only authorised staff can confirm that you may leave.']];
 for(const [pattern,answer]of meanings)if(pattern.test(q))return reply(answer);
 if(/hold|why.*delay|why.*wait|stuck/.test(q)){
  const held=tasks.filter(t=>t.status==='on_hold');
  return reply(held.length?'Recorded on hold: '+held.map(t=>t.label).join(', ')+'. Please ask your coordinator for the reason and next action.':'The records do not establish why there is a delay. I can show pending steps, but I will not guess the cause. Please ask the coordinator for an update.',true);
 }
 if(/status|progress|pending|remaining|next step|complete|update/.test(q)){
  const done=tasks.filter(t=>t.status==='complete').map(t=>t.label);const remaining=tasks.filter(t=>!closed(t.status)).map(t=>`${t.label} (${t.status==='processing'?'in progress':t.status==='on_hold'?'on hold':'pending'})`);
  return reply(`For your linked case ${c.id}: ${done.length?'Completed: '+done.join(', ')+'. ':'No tasks are marked complete. '}${remaining.length?'Remaining: '+remaining.join('; ')+'.':'All tracked tasks are complete; await authorised staff confirmation before leaving.'} These are the latest stored records, not a guaranteed live hospital feed.`);
 }
 if(/contact|help|human|coordinator|person/.test(q))return reply('Use “Message your coordinator” below for a non-urgent question. A human must read and reply, so no response time is guaranteed. For urgent or medical concerns, contact ward staff directly.',true);
 return reply('I can explain discharge stages and show the latest recorded progress. I cannot reliably answer that question. You can send it to the human help desk below; nothing is sent there automatically.',true);
}
