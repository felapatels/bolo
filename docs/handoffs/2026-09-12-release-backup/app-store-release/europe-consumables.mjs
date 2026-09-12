import {request} from './asc-api.mjs';
import {readFileSync,copyFileSync} from 'node:fs';import{createHash}from'node:crypto';
const source=new URL('./review-captures/europe-caj-review.png',import.meta.url);
const dest=new URL('./review-captures/europe-caj-packs.png',import.meta.url);copyFileSync(source,dest);const bytes=readFileSync(dest);
const type='inAppPurchaseAppStoreReviewScreenshots';
for(const id of ['6809199279','6809199407','6809204902']){
 const old=await request('/v2/inAppPurchases/'+id+'/appStoreReviewScreenshot').catch(e=>{if(e.message.startsWith('HTTP 404'))return null;throw e;});
 if(old?.data?.attributes.assetDeliveryState?.state==='FAILED') await request('/v1/'+type+'/'+old.data.id,'DELETE');
 if(!old?.data || old.data.attributes.assetDeliveryState?.state==='FAILED'){
 const r=await request('/v1/'+type,'POST',{data:{type,attributes:{fileName:'europe-caj-packs.png',fileSize:bytes.length},relationships:{inAppPurchaseV2:{data:{type:'inAppPurchases',id}}}}});
 for(const op of r.data.attributes.uploadOperations){const u=new URL(op.url);if(u.protocol!=='https:')throw Error('Unsafe upload');const res=await fetch(u,{method:op.method,headers:Object.fromEntries(op.requestHeaders.map(h=>[h.name,h.value])),body:bytes.subarray(op.offset,op.offset+op.length)});if(!res.ok)throw Error('Upload HTTP '+res.status);}
 await request('/v1/'+type+'/'+r.data.id,'PATCH',{data:{type,id:r.data.id,attributes:{uploaded:true,sourceFileChecksum:createHash('md5').update(bytes).digest('hex')}}});
 }
 console.log(id,'screenshot committed');
}
console.log('Content rights:',(await request('/v1/apps/6809198565')).data.attributes.contentRightsDeclaration);
