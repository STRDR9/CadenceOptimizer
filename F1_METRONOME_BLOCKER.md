# F1 — Gapless Background-Safe Metronome — PAUSED (blocker note)

_Last updated: 2026-06-28 • Build 26 • Branch: main_

## What F1 is
Replace the metronome with a sample-accurate, drift-free scheduler that keeps
playing when the screen is locked / app is backgrounded, and layers over music
(Spotify / Apple Music). Implemented with `react-native-audio-api` (v0.12.2).

## Status: CODE DONE ✅ — LOCAL BUILD BLOCKED ❌

### Code changes (committed + pushed)
- `src/services/MetronomeService.js` — rewritten to a Web-Audio-style scheduler
  (lookahead timer + `scheduleAhead` queue on the audio clock). Reads `bpm` live,
  so tempo changes are gapless with no restart.
  - Intentional deviation from the provided snippet: `start(bpm, onBeat, volume, audioEnabled)`
    keeps the optional `volume`/`audioEnabled` args because `MetronomeScreen.js`
    calls `start` with 4 args. Dropping them would regress (muted / wrong volume).
- `app.json` — added `react-native-audio-api` config plugin; confirmed
  `ios.infoPlist.UIBackgroundModes` includes `"audio"` (and `"location"`).
- `package.json` / `package-lock.json` — `react-native-audio-api@0.12.2` added.

### The blocker
Local `npx expo run:ios --device` fails at the **link** step, reproduced TWICE
after a full clean (`rm -rf ios/build ~/Library/Developer/Xcode/DerivedData/*`,
`pod install` to completion — 97 pods, RNAudioAPI 0.12.2 installed):

```
❌ Undefined symbols for architecture arm64:
   _OBJC_CLASS_$_RCTPackagerConnection
   Referenced from: libexpo-dev-launcher.a (EXDevLauncherController.o)
```
Plus warnings: `CoreAudioTypes framework not found`, `UIUtilities not found`,
`SwiftUICore.tbd cannot link directly`.

**Authoritative diagnosis (from user):** real `expo-dev-launcher` ×
`react-native-audio-api` linking conflict — NOT stale pods. Do **not** retry
blindly, and do **not** jump to an EAS *dev* build (developmentClient pulls in
expo-dev-launcher → same symbol error).

## Resume plan (in order)

### Option A — config fix, keep building locally
1. `npx expo install expo-build-properties`
2. In `app.json` plugins, add:
   ```json
   ["expo-build-properties", { "ios": { "useFrameworks": "static" } }]
   ```
3. Clean rebuild:
   ```
   rm -rf ios/build ~/Library/Developer/Xcode/DerivedData/*
   cd ios && pod install            # NOT npx pod-install (its prompt hangs)
   cd .. && npx expo run:ios --device --port 8082
   ```
   ⚠️ `useFrameworks: static` ripples across all pods — watch for new build
   errors in other modules and verify carefully.

### Option B — fallback: EAS preview (release) build
Release builds exclude `expo-dev-launcher`, so the `RCTPackagerConnection`
symbol is never referenced.
```
eas build --platform ios --profile preview
```
- `preview` profile EXISTS in `eas.json` (distribution: internal). ✅
- This installs an internal-distribution build to the device for the F1 test.

## On-device F1 test checklist (after a successful install)
1. Steady click, no pauses/stutter.
2. Live cadence change — smooth, no gap on tempo change.
3. Lock screen + pocket ~2 min — keeps playing.
4. Layers over Spotify / Apple Music (doesn't duck/stop them).
5. Clean stop (no lingering audio / no crash).

## Notes / gotchas
- Port 8081 is taken by a separate `metronome-spike` project — DO NOT kill it.
  Use `--port 8082`.
- Use `pod install` in `ios/` directly; `npx pod-install` hangs on an
  "Ok to proceed?" prompt Kiro can't answer.
- This is a test/dev build — NOT production. More feedback items to come; batch
  fixes before any production submission. Build number stays at 26 for now.
- Call sites to keep in mind: `src/screens/MetronomeScreen.js`,
  `src/services/WorkoutEngine.js`.
