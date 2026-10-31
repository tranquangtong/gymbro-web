import {createSign} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PHOTO_RETENTION_MS,photoExpired} from '../photo-retention.js';
export const PROJECT='gymbro-web';
const ROOT=`projects/${PROJECT}/databases/(default)/documents`;
export function photoCleanupWrites(photo,meal,now){
 const parts=photo.name?.split('/documents/')[1]?.split('/')||[],fields=photo.fields||{},created=fields.created_at?.stringValue,mealId=fields.meal_id?.stringValue;
 if(!photo.name?.startsWith(ROOT+'/')||parts.length!==4||parts[0]!=='users'||parts[2]!=='MealPhotos'||!photo.updateTime||!photoExpired({created_at:created},now))return [];
 if(typeof mealId!=='string'||!/^[-A-Za-z0-9_]{1,200}$/.test(mealId))return [];
 const writes=[];
 if(meal){
  if(meal.name!==`${ROOT}/users/${parts[1]}/WebMeals/${mealId}`||!meal.updateTime)return [];
  const values=meal.fields?.photo_ids?.arrayValue?.values||[],next=values.filter(v=>v.stringValue!==parts[3]);
  if(next.length!==values.length)writes.push({update:{name:meal.name,fields:{photo_ids:{arrayValue:{values:next}},updated_at:{stringValue:new Date(now).toISOString()}}},updateMask:{fieldPaths:['photo_ids','updated_at']},currentDocument:{updateTime:meal.updateTime}});
 }
 writes.push({delete:photo.name,currentDocument:{updateTime:photo.updateTime}});return writes;
}
async function tokenFor(account,fetcher){
 if(account.project_id!==PROJECT||typeof account.client_email!=='string'||typeof account.private_key!=='string')throw Error('invalid-credential-project');
 const now=Math.floor(Date.now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const payload=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signature=createSign('RSA-SHA256').update(payload).sign(account.private_key,'base64url');
 const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:payload+'.'+signature})});
 const result=await response.json();if(!response.ok||!result.access_token)throw Error('firebase-auth-failed');return result.access_token;
}
export async function cleanupPhotos({account,fetcher=fetch,now=Date.now(),dryRun=true,maxPhotos=500}={}){
 const token=await tokenFor(account,fetcher),base='https://firestore.googleapis.com/v1/'+ROOT;
 async function request(url,options={}){
  const response=await fetcher(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
  const value=await response.json();if(response.status===404&&!options.method)return null;if(!response.ok){const error=Error('firestore-request-failed');error.code=value.error?.status||String(response.status);throw error;}return value;
 }
 if(!Number.isInteger(maxPhotos)||maxPhotos<1||maxPhotos>500)throw Error('invalid-cleanup-limit');
 let scanned=0,deleted=0,conflicts=0,userPage=null;
 do{
  const userURL=base+'/users?showMissing=true&pageSize=100&mask.fieldPaths=uid'+(userPage?'&pageToken='+encodeURIComponent(userPage):'');
  const users=await request(userURL);
  for(const user of users?.documents||[]){
   if(!user.name?.startsWith(ROOT+'/users/')||user.name.slice(ROOT.length+1).split('/').length!==2)continue;
   let cursor=null;
   while(scanned<maxPhotos){
  const query={select:{fields:[{fieldPath:'created_at'},{fieldPath:'meal_id'}]},from:[{collectionId:'MealPhotos',allDescendants:false}],where:{fieldFilter:{field:{fieldPath:'created_at'},op:'LESS_THAN_OR_EQUAL',value:{stringValue:new Date(now-PHOTO_RETENTION_MS).toISOString()}}},orderBy:[{field:{fieldPath:'created_at'},direction:'ASCENDING'},{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:Math.min(100,maxPhotos-scanned)};
  if(cursor)query.startAt={values:[cursor.fields.created_at,{referenceValue:cursor.name}],before:false};
  const result=await request('https://firestore.googleapis.com/v1/'+user.name+':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:query})});const docs=(result||[]).filter(r=>r.document).map(r=>r.document);if(!docs.length)break;
  for(const photo of docs){
   scanned++;if(!photoCleanupWrites(photo,null,now).length)continue;
   const parts=photo.name.split('/documents/')[1].split('/'),mealId=photo.fields.meal_id.stringValue;
   const meal=await request(base+`/users/${encodeURIComponent(parts[1])}/WebMeals/${encodeURIComponent(mealId)}?mask.fieldPaths=photo_ids&mask.fieldPaths=updated_at`);
   const writes=photoCleanupWrites(photo,meal,now);if(!writes.length)continue;
   if(dryRun){deleted++;continue;}
   try{await request(base+':commit',{method:'POST',body:JSON.stringify({writes})});deleted++;}catch(e){if(['FAILED_PRECONDITION','ABORTED','NOT_FOUND'].includes(e.code)){conflicts++;continue;}throw e;}
  }
  cursor=docs.at(-1);if(docs.length<query.limit)break;
   }
   if(scanned>=maxPhotos)break;
  }
  userPage=users?.nextPageToken||null;
 }while(userPage&&scanned<maxPhotos);
 return {dryRun,eligibleScanned:scanned,...(dryRun?{wouldDelete:deleted}:{deleted}),conflicts,limitReached:scanned>=maxPhotos};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const account=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'null');if(!account)throw Error('missing-credential');const result=await cleanupPhotos({account,dryRun:process.env.PHOTO_DRY_RUN!=='false'});console.log(JSON.stringify(result));}
 catch(e){console.error('Photo cleanup failed:',e.code||e.name||'Error');process.exitCode=1;}
}
