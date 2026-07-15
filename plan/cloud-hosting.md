# Plan: Host the EPUB Reader in the cloud (Google accounts + Google Drive storage)

This plan turns the existing PWA into a **cloud-hosted web app** that:

- requires users to **sign in with Google** (Google Identity Services),
- stores each user's EPUB library in **their own Google Drive** (per-user storage),
- opens EPUBs from Drive-backed library records — there is no local library and
  no offline mode, though a validated local extraction cache can avoid repeated
  EPUB downloads.

Google Drive is the **single source of truth** for user content. Nothing a user
imports or reads is stored on an application-owned server. The browser keeps a
**local IndexedDB cache** of the derived extraction (persistent, so reopening a book
is fast) plus an optional byte cache; this cache is never authoritative, is
regenerated from the Drive EPUB when missing, and can be cleared at any time.

> **Direction change:** The project was previously local-first/offline. That
> constraint is intentionally removed. The app is now **online-only**: it requires a
> signed-in Google session and network connectivity to Google APIs. Do not
> re-introduce a local-first/offline library.

## Recommended architecture (why it stays cheap)

**Static SPA + client-side Google OAuth (GIS) + Google Drive REST + Google Picker.**

- The app is already a static Vite build (`base: "./"`, hash routing via TanStack
  Router, VitePWA). It deploys to any static host with **no server rewrites**.
- Identity + Drive access happen **in the browser** using Google Identity Services
  (GIS). The OAuth **Client ID is public** (no client secret in the SPA), so there
  is **no backend and no database to run** in the default model.
- EPUB **book files** live in a **folder the user picks** in their own Google Drive
  (chosen once via the Google Picker); small JSON metadata (a **manifest** and a
  **`settings.json`**) live in an `app-data/` sub-folder the app creates there. The
  library is a **curated manifest** the user builds (add/remove), not a raw folder
  listing. App-only library folders for organizing books are stored as metadata in
  that manifest and are **not** Google Drive folders. The app stores **zero** user
  content server-side.
- The derived extraction cache is **not** stored on Drive (too large; it would burn
  Drive quota). It is kept in a **local IndexedDB cache** that persists across
  sessions so reopening a book is fast, and is regenerated from the Drive EPUB when
  missing or when the Drive file fingerprint changes.

Result: hosting can be **$0** on Cloudflare Pages (plus an optional ~$10/yr domain).
A thin optional backend (BFF) is described in Phase 7 for refresh tokens or
server-held secrets.

> **Execution note for AI:** Phases are ordered so each one leaves the project in a
> working state. Do **not** start a phase until the previous one's acceptance
> criteria pass. Each phase lists the files it touches, the work, and how to verify
> it. Do not break `npm run build`, `npm run lint`, or `npm test` at any point.

---

## End-to-end user flow (final implementation)

This is the concrete runtime flow the finished app must implement.

1. **Open the app URL.** The app is a static SPA served from a fixed origin. With
   **Cloudflare Pages** the origin is auto-assigned as `https://<project>.pages.dev`
   (derived from the Pages project name), or a **custom domain** (e.g.
   `https://reader.example.com`) mapped by DNS. Routing is **hash-based**
   (`base: "./"`), so links are `https://<origin>/#/` (library) and
   `https://<origin>/#/reader/<book-title>` (reader) — no server rewrites.
2. **Sign in with Google.** GIS establishes identity and requests a Drive access
   token with the single **`drive.file`** scope — per-file access: the app can only
   touch files it creates or that the user hands it through the Google Picker. It can
   never see the rest of the user's Drive.
3. **First run → choose the library folder.** The very first time (no folder saved),
   the app opens the **Google Picker** and asks the user to **select the Drive folder
   to manage books in**. The implementation must first prove, using only
   `drive.file`, that the picked folder allows the app to create/update the
   `app-data/` child folder plus `library.json` and `settings.json`, and to recover
   those app-created files on a later visit. Once proven, the app records the folder
   id and metadata file ids, tags app-created files with `appProperties`, and
   remembers enough local state so later visits skip this step when possible. After
   initial setup, the UI must still expose the selected Drive library location and
   let the user choose a different folder/path from a settings or account surface.
4. **Library loads.** The app reads its **manifest** (`app-data/library.json`) — the
   **curated list of books the user has added**, plus app-only library folders and
   book-folder assignments — and renders the library. The library is _whatever the
   user added_, not a raw listing of the Drive folder.
5. **Organize with app-only folders.** Users can create, rename, delete, and reorder
   folders inside the library UI, then assign books to those folders. These folders
   are persisted only as metadata in `library.json` (for example `virtualFolders[]`
   plus each book's `virtualFolderId`) and are never created as Google Drive folder
   resources. Moving a book between app folders does **not** move or rename its Drive
   file. Deleting an app folder does **not** remove books or Drive files; affected
   books return to the library root / uncategorized view.
6. **Add a book — two ways.** (a) **Add from Drive:** the Google Picker lets the user
   select existing `.epub` file(s); picking grants `drive.file` access, then the app
   downloads the selected EPUB once to compute the SHA-256 `bookId`, extract metadata,
   and store the Drive fingerprint before recording it in the manifest. (b)
   **Upload:** pick a local `.epub`; the app hashes/extracts metadata locally,
   uploads it (resumable) into the library folder via `drive.file`, then records it.
7. **Remove from library = forget (never delete).** Removing a book **drops it from
   the manifest** (the app forgets its local reference) and clears its local cache;
   the **file stays in the user's Drive**. Re-adding it later works. True OAuth/app
   permission revocation is handled in the user's Google account settings, not by
   this in-app remove action.
8. **Open a book → validate, then use/build the local cache.** The reader opens from
   the route `bookId`/manifest entry, not from an in-memory `File` passed during
   navigation. On open, the app checks the Drive file metadata fingerprint
   (`modifiedTime`, `size`, and `md5Checksum` or ETag). If the fingerprint still
   matches and IndexedDB has the extracted book, the reader renders from cache with
   no EPUB download and no re-extraction. If the cache is missing or the Drive file
   changed, the app downloads the EPUB bytes, computes the current hash, extracts
   sections/assets/TOC, updates the manifest if needed, and writes a fresh
   IndexedDB cache entry.
9. **Preferences live in Drive.** Theme, per-book reading **position**, reading
   **mode**, and **zoom** are stored in **`app-data/settings.json`** (in the
   sub-folder so app metadata is separated from the book files), written via
   `drive.file`.
10. **Refresh.** The manifest and `settings.json` are re-read on **every app access**
    and can be re-synced on demand via a **Refresh** button; a manifest entry whose
    Drive file has been removed (a `404` on fetch) is pruned from the library.

**Drive layout (per user):**

```
<library folder>/            ← user-picked via the Google Picker (drive.file)
  ├─ Book One.epub           ← in-app Upload lands here; picked books may live elsewhere
  ├─ Book Two.epub
  └─ app-data/               ← app-created sub-folder: metadata, separated from books
    ├─ library.json       ← curated manifest: Drive folderId + virtualFolders[] + books[] (bookId(hash) ↔ Drive fileId + metadata + virtualFolderId)
       └─ settings.json      ← { theme, perBook: { [bookId]: { location, mode, zoom } } }
```

**Book identity:** the internal `bookId` is the **SHA-256 content hash** of the EPUB
bytes (the IndexedDB cache + per-book settings key). The manifest maps Drive `fileId`
↔ `bookId` and also stores the last known Drive fingerprint (`modifiedTime`, `size`,
and `md5Checksum` when Drive exposes it, otherwise ETag). Book entries also store an
optional app-only `virtualFolderId`; this organizes the UI but never changes the
book's Drive parent folder. Adding the same bytes twice de-duplicates; replacing a
Drive file with different bytes is treated as a new content version. Picked books may
live anywhere in the user's Drive; uploaded books land in the library folder.

---

## Current state (baseline assessment)

| Area                 | Today                                                                                                   | Cloud target                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting model        | Static Vite build + PWA, `base: "./"` in [vite.config.ts](../vite.config.ts)                            | Deploys to Cloudflare Pages as-is (static build, no server rewrites).                                                                                                                                                                              |
| Routing              | TanStack Router **hash history** in [src/router.tsx](../src/router.tsx)                                 | Hash URLs need **no SPA rewrite rules** — ideal for static hosts.                                                                                                                                                                                  |
| Auth                 | None                                                                                                    | **Required** Google sign-in (Google Identity Services). The whole app is gated behind a session.                                                                                                                                                   |
| Book identity        | SHA-256 **content hash** as `id` in [src/storage/library.ts](../src/storage/library.ts)                 | Deterministic key for Drive filenames, dedup, and conflict-free byte storage.                                                                                                                                                                      |
| Library storage      | `StoredBook` (incl. `fileData: ArrayBuffer`) in IndexedDB via [src/storage/db.ts](../src/storage/db.ts) | Moves to Drive: a **curated `library.json` manifest** in `app-data/` (books the user adds via the Picker or upload, plus app-only virtual folders and assignments); book files live in a user-picked folder. IndexedDB is no longer authoritative. |
| Reading state        | `StoredReadingState` in [src/storage/readingState.ts](../src/storage/readingState.ts)                   | Folded into `app-data/settings.json` (theme + per-book position/mode/zoom) in Drive; last-write-wins by `updatedAt`. Writes are debounced.                                                                                                         |
| Extraction cache     | Derived `extracted-*` stores in [src/storage/bookCache.ts](../src/storage/bookCache.ts)                 | **Kept** in the local IndexedDB cache for fast reopening; **never** uploaded to Drive (size + quota); regenerated from the Drive EPUB on a cache miss.                                                                                             |
| Networking           | Fully offline; no network for content                                                                   | **Online-only**: network to **Google APIs** is required to load the manifest and validate/open books. A cache hit can avoid the EPUB download, not the signed-in Drive-backed library model.                                                       |
| Secrets              | None in the client                                                                                      | OAuth **Client ID + Picker API key + App ID are public** and safe in the SPA; any real secret requires the optional backend (Phase 7).                                                                                                             |
| PWA / service worker | App-shell only in [vite.config.ts](../vite.config.ts)                                                   | Keep app-shell caching for fast loads only; **never** cache API/token responses or user content. No offline reading.                                                                                                                               |

---

## Key decisions (confirmed)

- **Identity provider:** **Google Identity Services (GIS)** — required sign-in. It
  directly enables Drive access. Other providers are out of scope unless the Phase 7
  backend is added.
- **Storage backend:** the user's own **Google Drive**. On first run the user
  **picks a library folder** via the Google Picker; the app creates an
  **`app-data/` sub-folder** there for the manifest and settings only after the
  `drive.file` folder-child create/update/recovery behavior has been proven.
- **First-run folder selection:** the very first visit (no saved folder) prompts the
  user, via the **Google Picker**, to choose the Drive folder to manage books in
  (the Picker needs the Picker API, a public API key, and your App ID / Cloud project
  number). Picking is expected to grant the access needed for app-created child
  metadata, but this is a required implementation proof before depending on it. The
  choice is remembered (local metadata file ids + manifest state) so it is asked only
  when recovery fails or the user chooses a different folder. The library/account UI
  must make that later folder/path change possible after the first selection, not only
  during first-run bootstrap.
- **Drive URL / origin:** the app is served from the Cloudflare Pages origin
  (`https://<project>.pages.dev`) or a custom domain; hash routes
  (`#/`, `#/reader/<book-title>`) need no server rewrites.
- **Drive scope:** **`drive.file` only** — per-file access to files the app creates
  or that the user hands it through the **Google Picker**. This is a **non-sensitive**
  scope: streamlined verification and **no** security assessment (unlike
  `drive.readonly`/`drive`, which are restricted). The app can never see the rest of
  the user's Drive. **Never** request broader scopes; `appDataFolder` is **not** used.
- **Library = curated manifest:** the library is exactly the set of books the user
  has added (tracked in `app-data/library.json`), **not** a raw listing of the folder.
  Because `drive.file` only exposes app-created or user-picked files, the app cannot
  (and does not) enumerate arbitrary folder contents.
- **Virtual library folders:** users can organize books into app-only folders tracked
  in `app-data/library.json` (`virtualFolders[]` + per-book `virtualFolderId`). These
  folders are UI/manifest metadata only: the app must **not** create Google Drive
  folders, move Drive files, or imply that virtual organization changes the user's
  Drive layout. Deleting a virtual folder preserves all books and Drive files by
  clearing or reassigning their folder metadata.
- **Adding books:** two paths —
  1. **Add from Drive:** the Google Picker lets the user select existing `.epub`
     file(s); picking grants `drive.file` access, then the app downloads each selected
     EPUB once to hash it, extract title/author/cover metadata, store the Drive file
     fingerprint, and record it in the manifest. This work is progress-visible and
     concurrency-limited.
  2. **In-app Upload:** pick a local `.epub`; the app uploads it (resumable) into the
     library folder via `drive.file` and records it.
- **Removing books = forget (not delete):** removing a book drops it from the
  manifest (the app forgets the local reference) and clears its local cache; the
  **Drive file is never deleted**, which makes an in-app "remove" safe. This does
  not revoke Google-side app permissions; users can revoke the app from their Google
  account if they want to remove previously granted access.
- **Preferences:** theme + per-book position/mode/zoom persist to
  **`app-data/settings.json`**; the curated **manifest** persists to
  **`app-data/library.json`**. Both are re-read on every app access and via a
  **Refresh** button.
- **Book identity:** internal `bookId` = SHA-256 content hash (cache + settings key);
  the manifest maps Drive `fileId` ↔ `bookId` and stores a Drive fingerprint
  (`modifiedTime`, `size`, and `md5Checksum` or ETag). Re-adding identical bytes
  de-duplicates; changed Drive bytes invalidate the old cache and produce a new
  content version.
- **Identity scopes:** `openid email profile`.
- **Auth model:** browser-only **token model** (GIS `initTokenClient`, PKCE).
  Short-lived access tokens, silently re-requested. **No** refresh token in the
  browser. (Phase 7 adds refresh tokens to avoid re-consent on long sessions.)
- **Hosting:** **Cloudflare Pages** (free, global CDN, `_headers` for CSP).
- **Local storage policy:** the browser keeps a **local IndexedDB cache** of the
  derived extraction (persistent, for fast reopening) plus an optional in-memory /
  Cache Storage byte cache — none of it authoritative. IndexedDB is **no longer the
  library** (library, EPUB bytes, and reading state live in Drive); there is **no**
  offline mode.
- **Extraction cache:** Drive holds **only the EPUB bytes** (plus small JSON
  indexes). The derived section/asset extraction is **cached locally in IndexedDB**
  and reused across sessions; it is regenerated from the Drive EPUB only on a cache
  miss, and is **never** uploaded to Drive (too large; would burn Drive quota).
- **Concurrency:** **last-write-wins** by `updatedAt` / Drive `modifiedTime` for the
  small JSON indexes. EPUB bytes are content-hash-addressed, so they never conflict.
- **Data ownership:** all user content lives in the user's Drive. The app stores
  **no** user content server-side. Sign-out clears tokens. The local extraction cache
  must either be cleared on sign-out by default or be namespaced by Google `sub` and
  exposed through a clear-cache action; do not keep a cross-account cache.

---

## Phase 0 — Google Cloud + hosting prerequisites (no code changes)

**Goal:** Stand up the Google Cloud project so later phases have a Client ID and a
Picker API key, and confirm Cloudflare Pages as the host.

**Steps**

1. Create (or select) a **Google Cloud project**.
2. **Enable APIs** (APIs & Services → Library): **Google Drive API** and
   **Google Picker API**.
3. Configure the **OAuth consent screen** (User type _External_): app name,
   support email, developer contact, app logo/domain. Add the scopes
   (`openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file`).
   Add **Authorized domains**. While in _Testing_, add **test users**. `drive.file`
   is **non-sensitive**, so it needs only basic OAuth verification — **no** security
   assessment (confirm current Google requirements).
4. Create **Credentials → OAuth client ID → Web application**. Add
   **Authorized JavaScript origins**: `http://localhost:5173`, `http://localhost:4173`,
   and the future production origin(s). (GIS token model uses JS origins; add
   redirect URIs only if you adopt a redirect code flow.)
5. Create **Credentials → API key** for the Google Picker; restrict it to the
   **Picker API** and your origins. Note your **project number** (the Picker
   **App ID**).
6. Record the **Client ID**, **API key**, and **project number** (all
   public/non-secret). There is **no client secret** in the SPA path.
7. Confirm the host: **Cloudflare Pages** (see [Hosting and cost](#hosting-and-cost));
   optionally a custom domain.
8. **Drive folder proof:** before Phase 3 implementation, verify the selected-folder
   model with a minimal scratch/manual test using only `drive.file`: Picker folder
   select -> create `app-data/` -> create and update `library.json`/`settings.json`
   with identifying `appProperties` -> reload in a fresh browser profile/account
   session -> recover the metadata by saved file ids or by listing only the app's
   accessible files with the `appProperties` marker. If any step fails, stop and
   revise the storage bootstrap before implementing Phase 3.

**Files touched:** docs only (record decisions in this plan or a new
`docs/cloud-deploy.md`).

**Acceptance criteria**

- A **Web** OAuth Client ID and a **Picker API key** exist; the consent screen
  requests only `drive.file` (non-sensitive) with test users added.
- The `drive.file` folder proof is documented: child metadata creation/update and
  later recovery work, or the plan is revised before Phase 3.
- No source/build changes; `npm run build`, `npm run lint`, `npm test` unaffected.

---

## Phase 1 — Make the SPA cloud/deploy-ready (config, env, headers)

**Goal:** The static build deploys cleanly to Cloudflare Pages and reads the OAuth
Client ID and Picker API key from the environment, ready for the required sign-in
gate implemented in Phase 2.

**Steps**

1. **Typed env:** add `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` (Picker), and
   `VITE_GOOGLE_PROJECT_NUMBER` (Picker App ID). Create `.env.example` and extend
   `ImportMetaEnv` in [src/vite-env.d.ts](../src/vite-env.d.ts). Never hardcode these
   in source. (The library folder is chosen at runtime via the Picker, not an env var.)
2. **Routing/base sanity:** confirm hash routing + `base: "./"` in
   [vite.config.ts](../vite.config.ts) work on Cloudflare Pages. No SPA fallback rule
   is needed with hash routing.
3. **Security headers / CSP:** add a Content-Security-Policy that allows Google
   Identity, Drive, the Picker, Emotion styles, and reader data/blob assets without
   opening unrelated origins:
   - `default-src` -> `'self'`
   - `script-src` -> `'self' https://accounts.google.com/gsi/client https://apis.google.com`
   - `connect-src` -> `'self' https://www.googleapis.com https://content.googleapis.com https://oauth2.googleapis.com https://accounts.google.com`
   - `frame-src` -> `https://accounts.google.com https://docs.google.com` (the Picker
     renders in a `docs.google.com` iframe)
   - `style-src` -> `'self' 'unsafe-inline'` (Emotion runtime styles; tighten only if
     the app moves to a nonce/hash-based CSP)
   - `img-src` -> `'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com`
   - `font-src` -> `'self' data: blob:`
   - `worker-src` -> `'self' blob:`
   - `manifest-src` -> `'self'`; `base-uri` -> `'self'`; `object-src` -> `'none'`
   - `frame-ancestors` -> `'self'` (must be in the HTTP header; a meta CSP fallback
     cannot enforce `frame-ancestors`)
     Provide the enforcing policy via `public/_headers` for Cloudflare. A
     `<meta http-equiv>` fallback in [index.html](../index.html) may cover the
     directives browsers honor in meta CSP, but the header is authoritative. Keep the
     PWA app-shell cache; ensure Drive/token/Picker responses are **network-only**
     (never precached or runtime-cached).
4. **Auth readiness:** centralize env/config validation so Phase 2 can fail closed
   when the Client ID, Picker API key, or project number is missing. The actual
   sign-in gate is implemented and verified in Phase 2.

**Files touched:** new `.env.example`, [src/vite-env.d.ts](../src/vite-env.d.ts),
[vite.config.ts](../vite.config.ts), new `public/_headers`, possibly
[index.html](../index.html).

**Acceptance criteria**

- `npm run build`, `npm run lint`, `npm test` pass.
- `npm run preview` serves the existing app with the Cloudflare header file present
  and without requiring server rewrites.
- The Client ID + Picker API key are read from env; CSP allows the Google + Picker
  endpoints, Emotion styles, data/blob reader assets, and blocks unrelated origins.
- The PWA still installs and caches only the app shell (no offline book reading).

---

## Phase 2 — Authentication (required Google sign-in)

**Goal:** Users must sign in with Google before using the app.

**Steps**

1. **Auth module (narrow seam):** add `src/auth/` with `googleIdentity.ts`
   (load GIS, init, sign-in, sign-out) and an `AuthProvider` + `useAuth()` hook
   exposing `{ user, status, signIn, signOut }`. Follow the repo convention of a
   thin integration boundary (like `src/services/epubjsAdapter.ts`).
2. **Identity:** use the GIS **ID token** (JWT credential) to read `sub`, `email`,
   `name`, `picture`. Validate audience/issuer/expiry (client-side check now; the
   Phase 7 backend can verify server-side later). Keep a lightweight session in
   memory (+ optional `sessionStorage`); **do not** persist long-lived secrets.
3. **Auth gate + UI:** wrap the router so unauthenticated users see a **"Sign in
   with Google"** screen; signed-in users reach the library. Add an account menu
   (avatar → **Sign out**) on [src/pages/HomePage.tsx](../src/pages/HomePage.tsx)
   and/or the reader toolbar.
4. **Sign-out:** clear the session/tokens and return to the sign-in screen. For
   shared-device safety, clear the local extraction cache on sign-out by default. If
   a later UX keeps caches for fast re-sign-in, namespace cache records by Google
   `sub` and still expose a **"clear cache"** action.

**Files touched:** new `src/auth/*`, [src/pages/HomePage.tsx](../src/pages/HomePage.tsx),
[src/main.tsx](../src/main.tsx) (provider), [src/router.tsx](../src/router.tsx)
(auth gate), [index.html](../index.html) (GIS script or dynamic load), possibly
[src/components/reader/ReaderToolbar.tsx](../src/components/reader/ReaderToolbar.tsx).

**Acceptance criteria**

- The app is unusable until signed in; sign-in/sign-out works in dev and `preview`;
  identity (name/avatar) is displayed.
- No secrets in the bundle; tokens are not in `localStorage`; sign-out clears tokens
  and either clears or account-namespaces the local extraction cache.
- Tests stay green (auth mocked / behind the seam).

---

## Phase 3 — Google Drive integration (Picker + per-user storage)

**Goal:** Let the user pick a library folder via the Google Picker, create the
`app-data/` sub-folder, and read/write the curated library (add via Picker/upload,
manifest, app-only virtual folders, settings) using only `drive.file`.

**Steps**

1. **Drive access token:** use GIS `google.accounts.oauth2.initTokenClient` with the
   single `drive.file` scope. Request the token right after sign-in (or on first
   Drive action). Handle expiry with a silent re-request; handle user denial.
2. **Google Picker service:** add `src/services/drive/picker.ts` (loads the `gapi`
   `picker` library; uses the API key + App ID). It provides two flows: **(a) pick
   the library folder** (folder-select view, only after the Phase 0 folder proof is
   green) and **(b) pick existing `.epub` file(s)** to add. Picking grants the app
   `drive.file` access to the selected folder/file records.
3. **Folder bootstrap:** on first run, prompt (via the Picker) to choose the library
   folder; create an `app-data/` sub-folder inside it; create `library.json` and
   `settings.json` with app-specific `appProperties`; record `folderId`,
   `manifestFileId`, and `settingsFileId`; persist those ids locally. On later
   visits, use the saved file ids first; if local state is missing, recover by
   listing only files visible through `drive.file` with the app's `appProperties`
   marker. If recovery fails, prompt the user to pick the folder again rather than
   broadening scopes.
4. **Drive REST client:** add `src/services/drive/driveClient.ts` wrapping the Drive
   v3 REST API — `get`/download, `create`/`update`, and **resumable upload** for EPUB
   bytes (all `drive.file`). It does **not** enumerate arbitrary folder contents and
   has **no delete** method. Centralize `401` (re-auth), `403`/`429`
   (quota/rate-limit) and network handling with **exponential backoff + jitter** here.
5. **Manifest + settings:** add `src/services/drive/manifest.ts` and
   `src/services/drive/settings.ts` that read/write `app-data/library.json` and
   `app-data/settings.json` via `drive.file`. Adding a book appends to the manifest
   only after the app has a `bookId`, metadata, and Drive fingerprint; **removing
   forgets it** (drops the entry); a `404` when fetching a referenced file prunes its
   entry. The manifest service also owns virtual folder CRUD (create/rename/delete/
   reorder) and book assignment (`virtualFolderId`) updates. These are manifest-only
   operations and must not call Drive folder create/move APIs.
6. **Data mapping in Drive:**
   - `<library folder>/*.epub` — uploaded books (human filenames). Picked books may
     live elsewhere in the user's Drive; the manifest references them by `fileId`.
   - `app-data/library.json` — the **curated manifest**: Drive `folderId`, metadata
     file ids, schema version, `virtualFolders[]` (stable id, name, sort/order,
     timestamps), and `books[]` (`bookId` ↔ Drive `fileId` + `BookMeta`: title,
     author, `coverRef`, file size, timestamps, Drive fingerprint, optional
     `virtualFolderId`). Virtual folders are not Drive resources.
   - `app-data/settings.json` — theme + `perBook: { [bookId]: { location, mode, zoom } }`
     (last-write-wins by `updatedAt`).
   - **Never stored in Drive:** the derived extraction cache — kept in the local
     IndexedDB cache and regenerated on a miss.
7. **Progress UX:** chunk uploads/downloads with visible progress, mirroring the
   existing extraction/cache progress. Never block the reading UI.

**Files touched:** new `src/services/drive/*` (incl. `picker.ts`), additions to
`src/types/*`.

**Acceptance criteria**

- First run prompts a folder pick; the choice persists so it isn't asked again.
- Picking an existing `.epub` downloads it once for hashing/metadata/fingerprint and
  then adds it to the library; an **uploaded** book lands in the library folder and is
  added after hashing/metadata extraction.
- **Removing** a book forgets it (drops the manifest entry) and leaves the Drive file
  intact.
- Creating/renaming/deleting virtual library folders updates only `library.json`;
  no Google Drive folder is created, renamed, moved, or deleted. Book folder
  assignments persist across reloads.
- The manifest and `settings.json` are created/updated in `app-data/`; only
  `drive.file` is used; metadata recovery works from saved file ids or appProperties.

---

## Phase 4 — Make Drive the source of truth (storage migration)

**Goal:** Repoint `src/storage/*` so the **library, EPUB bytes, and reading state
come from Drive**, while the **derived extraction stays in the local IndexedDB
cache** for fast reopening. IndexedDB is no longer authoritative for the library, and
there is no offline library.

**Steps**

1. **Storage seam:** refactor [src/storage/library.ts](../src/storage/library.ts) and
   [src/storage/readingState.ts](../src/storage/readingState.ts) so the public API is
   backed by the Drive manifest/settings services instead of IndexedDB. Do not keep an
   eager `getBookFile`/route-state contract if it forces an EPUB download before the
   extraction cache is checked. Prefer identity-first APIs such as
   `getBookMeta(bookId)`, `getAllBooks()`, `getLibraryFolders()`,
   `setBookVirtualFolder(bookId, virtualFolderId)`,
   `fetchBookFileForExtraction(bookId)`, and `saveReadingState(bookId, partial)`.
   `saveReadingState` writes into
   `settings.json` (`perBook`), and `removeBookFromLibrary` now **forgets** the book
   (manifest + local cache) rather than deleting the Drive file.
2. **Library index:** read `app-data/library.json` once per session into memory (the
   curated list, virtual folders, and book-folder assignments); update it on
   add/remove/last-opened/folder CRUD/book move and write back (debounced). Download
   the book's Drive file (by `fileId`) only from the cache-miss/stale-cache extraction
   path; a `404` prunes the entry.
3. **Preferences & reading state:** theme + per-book position/mode/zoom write to
   `app-data/settings.json`, **debounced/coalesced** (e.g. on pause and at most every
   few seconds) to avoid hammering the Drive API with position updates;
   last-write-wins by `updatedAt`.
4. **Keep the extraction cache local:** retain
   [src/storage/bookCache.ts](../src/storage/bookCache.ts) (the IndexedDB
   `extracted-*` stores) as the **persistent local extraction cache** — regenerating
   it every session would be too slow. It is **never** uploaded to Drive (too large;
   Drive-quota pressure). Trim [src/storage/db.ts](../src/storage/db.ts) to **drop**
   the now-Drive-backed `library` and `reading-state` stores while **keeping**
   `extracted-books-raw` / `extracted-sections`; this requires an IndexedDB version
   upgrade/migration, not an in-place schema edit. Optionally add a small byte cache
   (Cache Storage) so a cache miss doesn't re-download the same EPUB.
5. **Extraction pipeline:** keep the existing _cache-then-extract_ flow in
   [src/pages/reader/useBookExtraction.ts](../src/pages/reader/useBookExtraction.ts),
   but make it `bookId`/manifest-driven instead of `File`-driven. The reader route and
   page refresh must recover from the route `bookTitle`/manifest entry; navigation
   state may improve startup but cannot be required. On open, fetch cheap Drive
   metadata (`id`, `modifiedTime`, `size`, `md5Checksum` or ETag) and compare it with
   the manifest fingerprint before trusting a cache hit. If the fingerprint matches,
   check IndexedDB and render from it on a **hit** (metadata request only; no EPUB
   download, no extraction). On a **miss** or stale fingerprint, download the EPUB
   Drive file, compute the SHA-256 `bookId`, extract, update the manifest if the hash
   changed, invalidate the stale cache entry, then persist the fresh extraction.
   Preserve the existing visible progress.
6. **Concurrency & removal:** last-write-wins by `updatedAt` / Drive `modifiedTime`
   for the JSON files; content-hash `id`s keep immutable content versions
   conflict-free. If a Drive file is replaced with different bytes, treat it as a new
   content version and do not serve the old cache. **Remove-from-library** just drops
   the manifest entry + local cache (the Drive file is **never** deleted); a
   referenced file that has vanished (`404`) is pruned the same way. No offline
   outbox (online-only). Virtual folder deletion updates only manifest metadata and
   leaves books in the library, typically by clearing their `virtualFolderId`.

**Files touched:** [src/storage/library.ts](../src/storage/library.ts),
[src/storage/readingState.ts](../src/storage/readingState.ts),
[src/storage/db.ts](../src/storage/db.ts) (drop `library`/`reading-state`, keep the
extraction-cache stores), [src/storage/bookCache.ts](../src/storage/bookCache.ts)
(kept as the local extraction cache),
[src/pages/reader/useBookExtraction.ts](../src/pages/reader/useBookExtraction.ts),
[src/pages/ReaderPage.tsx](../src/pages/ReaderPage.tsx), [src/router.tsx](../src/router.tsx),
[src/pages/HomePage.tsx](../src/pages/HomePage.tsx),
[src/pages/reader/useReaderPersistence.ts](../src/pages/reader/useReaderPersistence.ts).

**Acceptance criteria**

- Add a book on device A (pick or upload) → it appears and opens on device B (same
  account), downloaded from Drive.
- Create/rename/delete a virtual library folder and move a book into it on device A →
  the same folder organization appears on device B, with no Drive folder created.
- Theme + reading position/mode persist to `settings.json` and restore on another
  device.
- Removing a book forgets it (manifest + local cache) and leaves the Drive file
  intact.
- Reader refresh/direct hash URL works from the manifest without in-memory `File`
  navigation state.
- Reopening a book on the same device validates the Drive fingerprint, then uses the
  IndexedDB extraction cache on a match (no EPUB re-download, no re-extraction).
- Replacing the Drive file with different bytes invalidates the stale cache and
  updates the manifest to the new content hash/fingerprint.
- Clearing the local cache still lets every book open (re-download + re-extract).
- No IndexedDB **library** remains (only the extraction cache); the Vitest suite is
  updated and green.

---

## Phase 5 — Library & account UX

**Goal:** Clear cloud-native library UX (Drive folder pick, app-only library folders,
add, remove-as-forget, refresh).

**Steps**

1. Account menu with profile + **Sign out**.
2. **Drive library location:** if no library folder is saved, prompt the user (via
   the Google Picker) to choose one before showing the (empty) library. After the
   first selection, show the current Drive library location in a settings/account
   surface and provide a **Change Drive folder** action that re-runs folder selection
   and storage bootstrap for the newly chosen location.
3. **Add books:** an **Upload** action (pick a local `.epub` → hash/extract metadata
   → resumable upload into the library folder) and an **Add from Drive** action
   (Google Picker → select existing `.epub` file(s) → progress-visible download for
   hash/metadata/fingerprint). Concurrency-limit add/pre-extract work so multi-select
   does not saturate Drive or memory.
4. **Organize books:** provide app-only library folder controls: create, rename,
   delete, reorder, and move books between the root / uncategorized view and virtual
   folders. The UI copy should make the boundary explicit when needed: these folders
   organize the app's library only; they do **not** create Google Drive folders or
   move Drive files. Deleting a virtual folder keeps its books and returns them to the
   root / uncategorized view.
5. **Remove from library:** a per-book **Remove** action on
   [src/components/BookCard.tsx](../src/components/BookCard.tsx) that **forgets** the
   book (drops the manifest entry + clears its local cache). Use explicit copy —
   e.g. "Remove from library (keeps the file in your Drive)" — so users know it is
   **not** a Drive delete and not a Google app-permission revocation.
6. Per-book status: **in library**, **validating**, **downloading**, **extracting**,
   **ready** — reflecting the metadata-check/fetch/extract pipeline.
7. A global **status** indicator (loading library / saving settings / error) and a
   manual **Refresh** that reloads `library.json` + `settings.json` and prunes any
   entries whose Drive file is gone.
8. Surface **quota / rate-limit / permission / network** errors as actionable
   messages (e.g. "Your Google Drive is full", "Too many requests — retrying").
9. Empty-state guidance for first-time users (pick a Drive folder, then add or upload;
   app folders can be created later to organize the library).

**Files touched:** home/reader UI components, a new status/indicator component,
[src/components/BookCard.tsx](../src/components/BookCard.tsx),
[src/components/FilePicker.tsx](../src/components/FilePicker.tsx), a settings surface.

**Acceptance criteria**

- First run asks for a library folder; adding via Upload or the Picker shows the book;
  fetch/extract progress shows per book.
- The settings/account UI shows the current Drive library location and lets the user
  change it after initial setup.
- Creating, renaming, deleting, reordering, and moving books into app-only folders
  updates the library view and persists through `library.json`; no Google Drive
  folders are created or modified.
- **Remove** forgets a book (manifest + cache) and leaves the Drive file intact; the
  wording makes that clear.
- Quota/rate-limit/permission errors are surfaced with clear, actionable text.
- Touch targets / a11y remain correct.

---

## Phase 6 — Security & privacy hardening (OWASP-aware)

**Goal:** Safe token handling and minimal data exposure.

**Steps**

- **Tokens:** keep access tokens in memory (or `sessionStorage`), **never**
  `localStorage`; clear on sign-out; rely on short-lived tokens + PKCE.
- **CSP:** keep network/script/frame origins limited to Google (Identity, Drive APIs,
  Picker) + `'self'`, while explicitly allowing the app's required inline Emotion
  styles and `data:`/`blob:` reader image/font/worker assets. `frame-ancestors` must
  be delivered in `public/_headers`; do not rely on a meta tag for it.
- **Least privilege:** the single **`drive.file`** scope — per-file access to
  app-created or user-picked files; the app can never see the rest of the user's
  Drive. **Never** request `drive.readonly`/`drive`.
- **ID token validation:** check audience (`aud` = your Client ID), issuer, and
  expiry (client-side now; server-side in Phase 7 if added).
- **No server-side user content:** there is no app server in the default model;
  state this in a short privacy note ("your books live in your Google Drive; we
  store nothing").
- **Per-file privacy:** because the app uses only `drive.file`, it has access solely
  to files it created or the user explicitly picked — a strong privacy default worth
  stating plainly in the privacy note.
- **Local cache hygiene:** the IndexedDB extraction cache holds derived book content
  for performance; it is regenerable but privacy-sensitive. Clear it on sign-out by
  default, or namespace records by Google `sub` if cache retention is deliberately
  chosen. Always offer a **"clear cache"** action.
- **OAuth verification:** `drive.file` is **non-sensitive**, so it needs only basic
  consent-screen verification — **no** restricted-scope security assessment (confirm
  current Google requirements).
- **Transport:** HTTPS only. **Retry/backoff + jitter** and rate-limit Drive calls
  (see Risks — Drive quota / rate limits).
- **Rendering:** keep using DOM-based metadata handling (no unsafe HTML injection).

**Files touched:** CSP config, `src/auth/*`, `src/services/drive/*`,
`src/storage/bookCache.ts` (cache clear), a privacy note in `docs/cloud-deploy.md`.

**Acceptance criteria**

- No secrets in the bundle; CSP blocks unrelated endpoints while allowing the
  documented Google, Emotion, and reader asset requirements.
- Scope is `drive.file` only (never `drive.readonly`/`drive`); sign-out clears
  tokens; the local cache is cleared on sign-out by default or account-namespaced and
  clearable on demand.

---

## Phase 7 — (Optional) Thin backend / BFF

**Default decision:** Skip this phase unless the browser-only GIS token model from
Phases 2-6 becomes insufficient. The planned app works without a backend: Google
Drive remains the source of truth, the SPA talks to Google APIs directly, and there
is still no application database or server-side EPUB storage.

**What "BFF" means here:** a **Backend For Frontend** is a tiny service owned by
this app, deployed next to the static site. Its job is auth/session plumbing only:
it can hold a Google OAuth client secret, perform the OAuth code exchange, keep or
refresh Google tokens in a server-controlled session, and return only the small API
responses the SPA needs. It is **not** a content backend.

**Choose this phase only when you need one of these capabilities:**

- **Refresh tokens / fewer re-consent prompts:** browser-only access tokens are
  short-lived and cannot safely keep a refresh token. A BFF can use the server-side
  OAuth code flow and refresh Drive access without asking the user again during long
  sessions.
- **Server-held secrets:** any real secret, such as an OAuth client secret, must live
  on the server. The current Client ID, Picker API key, and Picker App ID are public
  and do **not** require a backend.
- **Server-verified identity:** the SPA can perform lightweight ID-token checks, but
  a BFF can verify tokens server-side before creating an app session.
- **Future features that need a server:** non-Google identity providers,
  organization/team policy, or sharing/collaboration workflows. These are out of
  scope for the default app.

**What changes if this phase is adopted:**

1. Add a small Cloudflare Worker (or equivalent) that handles Google OAuth using a
   server-side code flow, stores secrets only in Worker environment variables, and
   issues an **httpOnly**, `Secure`, `SameSite=Lax` session cookie to the SPA.
2. The Worker refreshes Google Drive access tokens when needed. Token/session state
   can live in encrypted cookies or another minimal session store, but it must not
   store EPUB files, extracted book content, covers, manifests, or settings as app
   data.
3. Decide whether Drive REST calls still happen directly from the SPA using short
   access tokens returned by the BFF, or whether the BFF proxies a narrow set of
   Drive calls. If proxying, keep the API deliberately small: manifest/settings
   read-write, file metadata, EPUB upload/download, and Picker bootstrap support.
4. Keep the same data model: `library.json`, `settings.json`, and EPUB files stay in
   the user's Google Drive; the derived extraction cache stays local in IndexedDB;
   remove-from-library still only forgets the manifest entry and local cache.
5. Deploy the Worker alongside Cloudflare Pages and update `src/auth/*` and the Drive
   client seam to call the BFF where needed.

**Hard boundaries**

- Do **not** add an application database for books.
- Do **not** upload EPUBs or extracted sections to the BFF.
- Do **not** broaden Drive scopes beyond `drive.file` just because a server exists.
- Do **not** make Phase 7 a prerequisite for deployment; Phase 8 should work from
  the no-backend SPA path.

**Files touched:** new `server/` or `functions/`, deployment config, Worker
environment-variable docs, and focused changes to `src/auth/*` plus the Drive client
boundary if the SPA stops calling Google APIs directly.

**Acceptance criteria**

- The existing no-backend SPA path still works and remains documented as the default.
- Secrets live **only** on the server; none are bundled into the SPA.
- The SPA can sign in through the BFF, keep an httpOnly-session-backed login, and
  refresh Drive access without user re-consent during long sessions.
- Google Drive remains the source of truth for user content; the BFF stores no EPUB
  files, extracted content, manifest data, or settings as application-owned data.
- Hosting remains cheap and simple, preferably Cloudflare Pages + Cloudflare Workers.

---

## Phase 8 — Deployment (build, hosting, domain, OAuth origins)

**Goal:** Ship the app to **Cloudflare Pages** over HTTPS with Google sign-in + Drive working.

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
- Signed-out (gate) and signed-in (cloud) states.

**Checklist**

- Signed-out shows the sign-in gate; nothing else is reachable.
- First run prompts a **library-folder pick** (Google Picker); the choice persists.
- Sign-in / sign-out; identity displayed; tokens cleared on sign-out; the local
  extraction cache is cleared by default or account-namespaced and clearable.
- **Add from Drive** (Picker) → the picked `.epub` is downloaded once for
  hash/metadata/fingerprint and joins the library.
- **Upload** a local `.epub` → it lands in the library folder and joins the library.
- **Remove** a book → it leaves the library, but the file is **still in Drive**
  (re-add works).
- A manifest entry whose Drive file was deleted is pruned on refresh.
- Open a book on a second browser/profile (same account) → downloads + extracts.
- Refresh or direct navigation to a reader hash URL opens from the manifest without
  relying on in-memory `File` route state.
- Replacing a Drive EPUB with different bytes invalidates the old local cache and
  updates the manifest to the new content hash/fingerprint.
- Theme + reading position/mode save to `settings.json` (debounced) and restore on
  another device.
- Refresh reloads `library.json` + `settings.json`.
- Token expiry silently re-authorizes; **quota / rate-limit / Drive-full** errors
  are surfaced with actionable text.
- Reopening a book validates Drive metadata, then uses the local IndexedDB extraction
  cache on a fingerprint match (fast; no EPUB re-download or re-extraction).
- Clearing the local cache still lets books open (re-download + re-extract).
- PWA still installs and app-shell caching is unaffected (no offline reading).

**Acceptance criteria**

- All checklist items pass on at least two browsers.
- `npm run build`, `npm run lint`, `npm test` remain green.

---

## Hosting and cost

Because the app is a **static SPA** using **client-side Google OAuth** (public
Client ID, no secret) and stores books in the **user's own Drive**, it needs **no
database and no app server**. It is hosted on **Cloudflare Pages** (free global CDN,
free SSL, custom domains, `_headers` for CSP, Git-based CI).

**Cost:** **$0** on Cloudflare's free tier; a custom domain is an optional ~$10/yr.
The only thing that could add cost is the optional Phase 7 backend (Cloudflare
Workers has a free tier too).

---

## Step-by-step hosting procedure

### A. One-time Google OAuth setup

1. Open the **Google Cloud Console** → create/select a project.
2. **APIs & Services → Library** → enable **Google Drive API** and
   **Google Picker API**.
3. **APIs & Services → OAuth consent screen** → _External_ → fill app name, support
   email, developer email → add scopes (`openid`, `email`, `profile`,
   `.../auth/drive.file`) → add your domain under **Authorized domains** → add
   **test users** while in _Testing_. `drive.file` is **non-sensitive** → basic
   verification, **no** security assessment.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web
   application.** Under **Authorized JavaScript origins** add `http://localhost:5173`,
   `http://localhost:4173`, and your production URL(s). Save.
5. **Create credentials → API key** (for the Picker); restrict it to the
   **Picker API** and your origins. Note your **project number** (the Picker App ID).
6. Copy the **Client ID**, **API key**, and **project number** (all public/non-secret).

### B. Deploy to Cloudflare Pages ($0)

1. Push the repo to GitHub/GitLab.
2. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git** →
   pick the repo.
3. **Build settings:** framework preset _Vite_ (or _None_); build command
   `npm run build`; output directory `dist`.
4. **Environment variables:** add `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, and
   `VITE_GOOGLE_PROJECT_NUMBER` for both **Production** and **Preview**.
5. Add `public/_headers` with the CSP (allow the Google, Emotion, and reader asset
   requirements from Phase 1).
   Commit and redeploy.
6. Deploy; note the `*.pages.dev` URL.
7. _(Optional)_ **Custom domain:** Pages → _Custom domains_ → add
   `reader.example.com`; Cloudflare provisions free SSL.
8. Return to the **Google OAuth client** → add the `*.pages.dev` and/or custom
   domain to **Authorized JavaScript origins** → Save (allow a few minutes to
   propagate).
9. Visit the site → **Sign in with Google** → pick a library folder → verify that
   **Upload** and **Add from Drive** (Picker) both add books, and that **Remove**
   leaves the file in your Drive.

---

## Risks and mitigations

- **OAuth verification.** The app uses only the **non-sensitive** `drive.file` scope
  → basic OAuth consent-screen verification and **no** security assessment. This is
  the main reason to stay on `drive.file` + the Google Picker (rather than the
  restricted `drive.readonly`/`drive` scopes).
- **Token lifetime.** Browser access tokens are short-lived and non-refreshable in
  the pure-SPA model → silent re-request; add the optional BFF (Phase 7) for
  long-lived refresh tokens so long reading sessions don't prompt re-consent.
- **Online-only dependency.** There is no offline mode: if Google APIs are
  unreachable the library, metadata validation, and opening new or stale books are
  unavailable → show a clear connectivity error and retry. A previously validated
  cache hit can avoid the EPUB download, but do not advertise offline reading.
- **Drive file mutation / stale cache.** A user can replace or edit a picked Drive
  EPUB outside the app while the old content hash remains cached locally → store a
  Drive fingerprint in the manifest and validate it before every cache-backed open;
  changed fingerprints force re-download, re-hash, manifest update, and stale-cache
  invalidation.
- **Large EPUB uploads/downloads.** Resumable upload + progress; stream downloads;
  never block reading. The derived extraction cache stays in **local IndexedDB**
  (persistent; regenerated on a miss) and is **never** uploaded to Drive.
- **Local cache growth / eviction.** The IndexedDB extraction cache can get large,
  and browsers may evict it under storage pressure → cap/manage its size (LRU +
  manual clear) and regenerate from the Drive EPUB on a miss.
- **Concurrency.** Last-write-wins by `updatedAt`/`modifiedTime`; content-hash `id`s
  make EPUB bytes conflict-free. No offline outbox (online-only).
- **Cost creep.** The default path is $0 (Cloudflare Pages) — avoid databases/servers
  unless Phase 7 is explicitly chosen.
- **CSP vs GIS/Picker/reader assets.** Google Identity + the Picker need specific
  script/frame origins (`accounts.google.com`, `apis.google.com`, `docs.google.com`),
  Emotion needs inline runtime styles unless the app adopts CSP nonces, and extracted
  reader assets use `data:`/`blob:` URLs → verify sign-in, Picker, covers, fonts,
  service worker registration, and extracted sections under the deployed CSP.
- **Security.** Never store tokens in `localStorage`; keep to the single `drive.file`
  scope (never `drive.readonly`/`drive`); validate the ID token; HTTPS only; clear
  the local cache on sign-out by default or namespace it by Google `sub`, and always
  offer a manual clear-cache action.
- **Folder-content access (verify).** Whether picking a _folder_ also grants
  `drive.file` access to create/update/recover child metadata and files added later
  must be proven before Phase 3. The plan treats the library as a **curated manifest**
  (add via Picker/upload), not a folder scan. If the proof fails, revise bootstrap
  before implementation rather than broadening scopes.

### Drive quota and rate limits (detailed)

Google Drive enforces **per-project** and **per-user** request limits (defaults are
on the order of ~**12,000 queries/min/project** and a **per-user/100-seconds** cap;
treat exact numbers as subject to change and read them from the Cloud console
**APIs & Services → Quotas** page). Two distinct limits matter:

- **API request rate** — how many Drive calls/second the app makes.
- **User storage** — EPUB bytes count against the **user's own** 15 GB Google
  storage, not an app quota; a full Drive fails uploads.

**Failure modes to handle**

| Symptom                        | HTTP / reason                                            | Response                                                           |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Rate limit hit (project/user)  | `403 rateLimitExceeded` / `userRateLimitExceeded`, `429` | Exponential backoff **+ jitter**; honor `Retry-After`; then retry. |
| User's Drive is full           | `403 storageQuotaExceeded`                               | Stop; show "Your Google Drive is full — free space or upgrade."    |
| Token expired / revoked        | `401`                                                    | Silent token re-request; if it fails, prompt sign-in.              |
| Transient server/network error | `5xx` / network                                          | Backoff + retry a bounded number of times, then surface an error.  |

**Mitigations (design the client to make few, cheap calls)**

- **Minimize calls:** load `library.json` once per session and keep it in memory;
  update-and-write-back rather than re-listing. Prefer a single index file over
  per-book metadata calls.
- **No enumeration:** the library is the manifest (one small file), so there is no
  folder scan — read `library.json` once per session and reconcile deltas rather than
  re-reading every book.
- **`fields` masks + paging:** request only needed fields on `list`/`get` to shrink
  payloads and quota cost; page large listings.
- **Debounce/coalesce writes:** reading position changes constantly — write
  `settings.json` on pause and at most every few seconds, coalescing rapid
  updates into one request.
- **Conditional fetches:** before trusting an extraction-cache hit, fetch cheap Drive
  metadata (`id`, `modifiedTime`, `size`, `md5Checksum` or ETag) and compare it with
  the manifest fingerprint. A match can serve from the local cache without an EPUB
  download; a mismatch invalidates the old cache and re-downloads.
- **Reuse the local extraction cache:** an IndexedDB cache **hit** renders a book
  after metadata validation with **no EPUB Drive download** and **no** re-extraction
  — the single biggest way to cut Drive calls. Optionally cache downloaded `.epub`
  bytes (Cache Storage) so a cache miss doesn't re-download the same file.
- **Backoff everywhere:** centralize exponential backoff **with jitter** and
  `Retry-After` handling in `driveClient.ts`; cap concurrency (a small request
  queue) so bursts (multi-book operations) don't trip the per-user limit.
- **Batch where possible:** group independent metadata operations; avoid N+1 calls
  when hydrating the library.
- **Surface clearly:** map quota/rate/full errors to actionable UI messages; never
  fail silently mid-read.
- **Scale path:** if the app grows, request a **per-project quota increase** in the
  Cloud console; the per-user cap cannot be raised, so client-side backoff/caching
  remains essential.

---

## Out of scope (unless requested)

- Application-owned server storage of user EPUBs (books stay in the user's Drive).
- Non-Google identity providers (unless the Phase 7 backend is added).
- Real-time collaboration or sharing between users.
- Server-side EPUB processing.
- Deleting the underlying Drive **file** from the web UI (the in-app **Remove** only forgets a book/reference; the file stays in the user's Drive).
- Offline reading / a local-first library (removed by design — the app is online-only).

---

## Suggested execution order summary

**0** Google/hosting prereqs + folder proof → **1** Deploy-ready SPA (env + CSP) →
**2** Required Google sign-in → **3** Drive client + Picker + manifest →
**4** Drive as source of truth (storage migration) → **5** Library/account UX →
**6** Security hardening → **7** _(optional)_ BFF → **8** Deployment →
**9** QA matrix.
