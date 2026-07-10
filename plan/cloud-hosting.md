# Plan: Host the EPUB Reader in the cloud (Google accounts + Google Drive storage)

This plan turns the existing PWA into a **cloud-hosted web app** that:

- requires users to **sign in with Google** (Google Identity Services),
- stores each user's EPUB library in **their own Google Drive** (per-user storage),
- reads and renders EPUBs **directly from Drive** — there is no local library and
  no offline mode.

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
  listing. The app stores **zero** user content server-side.
- The derived extraction cache is **not** stored on Drive (too large; it would burn
  Drive quota). It is kept in a **local IndexedDB cache** that persists across
  sessions so reopening a book is fast, and is regenerated from the Drive EPUB only
  when missing.

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
   to manage books in**. Picking it grants `drive.file` access to that folder; the app
   creates an `app-data/` sub-folder there, records the folder id in the manifest, and
   remembers it locally so later visits skip this step (it can also re-find its
   `library.json` among its `drive.file`-accessible files).
4. **Library loads.** The app reads its **manifest** (`app-data/library.json`) — the
   **curated list of books the user has added** — and renders the grid. The library is
   _whatever the user added_, not a raw listing of the folder.
5. **Add a book — two ways.** (a) **Add from Drive:** the Google Picker lets the user
   select existing `.epub` file(s); picking grants `drive.file` access and the app
   records them in the manifest. (b) **Upload:** pick a local `.epub`; the app uploads
   it (resumable) into the library folder via `drive.file` and records it.
6. **Remove from library = forget (never delete).** Removing a book **drops it from
   the manifest** (the app relinquishes its reference/access) and clears its local
   cache; the **file stays in the user's Drive**. Re-adding it later works.
7. **Open a book → build the local cache.** On first open the app downloads the EPUB
   bytes and extracts sections/assets/TOC into the browser's **IndexedDB** cache.
   Later opens read from IndexedDB (no re-download, no re-extraction) for fast start.
8. **Preferences live in Drive.** Theme, per-book reading **position**, reading
   **mode**, and **zoom** are stored in **`app-data/settings.json`** (in the
   sub-folder so app metadata is separated from the book files), written via
   `drive.file`.
9. **Refresh.** The manifest and `settings.json` are re-read on **every app access**
   and can be re-synced on demand via a **Refresh** button; a manifest entry whose
   Drive file has been removed (a `404` on fetch) is pruned from the library.

**Drive layout (per user):**

```
<library folder>/            ← user-picked via the Google Picker (drive.file)
  ├─ Book One.epub           ← in-app Upload lands here; picked books may live elsewhere
  ├─ Book Two.epub
  └─ app-data/               ← app-created sub-folder: metadata, separated from books
       ├─ library.json       ← curated manifest: folderId + (bookId(hash) ↔ Drive fileId + title/author/cover/size/timestamps)
       └─ settings.json      ← { theme, perBook: { [bookId]: { location, mode, zoom } } }
```

**Book identity:** the internal `bookId` is the **SHA-256 content hash** of the EPUB
bytes (the IndexedDB cache + per-book settings key). The manifest maps Drive `fileId`
↔ `bookId`, so adding the same book twice de-duplicates. Picked books may live
anywhere in the user's Drive; uploaded books land in the library folder.

---

## Current state (baseline assessment)

| Area                 | Today                                                                                                   | Cloud target                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting model        | Static Vite build + PWA, `base: "./"` in [vite.config.ts](../vite.config.ts)                            | Deploys to Cloudflare Pages as-is (static build, no server rewrites).                                                                                                                     |
| Routing              | TanStack Router **hash history** in [src/router.tsx](../src/router.tsx)                                 | Hash URLs need **no SPA rewrite rules** — ideal for static hosts.                                                                                                                                   |
| Auth                 | None                                                                                                    | **Required** Google sign-in (Google Identity Services). The whole app is gated behind a session.                                                                                                    |
| Book identity        | SHA-256 **content hash** as `id` in [src/storage/library.ts](../src/storage/library.ts)                 | Deterministic key for Drive filenames, dedup, and conflict-free byte storage.                                                                                                                       |
| Library storage      | `StoredBook` (incl. `fileData: ArrayBuffer`) in IndexedDB via [src/storage/db.ts](../src/storage/db.ts) | Moves to Drive: a **curated `library.json` manifest** in `app-data/` (books the user adds via the Picker or upload); book files live in a user-picked folder. IndexedDB is no longer authoritative. |
| Reading state        | `StoredReadingState` in [src/storage/readingState.ts](../src/storage/readingState.ts)                   | Folded into `app-data/settings.json` (theme + per-book position/mode/zoom) in Drive; last-write-wins by `updatedAt`. Writes are debounced.                                                          |
| Extraction cache     | Derived `extracted-*` stores in [src/storage/bookCache.ts](../src/storage/bookCache.ts)                 | **Kept** in the local IndexedDB cache for fast reopening; **never** uploaded to Drive (size + quota); regenerated from the Drive EPUB on a cache miss.                                              |
| Networking           | Fully offline; no network for content                                                                   | **Online-only**: network to **Google APIs** is required to load the manifest, download, and render books.                                                                                           |
| Secrets              | None in the client                                                                                      | OAuth **Client ID + Picker API key + App ID are public** and safe in the SPA; any real secret requires the optional backend (Phase 7).                                                              |
| PWA / service worker | App-shell only in [vite.config.ts](../vite.config.ts)                                                   | Keep app-shell caching for fast loads only; **never** cache API/token responses or user content. No offline reading.                                                                                |

---

## Key decisions (confirmed)

- **Identity provider:** **Google Identity Services (GIS)** — required sign-in. It
  directly enables Drive access. Other providers are out of scope unless the Phase 7
  backend is added.
- **Storage backend:** the user's own **Google Drive**. On first run the user
  **picks a library folder** via the Google Picker; the app creates an
  **`app-data/` sub-folder** there for the manifest and settings.
- **First-run folder selection:** the very first visit (no saved folder) prompts the
  user, via the **Google Picker**, to choose the Drive folder to manage books in
  (the Picker needs the Picker API, a public API key, and your App ID / Cloud project
  number). Picking grants `drive.file` access to that folder; the choice is remembered
  (locally + in the manifest) so it's asked only once.
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
- **Adding books:** two paths —
  1. **Add from Drive:** the Google Picker lets the user select existing `.epub`
     file(s); picking grants `drive.file` access and the app records them in the
     manifest.
  2. **In-app Upload:** pick a local `.epub`; the app uploads it (resumable) into the
     library folder via `drive.file` and records it.
- **Removing books = forget (not delete):** removing a book drops it from the
  manifest (the app relinquishes its reference/access) and clears its local cache;
  the **Drive file is never deleted**, which makes an in-app "remove" safe.
- **Preferences:** theme + per-book position/mode/zoom persist to
  **`app-data/settings.json`**; the curated **manifest** persists to
  **`app-data/library.json`**. Both are re-read on every app access and via a
  **Refresh** button.
- **Book identity:** internal `bookId` = SHA-256 content hash (cache + settings key);
  the manifest maps Drive `fileId` ↔ `bookId`, so re-adding the same book
  de-duplicates.
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
  **no** user content server-side. Sign-out clears tokens and the local cache.

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

**Files touched:** docs only (record decisions in this plan or a new
`docs/cloud-deploy.md`).

**Acceptance criteria**

- A **Web** OAuth Client ID and a **Picker API key** exist; the consent screen
  requests only `drive.file` (non-sensitive) with test users added.
- No source/build changes; `npm run build`, `npm run lint`, `npm test` unaffected.

---

## Phase 1 — Make the SPA cloud/deploy-ready (config, env, headers)

**Goal:** The static build deploys cleanly to Cloudflare Pages and reads the OAuth
Client ID and Picker API key from the environment, behind a required sign-in gate.

**Steps**

1. **Typed env:** add `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` (Picker), and
   `VITE_GOOGLE_PROJECT_NUMBER` (Picker App ID). Create `.env.example` and extend
   `ImportMetaEnv` in [src/vite-env.d.ts](../src/vite-env.d.ts). Never hardcode these
   in source. (The library folder is chosen at runtime via the Picker, not an env var.)
2. **Routing/base sanity:** confirm hash routing + `base: "./"` in
   [vite.config.ts](../vite.config.ts) work on Cloudflare Pages. No SPA fallback rule
   is needed with hash routing.
3. **Security headers / CSP:** add a Content-Security-Policy that allows only what
   Google Identity, Drive, and the Picker need and nothing else:
   - `script-src` → `'self' https://accounts.google.com/gsi/client https://apis.google.com`
   - `connect-src` → `'self' https://www.googleapis.com https://content.googleapis.com https://oauth2.googleapis.com https://accounts.google.com`
   - `frame-src` → `https://accounts.google.com https://docs.google.com` (the Picker
     renders in a `docs.google.com` iframe)
   - `frame-ancestors` → `'self'`
     Provide this via `public/_headers` for Cloudflare (with a `<meta http-equiv>`
     fallback in [index.html](../index.html)). Keep the PWA app-shell cache; ensure
     Drive/token/Picker responses are **network-only** (never precached or
     runtime-cached).
4. **Auth gate:** unauthenticated users see a **sign-in screen**; the library and
   reader are only reachable once a Google session exists. There is no local-only
   mode.

**Files touched:** new `.env.example`, [src/vite-env.d.ts](../src/vite-env.d.ts),
[vite.config.ts](../vite.config.ts), new `public/_headers`, possibly
[index.html](../index.html).

**Acceptance criteria**

- `npm run build`, `npm run lint`, `npm test` pass.
- `npm run preview` shows the **sign-in gate** when signed-out; no library/reader is
  reachable without a session.
- The Client ID + Picker API key are read from env; CSP allows the Google + Picker
  endpoints and blocks others.
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
4. **Sign-out:** clear the session/tokens and return to the sign-in screen. The
   local IndexedDB extraction cache (keyed by content hash) may be **kept** for fast
   re-sign-in; expose a **"clear cache"** action for shared devices.

**Files touched:** new `src/auth/*`, [src/pages/HomePage.tsx](../src/pages/HomePage.tsx),
[src/main.tsx](../src/main.tsx) (provider), [src/router.tsx](../src/router.tsx)
(auth gate), [index.html](../index.html) (GIS script or dynamic load), possibly
[src/components/reader/ReaderToolbar.tsx](../src/components/reader/ReaderToolbar.tsx).

**Acceptance criteria**

- The app is unusable until signed in; sign-in/sign-out works in dev and `preview`;
  identity (name/avatar) is displayed.
- No secrets in the bundle; tokens are not in `localStorage`.
- Tests stay green (auth mocked / behind the seam).

---

## Phase 3 — Google Drive integration (Picker + per-user storage)

**Goal:** Let the user pick a library folder via the Google Picker, create the
`app-data/` sub-folder, and read/write the curated library (add via Picker/upload,
manifest, settings) using only `drive.file`.

**Steps**

1. **Drive access token:** use GIS `google.accounts.oauth2.initTokenClient` with the
   single `drive.file` scope. Request the token right after sign-in (or on first
   Drive action). Handle expiry with a silent re-request; handle user denial.
2. **Google Picker service:** add `src/services/drive/picker.ts` (loads the `gapi`
   `picker` library; uses the API key + App ID). It provides two flows: **(a) pick
   the library folder** (folder-select view) and **(b) pick existing `.epub`
   file(s)** to add. Picking grants the app `drive.file` access to the selection.
3. **Folder bootstrap:** on first run, prompt (via the Picker) to choose the library
   folder; create an `app-data/` sub-folder inside it; record the folder id in the
   manifest and persist it locally. On later visits, recover the manifest by finding
   the app's own `drive.file`-accessible `library.json` (or the saved folder id) —
   no re-pick needed.
4. **Drive REST client:** add `src/services/drive/driveClient.ts` wrapping the Drive
   v3 REST API — `get`/download, `create`/`update`, and **resumable upload** for EPUB
   bytes (all `drive.file`). It does **not** enumerate arbitrary folder contents and
   has **no delete** method. Centralize `401` (re-auth), `403`/`429`
   (quota/rate-limit) and network handling with **exponential backoff + jitter** here.
5. **Manifest + settings:** add `src/services/drive/manifest.ts` and
   `src/services/drive/settings.ts` that read/write `app-data/library.json` and
   `app-data/settings.json` via `drive.file`. Adding a book appends to the manifest;
   **removing forgets it** (drops the entry); a `404` when fetching a referenced file
   prunes its entry.
6. **Data mapping in Drive:**
   - `<library folder>/*.epub` — uploaded books (human filenames). Picked books may
     live elsewhere in the user's Drive; the manifest references them by `fileId`.
   - `app-data/library.json` — the **curated manifest**: `folderId` + (`bookId` ↔ Drive
     `fileId` + `BookMeta`: title, author, `coverRef`, size, timestamps).
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
- Picking an existing `.epub` adds it to the library; an **uploaded** book lands in
  the library folder and is added.
- **Removing** a book forgets it (drops the manifest entry) and leaves the Drive file
  intact.
- The manifest and `settings.json` are created/updated in `app-data/`; only
  `drive.file` is used.

---

## Phase 4 — Make Drive the source of truth (storage migration)

**Goal:** Repoint `src/storage/*` so the **library, EPUB bytes, and reading state
come from Drive**, while the **derived extraction stays in the local IndexedDB
cache** for fast reopening. IndexedDB is no longer authoritative for the library, and
there is no offline library.

**Steps**

1. **Storage seam:** refactor [src/storage/library.ts](../src/storage/library.ts) and
   [src/storage/readingState.ts](../src/storage/readingState.ts) so their public API
   (`addBookToLibrary`, `getBookFile`, `saveReadingState`, `removeBookFromLibrary`, …)
   is backed by the Drive manifest/settings services instead of IndexedDB. Keep the
   same signatures where possible so pages/hooks change minimally; `saveReadingState`
   writes into `settings.json` (`perBook`), and `removeBookFromLibrary` now **forgets**
   the book (manifest + local cache) rather than deleting the Drive file.
2. **Library index:** read `app-data/library.json` once per session into memory (the
   curated list); update it on add/remove/last-opened and write back (debounced).
   `getBookFile` downloads the book's Drive file (by `fileId`) — only needed on an
   extraction-cache miss; a `404` prunes the entry.
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
   `extracted-books-raw` / `extracted-sections`. Optionally add a small byte cache
   (Cache Storage) so a cache miss doesn't re-download the same EPUB.
5. **Extraction pipeline:** keep the existing _cache-then-extract_ flow in
   [src/pages/reader/useBookExtraction.ts](../src/pages/reader/useBookExtraction.ts):
   check the IndexedDB extraction cache first; on a **hit**, render from it (no Drive
   download, no extraction); on a **miss**, download the book's Drive file (by
   `fileId`), extract, then persist to the IndexedDB cache. Preserve the existing
   visible progress.
6. **Concurrency & removal:** last-write-wins by `updatedAt` / Drive `modifiedTime`
   for the JSON files; content-hash `id`s keep books conflict-free. **Remove-from-
   library** just drops the manifest entry + local cache (the Drive file is **never**
   deleted); a referenced file that has vanished (`404`) is pruned the same way. No
   offline outbox (online-only).

**Files touched:** [src/storage/library.ts](../src/storage/library.ts),
[src/storage/readingState.ts](../src/storage/readingState.ts),
[src/storage/db.ts](../src/storage/db.ts) (drop `library`/`reading-state`, keep the
extraction-cache stores), [src/storage/bookCache.ts](../src/storage/bookCache.ts)
(kept as the local extraction cache),
[src/pages/reader/useBookExtraction.ts](../src/pages/reader/useBookExtraction.ts),
[src/pages/HomePage.tsx](../src/pages/HomePage.tsx),
[src/pages/reader/useReaderPersistence.ts](../src/pages/reader/useReaderPersistence.ts).

**Acceptance criteria**

- Add a book on device A (pick or upload) → it appears and opens on device B (same
  account), downloaded from Drive.
- Theme + reading position/mode persist to `settings.json` and restore on another
  device.
- Removing a book forgets it (manifest + local cache) and leaves the Drive file
  intact.
- Reopening a book on the same device uses the IndexedDB extraction cache (no
  re-download, no re-extraction).
- Clearing the local cache still lets every book open (re-download + re-extract).
- No IndexedDB **library** remains (only the extraction cache); the Vitest suite is
  updated and green.

---

## Phase 5 — Library & account UX

**Goal:** Clear cloud-native library UX (folder pick, add, remove-as-forget, refresh).

**Steps**

1. Account menu with profile + **Sign out**.
2. **First-run folder pick:** if no library folder is saved, prompt the user (via the
   Google Picker) to choose one before showing the (empty) library.
3. **Add books:** an **Upload** action (pick a local `.epub` → resumable upload into
   the library folder) and an **Add from Drive** action (Google Picker → select
   existing `.epub` file(s)).
4. **Remove from library:** a per-book **Remove** action on
   [src/components/BookCard.tsx](../src/components/BookCard.tsx) that **forgets** the
   book (drops the manifest entry + clears its local cache). Use explicit copy —
   e.g. "Remove from library (keeps the file in your Drive)" — so users know it is
   **not** a Drive delete.
5. Per-book status: **in library**, **downloading**, **extracting**, **ready** —
   reflecting the fetch/extract pipeline.
6. A global **status** indicator (loading library / saving settings / error) and a
   manual **Refresh** that reloads `library.json` + `settings.json` and prunes any
   entries whose Drive file is gone.
7. Surface **quota / rate-limit / permission / network** errors as actionable
   messages (e.g. "Your Google Drive is full", "Too many requests — retrying").
8. Empty-state guidance for first-time users (pick a folder, then add or upload).

**Files touched:** home/reader UI components, a new status/indicator component,
[src/components/BookCard.tsx](../src/components/BookCard.tsx),
[src/components/FilePicker.tsx](../src/components/FilePicker.tsx), a settings surface.

**Acceptance criteria**

- First run asks for a library folder; adding via Upload or the Picker shows the book;
  fetch/extract progress shows per book.
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
- **CSP:** keep `connect-src`/`script-src`/`frame-src` limited to Google (Identity,
  Drive APIs, Picker) + `'self'`.
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
  for performance; it is keyed by content hash and regenerable. Offer a **"clear
  cache"** action and consider clearing it on sign-out for shared devices.
- **OAuth verification:** `drive.file` is **non-sensitive**, so it needs only basic
  consent-screen verification — **no** restricted-scope security assessment (confirm
  current Google requirements).
- **Transport:** HTTPS only. **Retry/backoff + jitter** and rate-limit Drive calls
  (see Risks — Drive quota / rate limits).
- **Rendering:** keep using DOM-based metadata handling (no unsafe HTML injection).

**Files touched:** CSP config, `src/auth/*`, `src/services/drive/*`,
`src/storage/bookCache.ts` (cache clear), a privacy note in `docs/cloud-deploy.md`.

**Acceptance criteria**

- No secrets in the bundle; CSP blocks non-Google endpoints.
- Scope is `drive.file` only (never `drive.readonly`/`drive`); sign-out clears
  tokens; the local cache is clearable on demand.

---

## Phase 7 — (Optional) Thin backend / BFF

**Goal:** Only if you need **refresh tokens** (avoid re-consent during long reading
sessions), server-held secrets, non-Google logins, or shared/team features. **The
default plan needs no backend.**

**Steps**

1. A small **stateless** service (Cloudflare Workers fit the $0 host) that performs
   the OAuth **code exchange** (holding the client secret), issues an **httpOnly**
   session cookie, refreshes Drive tokens, and optionally proxies Drive calls.
2. Keep it **stateless** (stores **no** book content) to stay cheap and private.
3. Deploy on **Cloudflare Workers** (same $0 host family as Pages).

**Files touched:** new `server/` or `functions/`, deployment config, small changes
to `src/auth/*` to talk to the BFF.

**Acceptance criteria**

- The SPA works against the BFF; secrets live **only** on the server.
- Hosting stays cheap; the default no-backend path is unaffected.

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
- Sign-in / sign-out; identity displayed; tokens cleared on sign-out (the local
  extraction cache may be retained).
- **Add from Drive** (Picker) → the picked `.epub` joins the library.
- **Upload** a local `.epub` → it lands in the library folder and joins the library.
- **Remove** a book → it leaves the library, but the file is **still in Drive**
  (re-add works).
- A manifest entry whose Drive file was deleted is pruned on refresh.
- Open a book on a second browser/profile (same account) → downloads + extracts.
- Theme + reading position/mode save to `settings.json` (debounced) and restore on
  another device.
- Refresh reloads `library.json` + `settings.json`.
- Token expiry silently re-authorizes; **quota / rate-limit / Drive-full** errors
  are surfaced with actionable text.
- Reopening a book uses the local IndexedDB extraction cache (fast; no re-download
  or re-extraction).
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
5. Add `public/_headers` with the CSP (allow the Google endpoints from Phase 1).
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
  unreachable the library and reader are unavailable → show a clear connectivity
  error and retry; the local IndexedDB cache can still render a previously-opened
  book.
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
- **CSP vs GIS/Picker.** Google Identity + the Picker need specific script/frame
  origins (`accounts.google.com`, `apis.google.com`, `docs.google.com`) → verify the
  CSP does not block sign-in or the Picker.
- **Security.** Never store tokens in `localStorage`; keep to the single `drive.file`
  scope (never `drive.readonly`/`drive`); validate the ID token; HTTPS only; offer a
  local-cache clear (and clear it on sign-out for shared devices).
- **Folder-content access (verify).** Whether picking a _folder_ also grants
  `drive.file` access to files **inside** it (and files added later) is not confirmed
  in the docs, so the plan treats the library as a **curated manifest** (add via
  Picker/upload). If a folder grant does cascade, an optional "scan folder" action
  can be added later — but do not rely on it.

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
- **Conditional fetches:** use `modifiedTime`/ETags to skip re-downloading unchanged
  files; serve from the local cache on a hit.
- **Reuse the local extraction cache:** an IndexedDB cache **hit** renders a book
  with **no** Drive download and **no** re-extraction — the single biggest way to
  cut Drive calls. Optionally cache downloaded `.epub` bytes (Cache Storage) so a
  cache miss doesn't re-download the same file.
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
- Deleting the underlying Drive **file** from the web UI (the in-app **Remove** only forgets a book / relinquishes access; the file stays in the user's Drive).
- Offline reading / a local-first library (removed by design — the app is online-only).

---

## Suggested execution order summary

**0** Google/hosting prereqs → **1** Deploy-ready SPA (env + CSP + auth gate) →
**2** Required Google sign-in → **3** Drive client + Picker + manifest →
**4** Drive as source of truth (storage migration) → **5** Library/account UX →
**6** Security hardening → **7** _(optional)_ BFF → **8** Deployment →
**9** QA matrix.
