import{request}from'./asc-api.mjs';
const territories=(await request('/v1/territories?limit=200')).data.map(x=>({type:'territories',id:x.id}));
for(const [id,price]of[['6810749015',12.99],['6810748914',89.99],['6810748906',12.99],['6810748855',89.99]]){
let path='/v1/subscriptions/'+id+'/pricePoints?filter[territory]=USA&limit=200',point;
while(path&&!point){const r=await request(path);point=r.data.find(x=>Number(x.attributes.customerPrice)===price);path=r.links.next?new URL(r.links.next).pathname+new URL(r.links.next).search:null;}
if(!point)throw Error('Missing price '+id);
const equivalents=(await request('/v1/subscriptionPricePoints/'+point.id+'/equalizations?limit=200&include=territory')).data;
const points=[{...point,relationships:{territory:{data:{type:'territories',id:'USA'}}}},...equivalents];
const existing=(await request('/v1/subscriptions/'+id+'/prices?limit=200&include=territory')).data;const priced=new Set(existing.map(x=>x.relationships?.territory?.data?.id));
const pending=points.filter(p=>!priced.has(p.relationships.territory.data.id));
if(pending.length){const included=pending.map((p,i)=>({type:'subscriptionPrices',id:'${price'+i+'}',attributes:{startDate:null},relationships:{subscription:{data:{type:'subscriptions',id}},territory:{data:p.relationships.territory.data},subscriptionPricePoint:{data:{type:'subscriptionPricePoints',id:p.id}}}}));
await request('/v1/subscriptions/'+id,'PATCH',{data:{type:'subscriptions',id,relationships:{prices:{data:included.map(({type,id})=>({type,id}))}}},included});}
try{await request('/v1/subscriptions/'+id+'/subscriptionAvailability');}catch(e){if(!e.message.includes('404'))throw e;await request('/v1/subscriptionAvailabilities','POST',{data:{type:'subscriptionAvailabilities',attributes:{availableInNewTerritories:true},relationships:{subscription:{data:{type:'subscriptions',id}},availableTerritories:{data:territories}}}});}
console.log(id,price,'worldwide subscription configured');
}
