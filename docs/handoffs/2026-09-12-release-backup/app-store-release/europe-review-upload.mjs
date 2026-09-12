import {request} from './asc-api.mjs';
import {readFileSync} from 'node:fs';import{createHash}from'node:crypto';
const bytes=readFileSync(new URL('./review-captures/europe-all-access-active.png',import.meta.url));
const type='subscriptionAppStoreReviewScreenshots';
let existing=await request('/v1/subscriptions/6809207347/appStoreReviewScreenshot').catch(e=>{if(e.message.startsWith('HTTP 404'))return null;throw e;});
if(!existing?.data){
 const r=await request('/v1/'+type,'POST',{data:{type,attributes:{fileName:'europe-all-access-active.png',fileSize:bytes.length},relationships:{subscription:{data:{type:'subscriptions',id:'6809207347'}}}}});
 for(const op of r.data.attributes.uploadOperations){const u=new URL(op.url);if(u.protocol!=='https:')throw Error('Unsafe upload URL');const res=await fetch(u,{method:op.method,headers:Object.fromEntries(op.requestHeaders.map(h=>[h.name,h.value])),body:bytes.subarray(op.offset,op.offset+op.length)});if(!res.ok)throw Error('Upload HTTP '+res.status);}
 await request('/v1/'+type+'/'+r.data.id,'PATCH',{data:{type,id:r.data.id,attributes:{uploaded:true,sourceFileChecksum:createHash('md5').update(bytes).digest('hex')}}});console.log('Yearly review screenshot committed');
}
await request('/v1/subscriptions/6809207347','PATCH',{data:{type:'subscriptions',id:'6809207347',attributes:{reviewNote:'All-Access unlocks all languages, journey zones, games and stories. This screenshot shows the active All-Access state because the capture account is already entitled. Monthly and yearly plans provide the same access for their respective billing periods.'}}});
console.log('Yearly review notes saved');
