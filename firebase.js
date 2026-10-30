import {DEFAULT_FOODS,cleanFood,validateFood} from './quick.js';
import {validatePhoto} from './media.js';
import {firebaseConfig} from './firebase-config.js';
import {SCHEMAS,emptyData,validateRecord} from './core.js';
import {cleanRecord,validateArchive} from './migration.js';

export const ADMIN_EMAIL='tongquangtran@gmail.com';
export const isAdmin = user => user?.emailVerified === true && user.email === ADMIN_EMAIL;
let service;
export async function firebaseService() {
  if(!service) service=(async()=>{
    const [appSDK,authSDK,dbSDK]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
    ]);
    const app=appSDK.initializeApp(firebaseConfig),auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
    await auth.authStateReady();
    return {auth,db,authSDK,dbSDK};
  })().catch(e=>{service=null;throw e;});
  return service;
}
export async function loginGoogle() {
  const s=await firebaseService();const provider=new s.authSDK.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  await s.authSDK.signInWithPopup(s.auth,provider);return s;
}
export async function logoutFirebase(){const s=await firebaseService();await s.authSDK.signOut(s.auth);}
export function firebaseError(e){return ({'auth/unauthorized-domain':'Thêm tranquangtong.github.io vào Authentication → Settings → Authorized domains.','auth/operation-not-allowed':'Bật Google trong Authentication → Sign-in method.','auth/popup-blocked':'Trình duyệt chặn popup. Cho phép popup rồi bấm đăng nhập lại.','auth/popup-closed-by-user':'Bạn đã đóng cửa sổ đăng nhập.','permission-denied':'Firestore chưa cấp quyền. Publish file firestore.rules trong Firebase Console rồi thử lại.','unavailable':'Không kết nối được Firestore. Kiểm tra mạng; nội dung form vẫn được giữ.','failed-precondition':'Firestore chưa sẵn sàng. Kiểm tra đã tạo database (default) và publish Rules.'})[e.code]||e.message||'Không kết nối được Firebase.';}

export class FirebaseRepository {
  constructor(s,targetUid=null){this.s=s;this.uid=s.auth.currentUser?.uid;if(!this.uid)throw Error('Hãy đăng nhập Google.');this.ownerUid=targetUid||this.uid;this.check();this.title=this.ownerUid===this.uid?'Firebase · '+s.auth.currentUser.email:'ADMIN · dữ liệu UID '+this.ownerUid;}
  check(){if(this.s.auth.currentUser?.uid!==this.uid)throw Error('Tài khoản đã thay đổi. Đăng nhập lại trước khi ghi dữ liệu.');if(this.ownerUid!==this.uid&&!isAdmin(this.s.auth.currentUser))throw Error('Chỉ admin được mở dữ liệu người khác.');}
  ref(table,id){if(![...Object.keys(SCHEMAS),'Archive'].includes(table))throw Error('Loại dữ liệu không hợp lệ.');return this.s.dbSDK.doc(this.s.db,'users',this.ownerUid,table,id);}
  async registerOwner(){this.check();const user=this.s.auth.currentUser;await this.s.dbSDK.setDoc(this.s.dbSDK.doc(this.s.db,'users',this.uid),{uid:this.uid,email:user.email,display_name:user.displayName||'',updated_at:new Date().toISOString()});}
  async listUsers(){this.check();if(!isAdmin(this.s.auth.currentUser))throw Error('Chỉ admin được xem danh sách tài khoản.');const snapshot=await this.s.dbSDK.getDocsFromServer(this.s.dbSDK.collection(this.s.db,'users'));return snapshot.docs.map(d=>({...d.data(),uid:d.id}));}
  async load(){this.check();const data=emptyData();try{await Promise.all([...Object.keys(SCHEMAS),'Archive'].map(async table=>{const q=this.s.dbSDK.collection(this.s.db,'users',this.ownerUid,table);const snapshot=await this.s.dbSDK.getDocsFromServer(q);data[table]=snapshot.docs.map(d=>({...d.data(),id:d.id,_revision:d.data().updated_at}));}));this.check();return data;}catch(e){throw Error(firebaseError(e));}}
  async save(table,record,{insertOnly=false}={}){
    this.check();const clean=cleanRecord(table,record);if(table==='Archive')validateArchive(clean);else validateRecord(table,clean);
    let inserted=false;
    try{await this.s.dbSDK.runTransaction(this.s.db,async tx=>{
      inserted=false;this.check();const ref=this.ref(table,clean.id),snap=await tx.get(ref);
      if(snap.exists()){
        if(insertOnly)return;
        const old=snap.data();
        if(JSON.stringify(cleanRecord(table,old))===JSON.stringify(clean))return;
        const expected=record._originalUpdatedAt??record._revision;
        if(expected&&old.updated_at!==expected)throw Error('Mục này đã được sửa trên thiết bị khác. Hãy làm mới rồi mở lại.');
      }else if(record._revision)throw Error('Bản ghi không còn tồn tại. Hãy làm mới dữ liệu.');
      tx.set(ref,clean);inserted=true;
    });this.check();return inserted;}catch(e){throw Error(firebaseError(e));}
  }
  async saveMany(table,records){
    this.check();if(!records.length||records.length>100)throw Error('Mỗi lần lưu từ 1 đến 100 mục.');
    const cleans=records.map(r=>{const clean=cleanRecord(table,r);validateRecord(table,clean);return clean;});
    if(new Set(cleans.map(r=>r.id)).size!==cleans.length)throw Error('Trùng ID trong lần lưu.');
    try{await this.s.dbSDK.runTransaction(this.s.db,async tx=>{
      this.check();const refs=cleans.map(r=>this.ref(table,r.id)),snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
      records.forEach((r,i)=>{const expected=r._originalUpdatedAt??r._revision;if(expected&&(!snaps[i].exists()||snaps[i].data().updated_at!==expected))throw Error('Nhật ký đã thay đổi trên thiết bị khác. Làm mới rồi tạo lại prompt.');});
      cleans.forEach((r,i)=>tx.set(refs[i],r));
    });this.check();}catch(e){throw Error(firebaseError(e));}
  }
  async loadFoods(){this.check();try{const snap=await this.s.dbSDK.getDocsFromServer(this.s.dbSDK.collection(this.s.db,'users',this.ownerUid,'FoodLibrary'));return snap.docs.map(d=>({...d.data(),id:d.id,_revision:d.data().updated_at}));}catch(e){throw Error(firebaseError(e));}}
  async seedFoods(){this.check();for(const food of DEFAULT_FOODS){const ref=this.s.dbSDK.doc(this.s.db,'users',this.ownerUid,'FoodLibrary',food.id);await this.s.dbSDK.runTransaction(this.s.db,async tx=>{this.check();const snap=await tx.get(ref);if(!snap.exists())tx.set(ref,cleanFood({...food,updated_at:new Date().toISOString()}));});}return this.loadFoods();}
  async saveFood(food){this.check();const clean=cleanFood(food);validateFood(clean);const ref=this.s.dbSDK.doc(this.s.db,'users',this.ownerUid,'FoodLibrary',clean.id);try{await this.s.dbSDK.runTransaction(this.s.db,async tx=>{this.check();const old=await tx.get(ref);if(food._revision&&(!old.exists()||old.data().updated_at!==food._revision))throw Error('Món đã thay đổi trên thiết bị khác. Mở lại thư viện.');tx.set(ref,clean);});}catch(e){throw Error(firebaseError(e));}}
  async savePhoto(photo){this.check();validatePhoto(photo);try{await this.s.dbSDK.setDoc(this.s.dbSDK.doc(this.s.db,'users',this.ownerUid,'MealPhotos',photo.id),photo);}catch(e){throw Error(firebaseError(e));}}
  async getPhoto(id){this.check();const d=await this.s.dbSDK.getDocFromServer(this.s.dbSDK.doc(this.s.db,'users',this.ownerUid,'MealPhotos',id));this.check();if(!d.exists())throw Error('Không tìm thấy ảnh.');return validatePhoto({...d.data(),id:d.id});}
  async importBundle(bundle,onProgress=()=>{}){
    const entries=[...Object.keys(SCHEMAS),'Archive'].flatMap(table=>(bundle.data[table]||[]).map(record=>({table,record})));
    // Validate the entire payload before any writes. Deterministic IDs make interrupted imports resumable.
    for(const {table,record} of entries){const clean=cleanRecord(table,record);table==='Archive'?validateArchive(clean):validateRecord(table,clean);}
    let inserted=0,skipped=0;
    for(let i=0;i<entries.length;i++){const {table,record}=entries[i];(await this.save(table,record,{insertOnly:true}))?inserted++:skipped++;onProgress({done:i+1,total:entries.length,inserted,skipped});}
    return {inserted,skipped};
  }
}
