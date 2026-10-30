import test from 'node:test';
import assert from 'node:assert/strict';
import {FirebaseRepository} from '../firebase.js';
import {startupMode,saveMessage,localMissingCount,loadCurrentData,createLiveSync,transferLocalData} from '../sync.js';
import {emptyData} from '../core.js';
import {parseMeals,DEFAULT_FOODS} from '../quick.js';

test('A persisted local/demo preference cannot silently disable Firebase after a mobile reload',()=>{
 for(const preferences of [{},{mode:'local'},{mode:'demo'},{mode:'firebase'}])assert.equal(startupMode(preferences),'firebase');
 assert.match(saveMessage({mode:'local'},2),/Chưa đồng bộ Firebase/);
 assert.match(saveMessage({mode:'firebase',repo:{s:{auth:{currentUser:{email:'owner@example.test'}}}}},2),/2 mục vào Firebase · owner@example.test/);
});
function streamService(){
 const streams=new Map(),s={auth:{currentUser:{uid:'owner',email:'owner@example.test'}},db:{},dbSDK:{collection:(_, ...p)=>p.join('/'),onSnapshot:(path,options,next,error)=>{const stream={options,next,error,stopped:false};streams.set(path,stream);return ()=>{stream.stopped=true;};}}};return {s,streams};
}
const snap=(records,fromCache=false)=>({metadata:{fromCache},docs:records.map(r=>({id:r.id,data:()=>r}))});
test('Firestore realtime listener delivers confirmed mobile writes to the same user on another device',()=>{
 const {s,streams}=streamService(),repo=new FirebaseRepository(s),received=[],errors=[];
 const stop=repo.subscribe((table,rows)=>received.push({table,rows}),e=>errors.push(e));
 assert.equal(streams.size,4);assert.ok([...streams.keys()].every(path=>path.startsWith('users/owner/')));
 const stream=streams.get('users/owner/WebMeals');assert.equal(stream.options.includeMetadataChanges,true);
 const [meal]=parseMeals('1 chuối',{date:'2026-10-30'});
 stream.next(snap([],true));assert.equal(received.length,0,'initial stale cache must not erase server-loaded entries');
 stream.next(snap([meal]));assert.equal(received[0].rows[0]._revision,meal.updated_at);
 stream.next(snap([{...meal,food:'Edited on mobile',updated_at:'v2'}]));assert.equal(received[1].rows[0].food,'Edited on mobile');
 stop();assert.ok([...streams.values()].every(x=>x.stopped));stream.next(snap([]));assert.equal(received.length,2);assert.equal(errors.length,0);
});
test('Realtime subscriptions stop and refuse queued snapshots after account changes or server errors',()=>{
 const {s,streams}=streamService(),repo=new FirebaseRepository(s),rows=[],errors=[];repo.subscribe((t,r)=>rows.push(r),e=>errors.push(e));
 s.auth.currentUser={uid:'other'};streams.get('users/owner/WebMeals').next(snap([]));assert.equal(rows.length,0);assert.match(errors[0].message,/Tài khoản/);assert.ok([...streams.values()].every(x=>x.stopped));
 const f=streamService();new FirebaseRepository(f.s).subscribe(()=>assert.fail('error must detach callbacks'),e=>errors.push(e));f.streams.get('users/owner/WebMeals').error({code:'permission-denied'});assert.ok([...f.streams.values()].every(x=>x.stopped));f.streams.get('users/owner/WebWorkouts').next(snap([]));
});
test('Replacing the repository invalidates queued callbacks before unsubscribe; live events preserve other tables',()=>{
 let current,stops=0;const received=[],errors=[];
 const make=()=>({subscribe(next,error){this.next=next;this.error=error;return ()=>{stops++;this.next('WebMeals',[{id:'late'}]);};}});
 const one=make(),two=make();current=one;
 const sync=createLiveSync({isCurrent:r=>r===current,onRows:(t,r)=>received.push([t,r]),onError:e=>errors.push(e)});
 sync.start(one);one.next('WebMeals',[{id:'one'}]);current=two;sync.start(two);one.next('WebMeals',[]);one.error(Error('late'));
 two.next('WebWorkouts',[{id:'two'}]);assert.equal(received.length,2);assert.equal(errors.length,0);sync.stop();assert.equal(stops,2);two.next('WebMeals',[]);assert.equal(received.length,2);
});
test('Local repair transfers private photo bytes before meal refs, seeds only missing foods, and remains resumable',async()=>{
 const [meal]=parseMeals('1 chuối',{date:'2026-10-30'});meal.photo_ids=['image1'];const local=emptyData();local.WebMeals=[meal];
 const events=[],localRepo={load:async()=>local,getPhoto:async id=>({id,meal_id:meal.id,data_url:'data:image/jpeg;base64,YQ==',created_at:meal.created_at}),loadFoods:async()=>DEFAULT_FOODS.map(f=>({...f,_revision:'local'}))};
 const cloud={uid:'owner',ownerUid:'owner',load:async()=>emptyData(),loadFoods:async()=>[DEFAULT_FOODS[0]],savePhoto:async p=>events.push(['photo',p.id]),saveFood:async(f,options)=>{assert.equal(f._revision,undefined);assert.equal(options.insertOnly,true);events.push(['food',f.id]);},importBundle:async bundle=>{events.push(['import']);assert.equal(bundle.data.WebMeals[0].photo_ids[0],'image1');return {inserted:1,skipped:0};}};
 assert.deepEqual(await transferLocalData(localRepo,cloud),{inserted:1,skipped:0});assert.equal(events[0][0],'photo');assert.equal(events.at(-1)[0],'import');assert.equal(events.filter(x=>x[0]==='food').length,DEFAULT_FOODS.length-1);
 cloud.load=async()=>local;localRepo.getPhoto=async()=>assert.fail('existing cloud entries must not retransfer local photos');await transferLocalData(localRepo,cloud);assert.equal(localMissingCount(local,local),0);assert.equal(localMissingCount(local,emptyData()),1);
 cloud.ownerUid='another-user';await assert.rejects(()=>transferLocalData(localRepo,cloud),/dữ liệu của mình/);
});
test('A photo transfer failure never creates a cloud meal referencing missing bytes',async()=>{
 const [meal]=parseMeals('1 chuối',{date:'2026-10-30'});meal.photo_ids=['missing'];const local={...emptyData(),WebMeals:[meal]};let imported=false;
 const localRepo={load:async()=>local,getPhoto:async()=>{throw Error('Không tìm thấy ảnh');}};
 const cloud={uid:'owner',ownerUid:'owner',load:async()=>emptyData(),importBundle:async()=>{imported=true;}};
 await assert.rejects(()=>transferLocalData(localRepo,cloud),/Không tìm thấy ảnh/);assert.equal(imported,false);
});

test('An in-flight read from the previous account cannot replace the new account data',async()=>{
 let finish;const old={load:()=>new Promise(resolve=>{finish=resolve;})},current={WebMeals:[{id:'new-account'}]};
 const state={mode:'firebase',repo:old,data:emptyData()},pending=loadCurrentData(state);state.repo={load:async()=>current};state.data=current;finish({WebMeals:[{id:'old-account'}]});assert.equal(await pending,false);assert.equal(state.data,current);
 assert.equal(await loadCurrentData(state),true);
});
