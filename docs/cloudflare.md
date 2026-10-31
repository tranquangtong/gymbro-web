# Cloudflare backend (Workers + D1)

GitHub Pages still serves the web app and Firebase Authentication still handles Google sign-in.
Logs move from Firestore to a Cloudflare D1 database behind a Worker API. Free plan only:
Workers Free (100,000 requests/day) and D1 Free (5 million rows read, 100,000 rows written per day, 5 GB).
No R2 and no paid product is used. Meal photos stay on the device (IndexedDB) and expire after 5 days.

## How it fits together

| Piece | Where |
|---|---|
| Web app | GitHub Pages, unchanged URL |
| Sign-in | Firebase Authentication (Google) |
| API | `worker/` → `https://gymbro-api.<your-subdomain>.workers.dev` |
| Database | D1 `gymbro`, schema in `worker/migrations/` |
| Switch | `backend-config.js` (`kind: 'firebase'` → `'cloudflare'`) |

The Worker checks every request's Firebase ID token (signature against Google's public keys, project
`gymbro-web`, expiry, and the 14-day session limit). Each user only reaches rows with their own UID.
`tongquangtran@gmail.com` is admin only when Firebase reports the email as verified; the admin may pass
`owner=<uid>` to read and edit another account. Deletes stay soft (`deleted: true`).

Queries are by day or date range on the `(owner_uid, kind, date, id)` index, paged 1,000 rows at a time.
The app loads the last 120 days of meals and workouts plus all profile/archive rows, and pages older
dates in only when History or the Dashboard date needs them. Sync polls `/v1/changes` every 45 seconds
while the tab is visible instead of holding realtime listeners.

## One-time setup (owner)

1. **Cloudflare account** (free): sign up at https://dash.cloudflare.com/sign-up and verify the email.
2. **workers.dev subdomain**: open *Workers & Pages* once in the dashboard; Cloudflare asks you to pick a
   subdomain the first time. Choose any name.
3. **Account ID**: on *Workers & Pages* → *Overview*, copy *Account ID* from the right-hand column.
4. **API token**: *My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template*.
   Under *Permissions* add a row **Account → D1 → Edit**. Under *Account Resources* pick your account.
   Create the token and copy it (shown once).
5. **GitHub secrets**: repository *Settings → Secrets and variables → Actions → New repository secret*:
   - `CLOUDFLARE_API_TOKEN` = the token from step 4
   - `CLOUDFLARE_ACCOUNT_ID` = the ID from step 3

   Never paste these into chat or commit them.
6. Run **Actions → Deploy Cloudflare API → Run workflow**. It creates D1 `gymbro` if missing, applies the
   migrations, deploys the Worker, then checks `/v1/health` and that unauthenticated calls get 401.
   The job summary prints `API_URL=…`.
7. Put that URL in `backend-config.js` as `apiBase` (keep `kind: 'firebase'`) and publish.

## Migrate Firestore → D1

1. Sign in on the published app as `tongquangtran@gmail.com`.
2. *Thêm → Chuyển dữ liệu sang Cloudflare → Chuyển mọi tài khoản* (or *Chuyển dữ liệu của tôi*).
   It reads each Firestore collection once, copies rows with their IDs and owner UID, and never writes to
   or deletes from Firestore. Running it again is safe: an existing D1 row is only replaced when Firestore
   has a later `updated_at`.
3. Check the reconcile table: every type must say **Khớp** (same count and same SHA-256 fingerprint of
   `id|updated_at|deleted`). Any difference lists the missing / changed / extra IDs.

If Firestore still reports *Quota exceeded*, wait for the daily reset (midnight Pacific time) and run
step 2 again. Nothing is lost by retrying.

## Switch over

When every account reconciles, set `kind: 'cloudflare'` in `backend-config.js` and publish. Firestore
stays untouched as a read-only copy; the app no longer loads the Firestore SDK except for the migration
tool. To roll back, set `kind: 'firebase'` again (logs written to D1 after the switch would then need
copying back).

## Local development

```bash
cd worker
npx wrangler@4 d1 migrations apply gymbro --local
npx wrangler@4 dev --local
```

Tests (`npm test`) run the Worker against an in-memory SQLite stand-in for D1 and sign real RS256 tokens.
