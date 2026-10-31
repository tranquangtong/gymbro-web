// Verifies Firebase Authentication ID tokens without the Admin SDK.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
export const SESSION_MAX_MS = 14 * 24 * 60 * 60 * 1000; // matches access.js SESSION_MS
const SKEW_S = 60;

export class AuthError extends Error {
  constructor(message, status = 401) { super(message); this.status = status; }
}

let keyCache = { keys: null, expires: 0 };
export function resetKeyCache() { keyCache = { keys: null, expires: 0 }; }

async function signingKeys(fetchImpl, now) {
  if (keyCache.keys && now < keyCache.expires) return keyCache.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new AuthError('Không tải được khoá xác minh của Firebase.', 503);
  const { keys } = await res.json();
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  keyCache = { keys: new Map(keys.map(k => [k.kid, k])), expires: now + Math.min(maxAge, 6 * 3600) * 1000 };
  return keyCache.keys;
}

const b64urlBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export async function verifyIdToken(token, { projectId, adminEmail, fetchImpl = fetch, now = Date.now() }) {
  if (typeof token !== 'string' || token.split('.').length !== 3) throw new AuthError('Thiếu hoặc sai ID token. Đăng nhập lại.');
  const [h, p, s] = token.split('.');
  let header, claims;
  try { header = b64urlJson(h); claims = b64urlJson(p); } catch { throw new AuthError('ID token không đọc được.'); }
  if (header.alg !== 'RS256' || !header.kid) throw new AuthError('ID token sai thuật toán.');
  const keys = await signingKeys(fetchImpl, now);
  const jwk = keys.get(header.kid);
  if (!jwk) { resetKeyCache(); throw new AuthError('ID token dùng khoá không còn hợp lệ. Đăng nhập lại.'); }
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new AuthError('Chữ ký ID token không hợp lệ.');
  const t = Math.floor(now / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError('ID token không thuộc dự án GymBro.');
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_S < t) throw new AuthError('ID token đã hết hạn. Tải lại trang.');
  if (typeof claims.iat !== 'number' || claims.iat - SKEW_S > t) throw new AuthError('ID token có thời điểm phát hành không hợp lệ.');
  if (typeof claims.auth_time !== 'number' || claims.auth_time - SKEW_S > t) throw new AuthError('ID token thiếu thời điểm đăng nhập.');
  if (now - claims.auth_time * 1000 > SESSION_MAX_MS) throw new AuthError('Phiên đăng nhập đã quá 14 ngày. Hãy đăng nhập Google lại.');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new AuthError('ID token thiếu UID.');
  const email = typeof claims.email === 'string' ? claims.email : '';
  return {
    uid: claims.sub,
    email,
    name: typeof claims.name === 'string' ? claims.name : '',
    admin: claims.email_verified === true && email === adminEmail
  };
}
