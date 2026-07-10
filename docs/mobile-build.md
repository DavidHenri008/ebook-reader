# Mobile build (Capacitor)

This document records the local tooling and constraints for building the EPUB
Reader as a native Android/iOS app via [Capacitor](https://capacitorjs.com/).
The web PWA build stays intact; Capacitor wraps the **same** Vite build in a
native WebView. No uploads, no server, no cloud sync — the app remains
local-first.

## Project decisions

| Setting | Value |
| --- | --- |
| App / bundle identifier | `com.davidhenri.epubreader` |
| Display name | `EPUB Reader` |
| Minimum OS | Android 7.0 (API 24), iOS 15 |
| Capacitor major version | 8.x |
| Package manager | npm |
| Native projects in git | yes (`android/`, `ios/` checked in) |
| Web PWA | stays published (additional target, not a replacement) |

## Required local tooling

### Android (buildable on Windows, macOS, Linux)

- **Android Studio** (latest stable).
- **Android SDK** with API level 24 or higher.
- **JDK 17** (bundled with recent Android Studio, or installed separately).
- An **Android emulator** image or a physical device with USB debugging.

### iOS (macOS only)

- **Xcode** (latest stable from the Mac App Store).
- **CocoaPods** (`sudo gem install cocoapods` or via Homebrew).
- An **iOS Simulator** (ships with Xcode) or a physical device.
- An **Apple Developer account** for device deployment and signing.

## Platform constraint: iOS requires macOS

The current development box is **Windows**, so only the **Android** target can be
built and run locally. **iOS builds require macOS** — that work must happen on a
Mac or a macOS CI runner (for example a GitHub Actions `macos-latest` runner).

Android is fully buildable on Windows. Plan iOS work for a Mac or CI accordingly.

## Where these docs live

Native build documentation lives in this file (`docs/mobile-build.md`). Later
phases (signing, store preparation, CI) will extend it.

## Status

- Phase 0 (this document): prerequisites and constraints recorded. No source or
  build changes; `npm run build`, `npm run lint`, and `npm test` are unaffected.
