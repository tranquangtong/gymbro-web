import {num} from './core.js';
export const SESSION_MS=14*24*60*60*1000;
export function sessionExpiry(authTime){const started=Date.parse(authTime);if(!Number.isFinite(started))throw Error('Không xác minh được phiên đăng nhập. Hãy đăng nhập lại.');return started+SESSION_MS;}
export function sessionValid(expiresAt,now=Date.now()){return typeof expiresAt==='number'&&Number.isFinite(expiresAt)&&now<expiresAt;}
export function assertSession(expiresAt,now=Date.now()){if(!sessionValid(expiresAt,now)){const e=Error('Phiên đăng nhập đã hết hạn 14 ngày. Hãy đăng nhập Google lại.');e.code='auth/session-expired';throw e;}}
export async function verifySession(service){const user=service.auth.currentUser;if(!user)throw Error('Hãy đăng nhập Google.');const result=await service.authSDK.getIdTokenResult(user);if(service.auth.currentUser?.uid!==user.uid)throw Error('Tài khoản đã thay đổi. Đăng nhập lại.');const expires=sessionExpiry(result.authTime);assertSession(expires);service.sessionExpiresAt=expires;return expires;}
export function profileDetails(profile={}){const goal=profile.goal&&typeof profile.goal==='object'&&!Array.isArray(profile.goal)?profile.goal:{};return {weight_kg:profile.weight_kg,height_cm:profile.height_cm,bmr_kcal:goal.bmr_kcal,tdee_kcal:profile.TDEE,target_weight_kg:goal.target_weight_kg,training_goal:goal.training_goal|| (typeof profile.goal==='string'?profile.goal:''),age:profile.age,gender:profile.gender,activity_factor:goal.activity_factor};}
export function validatePersonalProfile(profile){
  const p=profileDetails(profile);
  const required=(value,label,min,max)=>{const n=num(value);if(n===null||n<min||n>max)throw Error(`Nhập ${label} hợp lệ (${min}–${max}).`);};
  required(p.weight_kg,'cân nặng hiện tại (kg)',.1,500);required(p.height_cm,'chiều cao (cm)',50,250);required(p.bmr_kcal,'BMR (kcal/ngày)',300,8000);required(p.tdee_kcal,'TDEE (kcal/ngày)',300,20000);required(p.target_weight_kg,'cân nặng mục tiêu (kg)',.1,500);
  if(Number(p.tdee_kcal)<Number(p.bmr_kcal))throw Error('TDEE cần lớn hơn hoặc bằng BMR.');
  if(typeof p.training_goal!=='string'||!p.training_goal.trim()||p.training_goal.length>500)throw Error('Nhập mục tiêu tập luyện (tối đa 500 ký tự).');
  return profile;
}
export function profileComplete(profile){try{validatePersonalProfile(profile);return true;}catch{return false;}}
export function estimateEnergy({weight_kg,height_cm,age,gender,activity_factor}){
  const weight=num(weight_kg),height=num(height_cm),years=num(age),factor=num(activity_factor);
  if(weight===null||weight<=0||weight>500||height===null||height<50||height>250||!Number.isInteger(years)||years<18||years>100||!['male','female'].includes(gender)||![1.2,1.375,1.55,1.725,1.9].includes(factor))throw Error('Để ước tính, nhập cân nặng, chiều cao, tuổi từ 18–100, giới tính dùng cho công thức và mức vận động.');
  // Mifflin–St Jeor estimates resting energy expenditure; not a measured BMR.
  // https://pubmed.ncbi.nlm.nih.gov/2305711/
  const bmr=Math.round(10*weight+6.25*height-5*years+(gender==='male'?5:-161));
  return {bmr_kcal:bmr,tdee_kcal:Math.round(bmr*factor)};
}
export function accessStage(state,now=Date.now()){
  if(state.authRestoring)return 'restoring';
  if(state.mode!=='firebase'||!state.connected||!sessionValid(state.repo?.s.sessionExpiresAt,now))return 'login';
  if(!state.initialized)return 'loading';
  return profileComplete(state.accountProfile)?'ready':'profile';
}
