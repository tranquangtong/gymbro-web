// Network/timeout failures: retry later. Anything else (revoked token, bad session) is not retried.
export const TRANSIENT=['unavailable','auth/network-request-failed'];
export function unavailable(){const e=Error('Không kết nối được máy chủ GymBro. Kiểm tra mạng; nội dung đang nhập vẫn được giữ.');e.code='unavailable';return e;}
// Race the entire operation: token refresh, fetch and response body share one deadline.
export async function withTimeout(run,timeoutMs=15000,onTimeout=()=>{}){
  let timer;
  try{return await Promise.race([Promise.resolve().then(run),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(unavailable());onTimeout();},timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
