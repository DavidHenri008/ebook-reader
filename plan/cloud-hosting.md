# Plan: Host the EPUB Reader in the cloud (accounts + Google Drive storage)

This plan turns the existing local-first PWA into a **cloud-hosted web app** that:

- lets users **sign in / log in** (Google Sign-In),
- stores each user's EPUB library in **their own Google Drive** (per-user storage),
- is **ready to deploy to a cloud host** (static host or a cloud server).

The local-first behaviour stays as the **default/offline mode**. Google Drive is
an **opt-in, additive** per-user storage layer, not a replacement. Nothing the
user reads is stored on an application-owned server.

> **Guardrail note:** The project guidelines say "no cloud sync unless the user
> explicitly asks." This plan **is** that explicit opt-in. The app must still work
> fully offline and sign-in must remain optional.

## Recommended architecture (why it stays cheap)

**Static SPA + client-side Google OAuth + Google Drive REST API.**

- The app is already a static Vite build (`base: "./"`, hash routing via TanStack
  Router, VitePWA). It deploys to any static host with **no server rewrites**.
- Identity + Drive access happen **in the browser** using Google Identity Services
  (GIS). The OAuth **Client ID is public** (no client secret in the SPA), so there
  is **no backend and no database to run** in the default model.
- EPUB bytes, a small library index, and reading state live in the **user's own
  Google Drive**. The app stores **zero** user content server-side.

Result: hosting can be **$0** on a free static tier (plus an optional ~$10/yr
domain). A thin optional backend (BFF) is described in Phase 7 for teams that need
server-held secrets, refresh tokens, or non-Google login.

> **Execution note for AI:** Phases are ordered so each one leaves the project in a
> working state. Do **not** start a phase until the previous one's acceptance
> criteria pass. Each phase lists the files it touches, the work, and how to verify
> it. Do not break `npm run build`, `npm run lint`, or `npm test` at any point.

---

## Current state (baseline assessment)

| Area                 | Today                                                                                                   | Cloud implication                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Hosting model        | Static Vite build + PWA, `base: "./"` in [vite.config.ts](../vite.config.ts)                            | Deploys to any static host as-is; relative assets already work under subpaths.                              |
| Routing              | TanStack Router **hash history** in [src/router.tsx](../src/router.tsx)                                 | Hash URLs need **no SPA rewrite rules** — ideal for static hosts and GitHub Pages subpaths.                 |
| Auth                 | None                                                                                                    | Add **Google Sign-In** (OAuth 2.0 / GIS) for identity and login.                                            |
| Book identity        | SHA-256 **content hash** as `id` in [src/storage/library.ts](../src/storage/library.ts)                 | Deterministic key for Drive filenames, dedup, and conflict-free byte storage.                               |
| Library storage      | `StoredBook` (incl. `fileData: ArrayBuffer`) in IndexedDB via [src/storage/db.ts](../src/storage/db.ts) | EPUB bytes + a small index sync to Drive; keep IndexedDB as the local source of truth.                      |
| Reading state        | `StoredReadingState` in [src/storage/readingState.ts](../src/storage/readingState.ts)                   | Small JSON → good cross-device sync candidate (last-write-wins by `updatedAt`).                             |
| Extraction cache     | Derived `extracted-*` stores in [src/storage/bookCache.ts](../src/storage/bookCache.ts)                 | **Do not sync** — regenerate locally from the EPUB bytes.                                                   |
| Networking           | Fully offline; no network for content                                                                   | Introduces network to **Google APIs only**; must stay optional and offline-tolerant.                        |
| Secrets              | None in the client                                                                                      | OAuth **Client ID is public** and safe in the SPA; any real secret requires the optional backend (Phase 7). |
| PWA / service worker | App-shell only in [vite.config.ts](../vite.config.ts)                                                   | Keep app-shell caching; **never** cache API/token responses or user content.                                |

---

## Decisions to confirm before Phase 0 (defaults proposed)

An AI executing this plan should use the defaults unless the user overrides them.

- **Identity provider:** Google Sign-In (default — it directly enables Drive).
  Optional email/password or other providers come later via the Phase 7 backend.
- **Storage backend:** the user's own **Google Drive**.
- **Drive location & scope (least privilege):** default to the hidden
  **`appDataFolder`** with scope `https://www.googleapis.com/auth/drive.appdata`
  for maximum privacy (files are app-managed and invisible in the user's Drive UI).
  Alternative: `https://www.googleapis.com/auth/drive.file` if the user should
  **see/manage** their EPUBs in Drive (per-file, app-created only). **Avoid** the
  broad `drive`/`drive.readonly` scopes.
- **Identity scopes:** `openid email profile`.
- **Auth model:** browser-only **token model** (GIS `initTokenClient`, PKCE).
  Short-lived access tokens, silently re-requested. **No** refresh token stored in
  the browser. (Phase 7 adds refresh tokens if needed.)
- **Hosting:** static host. Default **Cloudflare Pages** (or **GitHub Pages** since
  the repo is on GitHub). **Firebase Hosting** is a strong Google-native alternative.
- **Sync model:** local-first, **last-write-wins** by `updatedAt` / Drive
  `modifiedTime`. Offline edits queue and push on reconnect.
- **Data ownership:** books + reading state live in the user's Drive. The app
  stores **no** user content server-side. Sign-out clears local tokens (and offers
  to clear the local cache).

---

## Phase 0 — Google Cloud + hosting prerequisites (no code changes)

**Goal:** Stand up the Google Cloud OAuth project so later phases have a Client ID,
and pick a host.

**Steps**

1. Create (or select) a **Google Cloud project**.
2. **Enable the Google Drive API** (APIs & Services → Library).
3. Configure the **OAuth consent screen** (User type _External_): app name,
   support email, developer contact, app logo/domain. Add the scopes
   (`openid`, `email`, `profile`, and `drive.appdata` **or** `drive.file`). Add
   **Authorized domains**. While in _Testing_, add **test users**. Plan for
   **verification** before public launch (see Risks — Drive scopes may require
   Google's OAuth app verification/brand review; confirm current requirements).
4. Create **Credentials → OAuth client ID → Web application**. Add
   **Authorized JavaScript origins**: `http://localhost:5173`, `http://localhost:4173`,
   and the future production origin(s). (GIS token model uses JS origins; add
   redirect URIs only if you adopt a redirect code flow.)
5. Record the **Client ID** (public). There is **no client secret** in the SPA path.
6. Choose a host (see [Cheap hosting options](#cheap-hosting-options-static-spa))
   and, optionally, a custom domain.

**Files touched:** docs only (record decisions in this plan or a new
`docs/cloud-deploy.md`).

**Acceptance criteria**

- A **Web** OAuth Client ID exists; consent screen is configured with least-privilege scopes.
- No source/build changes; `npm run build`, `npm run lint`, `npm test` unaffected.

---

## Phase 1 — Make the SPA cloud/deploy-ready (config, env, headers)

**Goal:** The existing static build deploys cleanly and reads the OAuth Client ID
from the environment, while staying fully functional signed-out/offline.

**Steps**

1. **Typed env:** add `VITE_GOOGLE_CLIENT_ID` (and optional `VITE_DRIVE_SCOPE`).
   Create `.env.example`, and extend `ImportMetaEnv` in
   [src/vite-env.d.ts](../src/vite-env.d.ts). Never hardcode the ID in source.
2. **Routing/base sanity:** confirm hash routing + `base: "./"` in
   [vite.config.ts](../vite.config.ts) work on a static host and under a subpath
   (e.g. GitHub Pages `/<repo>/`). No SPA fallback rule is needed with hash routing.
3. **Security headers / CSP:** add a Content-Security-Policy that allows only what
   Google Sign-In and Drive need and nothing else:
   - `script-src` → `'self' https://accounts.google.com/gsi/client`
   - `connect-src` → `'self' https://www.googleapis.com https://content.googleapis.com https://oauth2.googleapis.com https://accounts.google.com`
   - `frame-src` / `frame-ancestors` → `https://accounts.google.com`
     Provide this per host (`public/_headers` for Cloudflare/Netlify, `firebase.json`
     headers for Firebase, or a `<meta http-equiv>` fallback in [index.html](../index.html)).
     Keep the PWA app-shell cache; ensure Drive/token responses are **network-only**
     (never precached or runtime-cached).
4. **Feature gating:** the app must run with **no** sign-in (local-only). All cloud
   features are gated behind an authenticated session.

**Files touched:** new `.env.example`, [src/vite-env.d.ts](../src/vite-env.d.ts),
[vite.config.ts](../vite.config.ts), new `public/_headers` (host-specific),
possibly [index.html](../index.html).

**Acceptance criteria**

- `npm run build`, `npm run lint`, `npm test` pass.
- `npm run preview` works **signed-out**; import/read/restore still function locally.
- The Client ID is read from env; CSP allows the Google endpoints and blocks others.
- The web PWA still installs and caches only the app shell.

---

## Phase 2 — Authentication (Sign in with Google)

**Goal:** Users can sign in, and the app knows their identity.

**Steps**

1. **Auth module (narrow seam):** add `src/auth/` with `googleIdentity.ts`
   (load GIS, init, sign-in, sign-out) and an `AuthProvider` + `useAuth()` hook
   exposing `{ user, status, signIn, signOut }`. Follow the repo convention of a
   thin integration boundary (like `src/services/epubjsAdapter.ts`).
2. **Identity:** use the GIS **ID token** (JWT credential) to read `sub`, `email`,
   `name`, `picture`. Validate audience/issuer/expiry (client-side check now; the
   Phase 7 backend can verify server-side later). Keep a lightweight session in
   memory (+ optional `sessionStorage`); **do not** persist long-lived secrets.
3. **UI:** an account control on [src/pages/HomePage.tsx](../src/pages/HomePage.tsx)
   (and/or the reader toolbar). Signed-out → "Sign in with Google"; signed-in →
   avatar/menu with **Sign out**.
4. **Sign-out:** clear the session/tokens and return to local-only mode.

**Files touched:** new `src/auth/*`, [src/pages/HomePage.tsx](../src/pages/HomePage.tsx),
[src/main.tsx](../src/main.tsx) (provider), [index.html](../index.html) (GIS script
or dynamic load), possibly [src/components/reader/ReaderToolbar.tsx](../src/components/reader/ReaderToolbar.tsx).

**Acceptance criteria**

- Sign-in/sign-out works in dev and `preview`; identity (name/avatar) is displayed.
- No secrets in the bundle; tokens are not in `localStorage`.
- Tests stay green (auth mocked / behind the seam).

---

## Phase 3 — Google Drive integration (per-user storage)

**Goal:** Read and write the user's library to their own Drive.

**Steps**

1. **Drive access token:** use GIS `google.accounts.oauth2.initTokenClient` with the
   chosen scope. Request the token on demand (first sync / an explicit "Enable cloud
   storage" action). Handle expiry with a silent re-request; handle user denial.
2. **Drive REST client:** add `src/services/drive/driveClient.ts` wrapping the Drive
   v3 REST API — `list`, `get`, `create`/`update`, and **resumable upload** for large
   EPUB bytes — scoped to `appDataFolder` (or the app folder for `drive.file`).
   Handle `401` (re-auth), `403`/quota, and network errors with backoff.
3. **Data mapping in Drive:**
   - `library.json` — the index of `BookMeta` (title, author, `coverUrl`, sizes,
     timestamps) **without** `fileData`.
   - `${bookId}.epub` — the EPUB bytes (resumable upload), keyed by the content hash.
   - `reading-state.json` — a map of `bookId → StoredReadingState` (small; single
     file, last-write-wins). Per-book files are an alternative.
   - **Not synced:** the derived `extracted-*` cache — regenerated locally.
4. **Progress UX:** chunk uploads/downloads with visible progress, mirroring the
   existing extraction/cache progress. Never block the reading UI.

**Files touched:** new `src/services/drive/*`, additions to `src/types/*`.

**Acceptance criteria**

- A local book can be **pushed** to Drive and **pulled** on another browser/profile.
- Large EPUB uploads show progress and are resumable.
- Only the least-privilege scope is used.

---

## Phase 4 — Sync layer (local-first ↔ Drive)

**Goal:** Keep IndexedDB and Drive in sync **without** changing the reader internals.

**Steps**

1. **Sync service:** add `src/sync/*` that sits **above** `src/storage/*` (which
   remains the local source of truth). On sign-in, pull the remote index and
   reconcile with the local library by `id` (content hash) and timestamps.
2. **Conflict resolution:** last-write-wins per record.
   - EPUB **bytes never conflict** — same `id` (content hash) means identical bytes.
   - **Reading state** takes the newest `updatedAt`.
   - **Library metadata** takes the newest `lastOpenedAt` / edit time.
3. **Change propagation:** after local writes (`addBookToLibrary`,
   `saveReadingState`, `removeBookFromLibrary`), enqueue a push via a small
   **outbox** persisted in IndexedDB so offline edits sync on reconnect.
4. **Download-on-demand:** show books that exist in Drive but not locally with a
   "cloud" badge; selecting one downloads the bytes, then runs the existing
   cache-then-extract pipeline ([src/pages/reader/useBookExtraction.ts](../src/pages/reader/useBookExtraction.ts)).
5. **Local-first guarantee:** everything works offline; sync is best-effort and
   never blocks reading.

**Files touched:** new `src/sync/*`, thin hooks into
[src/storage/library.ts](../src/storage/library.ts) and
[src/storage/readingState.ts](../src/storage/readingState.ts) (callback/event seam,
not rewrites), [src/pages/HomePage.tsx](../src/pages/HomePage.tsx),
[src/pages/reader/useReaderPersistence.ts](../src/pages/reader/useReaderPersistence.ts).

**Acceptance criteria**

- Add a book on device A → it appears (and downloads) on device B.
- Reading position syncs across devices.
- Offline edits reconcile on reconnect; no regressions in the Vitest suite.

---

## Phase 5 — Account & sync UX

**Goal:** Clear, unobtrusive cloud UX.

**Steps**

1. Account menu with profile + **Sign out**.
2. An explicit **"Enable cloud storage"** opt-in (triggers the Drive scope request).
3. Per-book status badges: **local**, **synced**, **cloud-only**.
4. A global **sync status** indicator (syncing / last-synced time / error) and a
   manual **"Sync now"**.
5. Surface quota/permission/network errors as actionable messages.
6. Sign-out offers **"keep or clear local data."**

**Files touched:** home/reader UI components, a new `SyncStatus` component,
[src/components/BookCard.tsx](../src/components/BookCard.tsx), a settings surface.

**Acceptance criteria**

- Users can tell what is local vs in Drive; errors are actionable.
- Touch targets / a11y remain correct.

---

## Phase 6 — Security & privacy hardening (OWASP-aware)

**Goal:** Safe token handling and minimal data exposure.

**Steps**

- **Tokens:** keep access tokens in memory (or `sessionStorage`), **never**
  `localStorage`/IndexedDB; clear on sign-out; rely on short-lived tokens + PKCE.
- **CSP:** keep `connect-src`/`script-src`/`frame-src` limited to Google + `'self'`.
- **Least privilege:** `drive.appdata` or `drive.file` — never full `drive`.
- **ID token validation:** check audience (`aud` = your Client ID), issuer, and
  expiry (client-side now; server-side in Phase 7 if added).
- **No server-side user content:** there is no app server in the default model;
  state this in a short privacy note ("your books live in your Google Drive; we
  store nothing").
- **OAuth verification:** complete Google's consent-screen verification before
  public launch (sensitive-scope review; confirm current requirements).
- **Transport:** HTTPS only. **Retry/backoff** and rate-limit Drive calls.
- **Rendering:** keep using DOM-based metadata handling (no unsafe HTML injection).

**Files touched:** CSP config, `src/auth/*`, `src/services/drive/*`, a privacy note
in `docs/cloud-deploy.md`.

**Acceptance criteria**

- No secrets in the bundle; CSP blocks non-Google endpoints.
- Scopes are minimal; sign-out fully clears tokens.

---

## Phase 7 — (Optional) Thin backend / BFF

**Goal:** Only if you need server-held secrets, **refresh tokens**, non-Google
logins, or shared/team features. **The default plan needs no backend.**

**Steps**

1. A small **stateless** service (serverless functions or a tiny Node/Hono/Express
   app) that performs the OAuth **code exchange** (holding the client secret),
   issues an **httpOnly** session cookie, refreshes Drive tokens, and optionally
   proxies Drive calls.
2. Keep it **stateless** (stores **no** book content) to stay cheap and private.
3. Deploy on a serverless/cheap host (Cloudflare Workers, Vercel/Netlify Functions,
   Deno Deploy, Fly.io, or a small VM).

**Files touched:** new `server/` or `functions/`, deployment config, small changes
to `src/auth/*` to talk to the BFF.

**Acceptance criteria**

- The SPA works against the BFF; secrets live **only** on the server.
- Hosting stays cheap; the default no-backend path is unaffected.

---

## Phase 8 — Deployment (build, hosting, domain, OAuth origins)

**Goal:** Ship the app to a cloud host over HTTPS with Google sign-in + Drive working.

This phase is the concrete, click-by-click procedure; see
[Step-by-step hosting procedure](#step-by-step-hosting-procedure).

**Acceptance criteria**

- The app is reachable over **HTTPS** at the chosen domain.
- Google sign-in and Drive read/write work from that origin.
- The PWA installs; the build is reproducible from CI or a documented command.

---

## Phase 9 — QA matrix

**Test matrix**

- Browsers: Chrome, Edge, Firefox, Safari; desktop + mobile.
- Signed-out (local-only), signed-in (cloud), and offline modes.

**Checklist**

- Sign-in / sign-out; identity displayed; tokens cleared on sign-out.
- Push a book to Drive; pull it on a second browser/profile.
- Reading position syncs across devices.
- Offline edits queue and reconcile on reconnect.
- Conflict (edit same book on two devices) resolves by last-write-wins.
- Token expiry silently re-authorizes; quota/permission errors are surfaced.
- PWA still installs and app-shell caching is unaffected.

**Acceptance criteria**

- All checklist items pass on at least two browsers.
- `npm run build`, `npm run lint`, `npm test` remain green.

---

## Cheap hosting options (static SPA)

Because the app is a **static SPA** using **client-side Google OAuth** (public
Client ID, no secret) and stores books in the **user's own Drive**, you need **no
database and no app server** — a free static host is enough.

| Host                                              | Cost         | Notes                                                                                                                                                                     |
| ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Pages**                              | Free         | Global CDN, free SSL, custom domains, `_headers` for CSP, Git CI. **Recommended default.**                                                                                |
| **GitHub Pages**                                  | Free         | Git-native (repo is already on GitHub), static only. Serves under `/<repo>/`; `base: "./"` + hash routing already fit. Bake `VITE_GOOGLE_CLIENT_ID` at build via Actions. |
| **Netlify**                                       | Free tier    | Git CI, `_headers`/`netlify.toml`, env vars, redirects.                                                                                                                   |
| **Vercel**                                        | Free hobby   | Great DX, env vars, edge CDN (hobby = non-commercial).                                                                                                                    |
| **Firebase Hosting**                              | Free (Spark) | Google-native (nice with Google OAuth), CDN, custom domain, `firebase.json` headers.                                                                                      |
| **Render / Azure Static Web Apps / GitLab Pages** | Free tiers   | Additional static options.                                                                                                                                                |
| **VPS / cloud server** (own server)               | ~$4–6/mo     | Hetzner (~€4), DigitalOcean/Vultr/Linode (~$4–6): run nginx (Docker) serving `dist/` with HTTPS via Caddy/Let's Encrypt. More control, small cost.                        |

**Cost summary:** the default path can be **$0** (free static tier). A custom domain
is ~$10/yr (optional). Only the optional Phase 7 backend may add serverless cost —
and those platforms (Cloudflare Workers, Vercel/Netlify Functions, Deno Deploy,
Fly.io) also have free tiers.

---

## Step-by-step hosting procedure

### A. One-time Google OAuth setup

1. Open the **Google Cloud Console** → create/select a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → _External_ → fill app name, support
   email, developer email → add scopes (`openid`, `email`, `profile`,
   `.../auth/drive.appdata`) → add your domain under **Authorized domains** → add
   **test users** while in _Testing_. Submit for **verification** before public
   launch if required for your scopes.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web
   application.** Under **Authorized JavaScript origins** add `http://localhost:5173`,
   `http://localhost:4173`, and your production URL(s). Save.
5. Copy the **Client ID** (this is public/non-secret).

### B. Deploy to Cloudflare Pages (recommended, $0)

1. Push the repo to GitHub/GitLab.
2. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git** →
   pick the repo.
3. **Build settings:** framework preset _Vite_ (or _None_); build command
   `npm run build`; output directory `dist`.
4. **Environment variables:** add `VITE_GOOGLE_CLIENT_ID = <your Client ID>` for
   both **Production** and **Preview**.
5. Add `public/_headers` with the CSP (allow the Google endpoints from Phase 1).
   Commit and redeploy.
6. Deploy; note the `*.pages.dev` URL.
7. _(Optional)_ **Custom domain:** Pages → _Custom domains_ → add
   `reader.example.com`; Cloudflare provisions free SSL.
8. Return to the **Google OAuth client** → add the `*.pages.dev` and/or custom
   domain to **Authorized JavaScript origins** → Save (allow a few minutes to
   propagate).
9. Visit the site → **Sign in with Google** → enable cloud → verify a book uploads
   to Drive (via the app UI or the Drive API `appDataFolder`).

### C. Alternative: GitHub Pages via GitHub Actions ($0)

1. Repo **Settings → Pages → Source = GitHub Actions**.
2. Add the value as a repo **Variable** (or Secret) `VITE_GOOGLE_CLIENT_ID`
   (Settings → _Secrets and variables_ → _Actions_). Actions injects it at build.
3. Add a workflow `.github/workflows/deploy.yml`: checkout → `setup-node` →
   `npm ci` → `npm run build` (with the `VITE_GOOGLE_CLIENT_ID` env) → upload the
   `dist` artifact → `deploy-pages`.
4. Project pages serve under `/<repo>/`; the relative `base: "./"` + hash routing
   already work — **no** SPA rewrite rules needed.
5. After the first deploy, add the Pages URL (`https://<user>.github.io`) to the
   Google OAuth **Authorized JavaScript origins**.

_(The Actions workflow can be scaffolded on request.)_

### D. Optional: self-host on a cloud server (Docker + nginx)

1. Build: `npm ci && npm run build` → static files land in `dist/`.
2. Serve with nginx: a `nginx:alpine` image that copies `dist` to
   `/usr/share/nginx/html`. A `try_files $uri /index.html;` fallback is optional
   because hash routing needs no server rewrites.
3. HTTPS: front with **Caddy** (automatic Let's Encrypt) or nginx + certbot, or put
   Cloudflare in front.
4. Run on a small VM (Hetzner/DigitalOcean/Vultr, ~$4–6/mo); point a DNS **A**
   record at it.
5. Add the domain to the Google OAuth **Authorized JavaScript origins**.

_(The Dockerfile / nginx / Caddy configs can be provided on request.)_

---

## Risks and mitigations

- **OAuth verification.** Drive scopes may require Google's consent-screen
  verification before public use → start with the narrower `drive.appdata` /
  `drive.file` scopes, keep test users during development, and budget time for
  review. Confirm current Google requirements.
- **Token lifetime.** Browser access tokens are short-lived and non-refreshable in
  the pure-SPA model → silent re-request; add the optional BFF (Phase 7) if you need
  long-lived refresh tokens.
- **Drive quota / rate limits.** Use resumable uploads, batching, and exponential
  backoff; surface quota errors clearly.
- **Large EPUB uploads.** Resumable upload + progress; never block reading; keep the
  derived extraction cache local.
- **Offline / conflicts.** Last-write-wins by timestamp; content-hash `id`s make EPUB
  bytes conflict-free; queue offline edits in an outbox.
- **Local-first regressions.** Keep offline mode fully functional; cloud is opt-in;
  store nothing on app servers.
- **Cost creep.** The default path is $0 static hosting — avoid databases/servers
  unless Phase 7 is explicitly chosen.
- **CSP vs GIS.** Google Identity Services needs specific script/frame origins;
  verify the CSP does not block sign-in.
- **Security.** Never store tokens in `localStorage`; use minimal scopes; validate
  the ID token; HTTPS only.

---

## Out of scope (unless requested)

- Application-owned server storage of user EPUBs (books stay in the user's Drive).
- Non-Google identity providers (unless the Phase 7 backend is added).
- Real-time collaboration or sharing between users.
- Server-side EPUB processing.

---

## Suggested execution order summary

0. Google/hosting prereqs → 1. Deploy-ready SPA (env + CSP) → 2. Google sign-in →
1. Drive client → 4. Sync layer → 5. Account/sync UX → 6. Security hardening →
2. _(optional)_ BFF → 8. Deployment → 9. QA matrix.
