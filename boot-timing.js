// Milestones of the current app start, in ms since the page began loading, so a slow
// start can be traced to a step (shown under Thêm → Tài khoản). Each step is kept once.
export const BOOT_STEPS=[
  ['cached','dữ liệu đã lưu'],
  ['firebase','thư viện đăng nhập'],
  ['token','kiểm tra phiên'],
  ['data','tải dữ liệu máy chủ'],
  ['ready','sẵn sàng']
];

export function createBootTiming(now=()=>globalThis.performance?.now?.()??0){
  const marks={};
  return {marks,mark(step){if(!(step in marks))marks[step]=Math.round(now());}};
}

export function describeBootTiming(marks){
  const parts=BOOT_STEPS.filter(([k])=>Number.isFinite(marks?.[k])).map(([k,label])=>`${label} ${(marks[k]/1000).toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1})} s`);
  return parts.length?'Lần mở này (tính từ lúc mở app): '+parts.join(' · ')+'.':'';
}
