export function buildReport(events,accounts,locations,filter={}) {
 const from=filter.from?Date.parse(filter.from+'T00:00:00Z'):0,to=filter.to?Date.parse(filter.to+'T23:59:59.999Z'):Infinity;
 const matches=e=>Date.parse(e.at)>=from&&Date.parse(e.at)<=to&&(!filter.restaurant||e.restaurant===filter.restaurant)&&(!filter.email||e.email===filter.email);
 const selected=events.filter(matches),uploads=selected.filter(e=>e.type==='upload'),errors=selected.filter(e=>/_error$/.test(e.type));
 const stores=locations.map(location=>{
  const own=selected.filter(e=>e.restaurant===location.name),sent=own.filter(e=>e.type==='upload');
  const assignments=accounts.filter(a=>a.role==='manager'&&a.restaurants.includes(location.name)).map(a=>({name:a.managers?.find(m=>m.restaurant===location.name)?.name||a.name,email:a.email,active:a.active}));
  return {restaurant:location.name,managers:assignments,uploads:sent.length,rows:sent.reduce((n,e)=>n+(e.rows||0),0),bytes:sent.reduce((n,e)=>n+(e.bytes||0),0),errors:own.filter(e=>/_error$/.test(e.type)).length,previews:own.filter(e=>e.type==='preview').length,lastUpload:sent[0]?.at||null,lastLogin:events.find(e=>['login','temporary_login'].includes(e.type)&&assignments.some(a=>a.email===e.email))?.at||null};
 }).filter(s=>!filter.restaurant||s.restaurant===filter.restaurant);
 const gmReports=stores.flatMap(s=>s.managers.length?s.managers.map(m=>({...s,...m,managers:undefined})): [{...s,name:null,email:null,active:false,managers:undefined}]);
 const history=selected.filter(e=>['upload','upload_error','upload_started'].includes(e.type));
 const seen=new Set(),uploadHistory=history.filter(e=>{const key=e.filename||e.id;if(seen.has(key))return false;seen.add(key);return true;});
 const days=new Map();for(const e of selected){if(e.type!=='upload'&&!/_error$/.test(e.type))continue;const day=e.at.slice(0,10),point=days.get(day)||{day,uploads:0,errors:0};if(e.type==='upload')point.uploads++;else point.errors++;days.set(day,point);}
 const locationsWithUploads=stores.filter(s=>s.uploads>0).length;
 return {summary:{uploads:uploads.length,rows:uploads.reduce((n,e)=>n+(e.rows||0),0),bytes:uploads.reduce((n,e)=>n+(e.bytes||0),0),errors:errors.length,activeLocations:locationsWithUploads,locations:stores.length,missingLocations:stores.filter(s=>!s.uploads&&s.managers.length).length,logins:selected.filter(e=>e.type==='login').length,failedLogins:selected.filter(e=>e.type==='login_failed').length},locations:stores,gmReports,uploadHistory,alerts:errors,activity:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)),access:selected.filter(e=>['login','logout','login_failed','temporary_login','password_changed','privacy_acknowledged','email_code_sent','email_code_verified','email_code_failed'].includes(e.type)||e.type.startsWith('admin_')),events:selected};
}
