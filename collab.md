# Collab config — GymBro Web

## Stack
- Vanilla JS ES modules (no npm deps, no build step), static PWA on GitHub Pages (`index.html`, `sw.js`)
- Auth: Firebase Authentication (Google). Data: Firestore (`firestore.rules`) → migrating to
  Cloudflare Worker + D1 (`worker/`, switch in `src/config/backend-config.js`, see `docs/cloudflare.md`)
- UI text and commit messages are in Vietnamese

## Commands
- Install: none (no dependencies)
- Test: `npm test` (node --test tests/*.test.mjs)
- Syntax check: `npm run check` (globs src/**, sw.js, scripts/, worker/src/)
- Run/dev: `npm run dev` → http://127.0.0.1:4173

## Roles (overrides global routing)
- lead: whoever the user is chatting with
- codex: logic in src/core/ + src/data/ + worker/, tests, reviewing every diff before merge
- agy: UI (src/ui/, src/app.js render code, assets/style.css, index.html), Vietnamese copy, docs/README, codebase research

## Permissions
- codex: may edit (worktree, -w)
- agy: may edit (worktree, -w; file edits only, lead runs check + test)
- Never touch: `.migration/`, personal history/JSON exports, secrets/tokens/service-account keys
- Do not edit existing `worker/migrations/*.sql`; add a new numbered file instead
- Pushing to main deploys the Worker (.github/workflows/deploy-worker.yml): only the lead pushes

## Project rules
- Done = `npm run check` and `npm test` both pass
- New behaviour needs a test in `tests/*.test.mjs` (parser changes → quick.test.mjs)
- User-facing change: bump `version` in package.json (semver) and mention it in the commit (e.g. "v2.18.0")
- Keep the app dependency-free; Firebase SDK stays loaded from the official CDN
- Only allowlisted fields are written/exported/imported; keep schema changes in sync across
  src/core/core.js, firestore.rules and worker/src/store.js (?)
- Unknown kcal/macro = empty, not 0
- Lead commits on a branch and opens a PR (history uses squash-merged PRs)
- Layout: see README "Cấu trúc thư mục"; `src/core/` must not import from data/ or ui/ (Worker bundles it)
