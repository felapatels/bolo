import{request}from'./asc-api.mjs';
const targets=[{id:'6809208363',bundle:'com.bolo.africa'},{id:'6809805287',bundle:'com.bolo.latam'}];
for(const target of targets){
const app=target.id;
const actual=(await request('/v1/apps/'+app)).data;
if(actual.attributes.bundleId!==target.bundle)throw Error('App identity mismatch');
const price=(await request('/v1/apps/'+app+'/appPricePoints?filter[territory]=USA&limit=200')).data.find(x=>Number(x.attributes.customerPrice)===0);
if(!price)throw Error('No free tier');
await request('/v1/appPriceSchedules','POST',{data:{type:'appPriceSchedules',relationships:{app:{data:{type:'apps',id:app}},baseTerritory:{data:{type:'territories',id:'USA'}},manualPrices:{data:[{type:'appPrices',id:'${free}'}]}}},included:[{type:'appPrices',id:'${free}',attributes:{startDate:null,endDate:null},relationships:{appPricePoint:{data:{type:'appPricePoints',id:price.id}}}}]});
const ts=(await request('/v1/territories?limit=200')).data;
const included=ts.map((t,i)=>({type:'territoryAvailabilities',id:'${t'+i+'}',attributes:{available:true},relationships:{territory:{data:{type:'territories',id:t.id}}}}));
await request('/v2/appAvailabilities','POST',{data:{type:'appAvailabilities',attributes:{availableInNewTerritories:true},relationships:{app:{data:{type:'apps',id:app}},territoryAvailabilities:{data:included.map(({type,id})=>({type,id}))}}},included});
console.log(actual.attributes.name,'free, all territories configured');
}
