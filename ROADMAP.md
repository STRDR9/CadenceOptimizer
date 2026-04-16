# STRDR Roadmap

## v1.0 — Launch
Core running cadence app with personalized coaching.

### Completed ✅
- Metronome with multiple sound options
- Fartlek, Interval, and Progressive workout modes
- Voice coaching during workouts
- Runner profile with personalized cadence recommendations
- Race target calculator (pace, cadence, stride length)
- FIT file import and analysis
- Cadence analytics and charts
- Terrain detection via GPS
- Background audio support

### Remaining for v1.0
- [ ] Pre-workout check-in (How are you feeling? → adjusts workout intensity)
- [ ] Remove debug logging and dev tools
- [ ] App Store assets (screenshots, description, preview video)
- [ ] Privacy policy hosted at public URL
- [ ] Crash reporting integration
- [ ] Final field testing and bug fixes
- [ ] App Store submission

---

## v1.1 — Adaptive Workouts
Real-time workout adaptation based on how the runner is performing.

- [ ] Mid-workout RPE check (too easy / just right / too hard)
- [ ] Auto-adjust intervals and cadence targets based on feedback
- [ ] Passive detection via heart rate (HealthKit/Apple Watch integration)
- [ ] Post-workout fatigue logging for trend tracking
- [ ] Context tags (post-race recovery, easy day, etc.)

---

## v1.2 — Spotify Integration
BPM-matched music to sync with running cadence.

- [x] Spotify Web API integration (OAuth with PKCE)
- [x] Search songs by BPM via curated playlist search
- [x] In-app playlist builder (browse, add/remove, save to Spotify)
- [ ] Auto-generate playlists for workouts (warm-up → main → cool-down)
- [ ] Audio session management (metronome + music coexistence)
- [ ] Apple Music support (stretch goal)

### V2 Upgrade: Third-Party BPM Database
Spotify deprecated the `audio-features` endpoint (BPM/tempo data) for new apps in Nov 2024. The current approach searches BPM-curated playlists on Spotify, which works but relies on playlist creators tagging BPM correctly.

A more accurate V2 approach would use a third-party BPM database (e.g., GetSongBPM, Songdata.io) to:
1. Query songs by exact BPM range
2. Cross-reference with Spotify to get track IDs and metadata
3. Present verified BPM-matched results in the playlist builder

Tradeoffs: adds an external API dependency, requires an API key, free tiers have rate limits, and the privacy policy would need updating to reflect the third-party data request.

---

## Future Ideas
- Training plan generation (week-by-week progression)
- Social features (share workouts, compare with friends)
- Android support
- Bluetooth HR monitor support
- AI-powered cadence recommendations from historical data
- Export/share run data
