const prerequisites=i=>i<2?[]:i===2?[0,1]:i===3?[2]:[0,1,2,3];
export const STAGES=['Documentation','Pharmacy','Billing','Insurance desk','Final checks'];
const closed=s=>['complete','not_applicable'].includes(s);
export const DEFAULT_MODEL={capacity:[1,1,1,1,1],minutes:[15,20,30,10,10],insurer_minutes:45,hold_minutes:30,cutoff_minutes:120};

// Discrete-event, non-preemptive scheduling for a fixed backlog. No database writes.
export function simulate(cases,model) {
 const jobs=cases.map((c,ci)=>({id:c.id,cleared_at:c.cleared_at,tasks:c.tasks.map((t,i)=>({position:i,state:closed(t.status)?'done':i===3&&c.insurance?.phase==='awaiting_insurer'&&t.status!=='on_hold'?'external':t.status==='processing'?'running':t.status==='on_hold'?'held':'pending',readyAt:null,doneAt:closed(t.status)?0:null,startAt:null,releaseAt:t.status==='on_hold'?model.hold_minutes:0,original:t.status})),ci}));
 const resources=[0,0,0,0,0];const queueWait=[[],[],[],[],[]];let now=0;const events=[];let maxConcurrent=[0,0,0,0,0];
 const start=(job,task)=>{
  task.state='running';task.startAt=now;resources[task.position]++;maxConcurrent[task.position]=Math.max(maxConcurrent[task.position],resources[task.position]);
  if(task.original!=='processing')queueWait[task.position].push(now-task.readyAt);
  events.push({at:now+model.minutes[task.position],job,task,kind:'service'});
 };
 // Already-started work remains in service at time zero and uses assumed remaining duration.
 for(const job of jobs)for(const task of job.tasks){if(task.state==='running')start(job,task);if(task.state==='external')events.push({at:model.insurer_minutes,job,task,kind:'external'});}
 let guard=0;
 while(jobs.some(j=>j.tasks.some(t=>t.state!=='done'))){
  if(++guard>10000)throw new Error('Simulation exceeded its event limit.');
  for(const job of jobs)for(const task of job.tasks){
   if(task.state==='held'&&task.releaseAt<=now)task.state='pending';
   if(task.state==='pending'&&task.readyAt===null&&prerequisites(task.position).every(i=>job.tasks[i].state==='done'))task.readyAt=Math.max(now,task.releaseAt);
  }
  // FIFO by future eligibility, then admission clearance time and ID for reproducible ties.
  for(let stage=0;stage<5;stage++){
   const waiting=jobs.flatMap(job=>job.tasks.filter(t=>t.position===stage&&t.state==='pending'&&t.readyAt!==null&&t.readyAt<=now).map(task=>({job,task}))).sort((a,b)=>a.task.readyAt-b.task.readyAt||a.job.cleared_at.localeCompare(b.job.cleared_at)||a.job.id.localeCompare(b.job.id));
   for(const {job,task}of waiting){if(resources[stage]>=model.capacity[stage])break;start(job,task);}
  }
  const future=[...events.map(e=>e.at),...jobs.flatMap(j=>j.tasks.filter(t=>t.state==='held'&&t.releaseAt>now).map(t=>t.releaseAt))];
  if(!future.length){if(jobs.every(j=>j.tasks.every(t=>t.state==='done')))break;throw new Error('Workflow cannot progress under these assumptions.');}
  now=Math.min(...future);
  const due=events.filter(e=>e.at===now);for(const event of due){events.splice(events.indexOf(event),1);const t=event.task;
   if(event.kind==='service'){
    resources[t.position]--;
    if(t.position===3&&model.insurer_minutes>0){t.state='external';events.push({...event,at:now+model.insurer_minutes,kind:'external'});continue;}
   }
   t.state='done';t.doneAt=now;
  }
 }
 const completions=jobs.map(j=>({id:j.id,remaining_minutes:Math.max(0,...j.tasks.map(t=>t.doneAt||0))}));
 const durations=completions.map(c=>c.remaining_minutes).sort((a,b)=>a-b);
 const mean=xs=>xs.length?Math.round(xs.reduce((a,b)=>a+b,0)/xs.length*10)/10:0;
 const waits=queueWait.flat();
 return {cases:completions,mean_remaining:mean(durations),p90_remaining:durations.length?durations[Math.ceil(durations.length*.9)-1]:0,ready_by_cutoff:durations.filter(t=>t<=model.cutoff_minutes).length,mean_queue_wait:mean(waits),queues:queueWait.map((waits,i)=>({stage:STAGES[i],mean_wait:mean(waits),max_wait:waits.length?Math.max(...waits):0,tasks:waits.length,max_concurrent:maxConcurrent[i]}))};
}
