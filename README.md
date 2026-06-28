# STRDR

A cadence and speed optimizer for runners. Set your target, run to the beat, get faster.

Built with React Native and Expo. iOS first.

## What It Does

STRDR plays an audio metronome at your target cadence and guides you through structured workouts with voice coaching. Everything is personalized based on your runner profile — height, weight, experience, and goals.

### Training Modes
- **Basic** — steady metronome at your target cadence
- **Terrain** — GPS-adaptive cadence that adjusts for hills in real time
- **Fartlek** — randomized speed play with coached hard/easy intervals
- **Interval** — structured work/rest cycles with voice cues
- **Progressive** — gradual cadence build over the course of a run

### Pre-Workout Check-In
Before structured workouts, the app asks how you're feeling. It adjusts cadence targets and intensity based on your answer — so a recovery day actually feels like one.

### Race Target Calculator
Pick a distance, enter your goal time, and get personalized cadence, pace, and stride length recommendations.

### FIT File Analysis
Import FIT files from Garmin, Wahoo, Polar, Suunto, or any GPS watch. Get cadence zone breakdowns, pace analysis, heart rate data, and elevation profiles.

### Voice Coaching
Hands-free coaching cues during structured workouts — phase changes, pacing reminders, and motivation. Plays through headphones even when the screen is locked.

## Privacy

All data stays on your device. No accounts, no servers, no tracking. Full policy: [Privacy Policy](https://gist.github.com/STRDR9/a46feb6980e6c22bbd1e71723df6820b)

## Tech Stack

- React Native + Expo
- Expo AV (audio)
- Expo Location (GPS/terrain)
- Expo Speech (voice coaching)
- AsyncStorage (local persistence)
- FIT file parsing (custom implementation)

## Running Locally

```bash
npm install
npx expo start
```

For a release build on a physical iPhone:
```bash
npx expo run:ios --device --configuration Release
```

## Project Structure

```
src/
├── screens/           # MetronomeScreen, TargetsScreen, AnalysisScreen, etc.
├── services/          # WorkoutEngine, CoachingVoiceService, FitFileParser, etc.
├── components/        # PreWorkoutCheckIn, FeedbackModal, charts/
└── utils/             # Helpers and constants
```

## Status

v1.0 — preparing for App Store submission. Bundle ID: `com.strdr.app`
