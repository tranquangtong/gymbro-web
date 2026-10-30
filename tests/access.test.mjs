import test from 'node:test';
import assert from 'node:assert/strict';
import {SESSION_MS,sessionExpiry,sessionValid,assertSession,verifySession,profileDetails,profileComplete,validatePersonalProfile,estimateEnergy,accessStage} from '../access.js';
import {FirebaseRepository} from '../firebase.js';
import {cleanRecord} from '../migration.js';
import {parseMeals} from '../quick.js';
const profile={weight_kg:85,height_cm:175,TDEE:2500,goal:{bmr_kcal:1800,target_weight_kg:78,training_goal:'Tăng sức mạnh để hít xà bodyweight',activity_factor:1.375}};
const now=Date.parse('2026-10-30T05:00:00Z');
test('Session lasts exactly 14 days from authentication, not the most recent token refresh',async()=>{
 const expires=sessionExpiry('2026-10-16T05:00:00Z');assert.equal(expires,now);assert.equal(SESSION_MS,1209600000);assert.equal(sessionValid(expires,now-1),true);assert.equal(sessionValid(expires,now),false);assert.throws(()=>assertSession(expires,now));assert.throws(()=>sessionExpiry('unknown'));
 const service={auth:{currentUser:{uid:'owner'}},authSDK:{getIdTokenResult:async()=>({authTime:new Date(Date.now()-SESSION_MS-1).toISOString(),issuedAtTime:new Date().toISOString()})}};
 await assert.rejects(()=>verifySession(service),/hết hạn/);assert.equal(service.sessionExpiresAt,undefined);
 service.authSDK.getIdTokenResult=async()=>({authTime:new Date().toISOString()});await verifySession(service);assert.ok(sessionValid(service.sessionExpiresAt));
});
test('Signed-out, local/demo, expired and incomplete accounts cannot reach daily log screens',()=>{
 const ready={mode:'firebase',connected:true,initialized:true,repo:{s:{sessionExpiresAt:now+SESSION_MS}},accountProfile:profile};
 assert.equal(accessStage(ready,now),'ready');assert.equal(accessStage({...ready,connected:false},now),'login');assert.equal(accessStage({...ready,mode:'local'},now),'login');assert.equal(accessStage({...ready,mode:'demo'},now),'login');assert.equal(accessStage({...ready,repo:{s:{sessionExpiresAt:now}}},now),'login');assert.equal(accessStage({...ready,authRestoring:true},now),'restoring');assert.equal(accessStage({...ready,initialized:false},now),'loading');assert.equal(accessStage({...ready,accountProfile:{weight_kg:85}},now),'profile');
});
test('Every required personal field must be valid; old weight-only profiles do not bypass onboarding',()=>{
 assert.equal(profileComplete(profile),true);assert.equal(profileComplete({weight_kg:85,height_cm:175,TDEE:2500,goal:'Giảm mỡ'}),false);
 for(const key of ['weight_kg','height_cm','TDEE'])assert.equal(profileComplete({...profile,[key]:''}),false,key);
 for(const key of ['bmr_kcal','target_weight_kg','training_goal'])assert.equal(profileComplete({...profile,goal:{...profile.goal,[key]:''}}),false,key);
 for(const bad of [{weight_kg:-1},{height_cm:0},{TDEE:1000},{goal:{...profile.goal,target_weight_kg:0}},{goal:{...profile.goal,training_goal:'   '}}])assert.throws(()=>validatePersonalProfile({...profile,...bad}));
 assert.equal(profileDetails(profile).bmr_kcal,1800);assert.equal(profileDetails({goal:'Giảm mỡ'}).training_goal,'Giảm mỡ');
});
test('Personal fields round-trip through the published profile allowlist without inventing new top-level columns',()=>{
 const r={...profile,id:'profile',date:'2026-10-30',created_at:'now',updated_at:'now',deleted:false};
 assert.deepEqual(cleanRecord('WebProfile',r).goal,profile.goal);assert.equal(cleanRecord('WebProfile',r).height_cm,175);assert.equal(cleanRecord('WebProfile',r).TDEE,2500);
});
test('Energy helper requires explicit adult inputs and estimates both equation variants without guessing sex/activity',()=>{
 assert.deepEqual(estimateEnergy({weight_kg:80,height_cm:180,age:30,gender:'male',activity_factor:1.2}),{bmr_kcal:1780,tdee_kcal:2136});
 assert.deepEqual(estimateEnergy({weight_kg:80,height_cm:180,age:30,gender:'female',activity_factor:1.2}),{bmr_kcal:1614,tdee_kcal:1937});
 assert.throws(()=>estimateEnergy({weight_kg:85,height_cm:175,age:29,gender:'',activity_factor:1.2}));assert.throws(()=>estimateEnergy({weight_kg:85,height_cm:175,age:17,gender:'male',activity_factor:1.2}));
});
test('Repository refuses any expired session before issuing a read or a write',async()=>{
 const service={sessionExpiresAt:Date.now()+100000,auth:{currentUser:{uid:'owner'}},db:{},dbSDK:{collection:()=>assert.fail('expired session read'),runTransaction:()=>assert.fail('expired session write')}};
 const repo=new FirebaseRepository(service);service.sessionExpiresAt=Date.now()-1;
 await assert.rejects(()=>repo.load(),/hết hạn/);await assert.rejects(()=>repo.saveMany('WebMeals',parseMeals('1 chuối',{date:'2026-10-30'})),/hết hạn/);await assert.rejects(()=>repo.saveFood({}),/hết hạn/);assert.throws(()=>new FirebaseRepository(service),/hết hạn/);
});
