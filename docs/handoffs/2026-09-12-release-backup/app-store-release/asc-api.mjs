import {readFileSync} from 'node:fs';
import {createPrivateKey,sign} from 'node:crypto';
const origin='https://api.appstoreconnect.apple.com';
export async function request(path, method='GET', body) {
 if (!path.startsWith('/v1/') && !path.startsWith('/v2/')) throw Error('Unexpected API path');
 if(!process.env.ASC_KEY_ID||!process.env.ASC_ISSUER_ID||!process.env.ASC_PRIVATE_KEY_PATH) throw Error('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY_PATH');
 const now=Math.floor(Date.now()/1000);
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=b64({alg:'ES256',kid:process.env.ASC_KEY_ID,typ:'JWT'})+'.'+b64({iss:process.env.ASC_ISSUER_ID,iat:now,exp:now+600,aud:'appstoreconnect-v1'});
 const key=createPrivateKey(readFileSync(process.env.ASC_PRIVATE_KEY_PATH));
 const token=input+'.'+sign('sha256',Buffer.from(input),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 const response=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const text=await response.text();
 if(!response.ok) throw Error('HTTP '+response.status+' '+text);
 return text?JSON.parse(text):null;
}
if(process.argv[1]===new URL(import.meta.url).pathname){ console.log(JSON.stringify(await request(process.argv[2]),null,2)); }
