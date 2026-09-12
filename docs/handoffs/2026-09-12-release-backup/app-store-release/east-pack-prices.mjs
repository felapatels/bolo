import{request}from'./asc-api.mjs';
const territories=(await request('/v1/territories?limit=200')).data.map(t=>({type:'territories',id:t.id}));
for(const [id,price] of [['6810748865',1.99],['6810748791',4.99],['6810749102',9.99]]){
const ps=(await request('/v2/inAppPurchases/'+id+'/pricePoints?filter[territory]=USA&limit=200')).data;const point=ps.find(p=>Number(p.attributes.customerPrice)===price);if(!point)throw Error('Missing price '+price);
await request('/v1/inAppPurchasePriceSchedules','POST',{data:{type:'inAppPurchasePriceSchedules',relationships:{inAppPurchase:{data:{type:'inAppPurchases',id}},baseTerritory:{data:{type:'territories',id:'USA'}},manualPrices:{data:[{type:'inAppPurchasePrices',id:'${price}'}]}}},included:[{type:'inAppPurchasePrices',id:'${price}',attributes:{startDate:null,endDate:null},relationships:{inAppPurchaseV2:{data:{type:'inAppPurchases',id}},inAppPurchasePricePoint:{data:{type:'inAppPurchasePricePoints',id:point.id}}}}]});
await request('/v1/inAppPurchaseAvailabilities','POST',{data:{type:'inAppPurchaseAvailabilities',attributes:{availableInNewTerritories:true},relationships:{inAppPurchase:{data:{type:'inAppPurchases',id}},availableTerritories:{data:territories}}}});console.log(id,price,'worldwide configured');
}
