// Fictional discovery directory. It is not a live hospital credential or availability service.
export async function ensureDirectory({get,batch,now}){
 const key='hospital-doctor-directory-v1';if(await get('SELECT key FROM sample_batches WHERE key=?',key))return;const at=now();
 const hospitals=[['Cedar Valley Hospital','North District','Fictional campus, North District'],['Harborview Medical Centre','Central District','Fictional campus, Central District'],['Northgate City Hospital','East District','Fictional campus, East District']];
 const doctors=[['Dr. Aditi Mehra','General medicine'],['Dr. Kabir Sethi','Cardiology'],['Dr. Naina Rao','Orthopaedics'],['Dr. Rohan Sen','General medicine'],['Dr. Tara Nair','Cardiology'],['Dr. Dev Joshi','Orthopaedics'],['Dr. Meera Shah','General medicine'],['Dr. Arjun Bose','Cardiology'],['Dr. Sana Kapoor','Orthopaedics']];
 const commands=[['INSERT OR IGNORE INTO sample_batches VALUES(?,?)',key,at]];
 hospitals.forEach(([name,city,address],i)=>commands.push(['INSERT OR IGNORE INTO hospitals VALUES(?,?,?,?,?,?)',i+1,name+' (fictional)',city,address,1,at]));
 doctors.forEach(([name,specialty],i)=>commands.push(['INSERT OR IGNORE INTO doctors VALUES(?,?,?,?,?,?,?)',i+1,Math.floor(i/3)+1,name+' (fictional)',specialty,'Outpatient clinic '+(i%3+1),1,at]));
 await batch(commands);
}
export async function directoryRoute(ctx){
 const{path,method,body,session,get,all,batch,json,err,now}=ctx;const admin=session.role==='admin';
 if(path==='/api/directory'&&method==='GET')return json({fictional:true,hospitals:await all('SELECT * FROM hospitals WHERE active=1 ORDER BY name'),doctors:await all('SELECT d.* FROM doctors d JOIN hospitals h ON h.id=d.hospital_id WHERE d.active=1 AND h.active=1 ORDER BY d.name')});
 if(!path.startsWith('/api/admin/'))return null;if(!admin)err(403,'Platform administrator access required.');
 if(path==='/api/admin/directory'&&method==='GET')return json({fictional:true,hospitals:await all('SELECT * FROM hospitals ORDER BY id'),doctors:await all('SELECT d.*,h.name AS hospital_name FROM doctors d JOIN hospitals h ON h.id=d.hospital_id ORDER BY d.id'),recent_changes:await all("SELECT event,occurred_at FROM audit WHERE event LIKE 'directory_%' ORDER BY id DESC LIMIT 30")});
 const match=path.match(/^\/api\/admin\/(hospitals|doctors)(?:\/(\d+))?$/);if(!match||method!=='POST')return null;
 const table=match[1],id=match[2]?Number(match[2]):null;const str=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n;
 if(!str(body.name,100)||typeof body.active!=='boolean')err(400,'Enter a name and an active/inactive state.');
 const prior=id?await get('SELECT * FROM '+table+' WHERE id=?',id):null;if(id&&!prior)err(404,'Directory entry not found.');if(prior&&body.expected_updated_at!==prior.updated_at)err(409,'This entry changed. Refresh it.');
 const at=new Date(Math.max(Date.now(),prior?Date.parse(prior.updated_at)+1:0)).toISOString();let values,columns;
 if(table==='hospitals'){if(!str(body.city,80)||!str(body.address,180))err(400,'Enter the hospital area and address.');values=[body.name.trim(),body.city.trim(),body.address.trim(),body.active?1:0,at];columns=['name','city','address','active','updated_at'];}
 else{if(!Number.isInteger(body.hospital_id)||!await get('SELECT id FROM hospitals WHERE id=?',body.hospital_id)||!str(body.specialty,80)||!str(body.clinic,120))err(400,'Choose a hospital and enter the doctor specialty and clinic.');values=[body.hospital_id,body.name.trim(),body.specialty.trim(),body.clinic.trim(),body.active?1:0,at];columns=['hospital_id','name','specialty','clinic','active','updated_at'];}
 const guard=prior?'EXISTS(SELECT 1 FROM '+table+' WHERE id=? AND updated_at=?)':'1=1';const args=prior?[id,prior.updated_at]:[];
 const commands=[['INSERT INTO audit(user_id,event,occurred_at) SELECT ?,?,? WHERE '+guard,session.user_id,'directory_'+table+'_'+(id?'updated '+id:'created'),at,...args]];
 commands.push(prior?['UPDATE '+table+' SET '+columns.map(c=>c+'=?').join(',')+' WHERE id=? AND updated_at=?',...values,id,prior.updated_at]:['INSERT INTO '+table+'('+columns.join(',')+') VALUES('+values.map(()=>'?').join(',')+')',...values]);
 const results=await batch(commands);if(!results.at(-1).meta.changes)err(409,'This directory entry changed. Refresh it.');return json({ok:true},id?200:201);
}
