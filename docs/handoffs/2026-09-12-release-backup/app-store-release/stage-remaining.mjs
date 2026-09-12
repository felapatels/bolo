import{request}from'./asc-api.mjs';import fs from'node:fs';const out=[];
for(const[region,app,version,groupVersion]of[['east','6809205852','5ace16cd-a434-40d7-82d8-8918d69739a8','73fc4a5d-f2f5-4bec-a508-157e51fc7eb5'],['africa','6809208363','e3739224-9823-433d-bd6e-f287b9732279','fdf7d391-2ce5-4ec7-b552-33fd62b35b1a'],['latam','6809805287','2a60904f-9271-4925-80f1-2bfe62bf4725','2fe4dfae-ecbd-4a74-9ec5-dff4c90c12ba']]){
const drafts=(await request('/v1/apps/'+app+'/reviewSubmissions')).data;let draft=drafts.find(x=>x.attributes.state==='READY_FOR_REVIEW');if(drafts.length&&!draft){console.log(region,'existing submission requires inspection',drafts.map(x=>x.attributes));continue;}
if(!draft)draft=(await request('/v1/reviewSubmissions','POST',{data:{type:'reviewSubmissions',attributes:{platform:'IOS'},relationships:{app:{data:{type:'apps',id:app}}}}})).data;
const row={region,draft:draft.id,results:[]};
const existing=(await request('/v1/reviewSubmissions/'+draft.id+'/items')).data;
for(const[relation,type,id]of[['subscriptionGroupVersion','subscriptionGroupVersions',groupVersion],['appStoreVersion','appStoreVersions',version]]){
if(existing.some(x=>x.relationships?.[relation]?.data?.id===id)){row.results.push({relation,state:'already attached'});continue;}
try{const x=await request('/v1/reviewSubmissionItems','POST',{data:{type:'reviewSubmissionItems',relationships:{reviewSubmission:{data:{type:'reviewSubmissions',id:draft.id}},[relation]:{data:{type,id}}}}});row.results.push({relation,state:x.data.attributes.state});}catch(e){let errors;try{const j=JSON.parse(e.message.slice(e.message.indexOf('{')));errors=j.errors.flatMap(x=>Object.values(x.meta?.associatedErrors??{}).flat().map(y=>y.detail));if(!errors.length)errors=j.errors.map(x=>x.detail);}catch{errors=[e.message]};row.results.push({relation,errors});}}
out.push(row);console.log(JSON.stringify(row));}
fs.writeFileSync('work/app-store-release/draft-staging.json',JSON.stringify(out,null,2));
