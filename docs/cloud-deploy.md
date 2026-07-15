# Cloud Deployment Notes

The hosted app is a static Vite SPA. It signs users in with Google Identity Services and stores library data in each user's Google Drive using only the `drive.file` scope.

## Google Cloud Prerequisites

1. Create or select a Google Cloud project.
2. Enable the Google Drive API and Google Picker API.
3. Configure the OAuth consent screen as External. Request only `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file`.
4. Add test users while the app is in Testing. `drive.file` is non-sensitive and does not require a restricted-scope security assessment under the current model.
5. Create a Web OAuth client ID with JavaScript origins for `http://localhost:5173`, `http://localhost:4173`, and the production HTTPS origin.
6. Create a Picker API key restricted to the Picker API and the same origins.
7. Record the public Client ID, API key, and project number in deployment environment variables matching `.env.example`.

## Drive Folder Proof

Before production rollout, verify the selected-folder model manually with only `drive.file`:

1. Sign in and use the Picker to select a Drive folder.
2. Create an `app-data` child folder inside that folder.
3. Create and update `library.json` and `settings.json` inside `app-data` with the app's `appProperties` markers.
4. Reload in a fresh browser profile for the same Google account.
5. Recover the metadata by the locally saved file ids, or by listing only files visible to the app that have the matching `appProperties` marker.

If any step fails, revise the bootstrap model before depending on it. Do not broaden the Drive scope.

## Privacy Note

Your books live in your Google Drive. The app stores no EPUB files, extracted sections, manifests, settings, or reading positions on an application-owned server. With `drive.file`, the app can access only files it creates or files and folders you explicitly choose through Google Picker.

The browser keeps a local IndexedDB extraction cache so books reopen quickly. That cache is derived from Drive content, can be regenerated, and is cleared on sign-out by default. The app shell may be cached by the PWA service worker; Google API responses, OAuth tokens, Picker responses, and EPUB content are not runtime-cached.

## Cloudflare Pages

Use the normal build command:

```sh
npm run build
```

Publish the `dist` directory. Routing uses hash history and `base: "./"`, so no SPA rewrite rule is required. Security headers are delivered by `public/_headers`; the CSP in `index.html` is only a fallback for directives browsers honor in meta CSP.
