// Which backend stores the logs. Firebase Authentication is used for sign-in either way.
// kind: 'firebase'   → Firestore (current source of truth).
//       'cloudflare' → Workers + D1 at apiBase (switch only after the migration reconciles).
// apiBase is public: the Worker checks every request's Firebase ID token.
export const BACKEND = Object.freeze({
  kind: 'firebase',
  apiBase: 'https://gymbro-api.tongquangtran.workers.dev'
});
