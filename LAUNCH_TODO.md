# STRDR Launch To-Do List

## Code Cleanup
- [x] Remove all debug console.log statements ([FARTLEK], race calculator logs, etc.)
- [ ] Remove expo-dev-client / dev menu from production build
- [x] Remove any debug alerts (e.g., "Mode Check" alert)
- [x] Audit all TODO/FIXME comments in codebase
- [x] Review error handling — no raw error messages shown to users

## Testing
- [x] Field test metronome on a real run (5K+ distance)
- [ ] Field test Fartlek workout with voice coaching on a run
- [x] Field test race target calculator recommendations
- [ ] Test battery drain over a 1-hour session
- [ ] Test background audio — does metronome keep playing when screen locks?
- [ ] Test audio interruptions (phone call, notification, other audio apps)
- [ ] Test with Bluetooth headphones
- [ ] Test on at least one older iOS version (iOS 16 or 17)
- [ ] Test all permission denial flows (location, microphone, etc.)
- [ ] Test with no network connection
- [ ] Test app kill and relaunch mid-workout
- [ ] Test all screens for layout issues on different screen sizes

## App Store Assets
- [ ] App icon finalized (1024x1024 for App Store)
- [ ] Screenshots for 6.7" display (iPhone 15 Pro Max / 16 Pro Max)
- [ ] Screenshots for 6.1" display (iPhone 15 Pro / 16 Pro)
- [ ] Screenshots for 5.5" display (iPhone 8 Plus) — if supporting older devices
- [ ] App preview video (optional but recommended)
- [ ] App Store description finalized (review APP_STORE_COPY.md)
- [ ] Keywords researched and selected (100 character limit)
- [ ] Choose primary category (Health & Fitness)
- [ ] Choose secondary category (Sports)
- [ ] Age rating questionnaire completed

## Legal & Privacy
- [x] Privacy policy hosted at a public URL (https://gist.github.com/Andybiesiadecki/a46feb6980e6c22bbd1e71723df6820b)
- [ ] Review data collection — what does the app actually collect?
- [ ] App Store privacy nutrition labels filled out accurately
- [ ] Terms of service (optional but recommended)
- [x] Verify PRIVACY_POLICY.md is up to date with current app behavior

## App Store Connect Setup
- [x] App record created in App Store Connect
- [x] Bundle ID registered (com.strdr.app)
- [x] Signing certificates and provisioning profiles set up for distribution
- [x] Build uploaded via EAS Submit (build 18, TestFlight approved — Mar 29, 2026)
- [x] Build 22 uploaded to App Store Connect (May 17, 2026; processing for TestFlight). Includes onboarding, Spotify, route tracking, post-workout summary, History tab, pause/resume, metronome UI overhaul, voice coaching fixes, release-build crash fixes
- [ ] App information filled out (subtitle, promotional text, support URL)
- [ ] Contact information and demo account (if needed for review)
- [ ] Set pricing (free, paid, or freemium)
- [ ] Set availability (countries/regions)

## Production Infrastructure
- [x] Crash reporting service integrated (local CrashReportingService)
- [x] In-app feedback / bug reporting tool built in
- [x] Set up support response workflow (24-48hr response time)
- [x] Analytics working and capturing key events
- [ ] Check final app bundle size — aim for under 50MB
- [x] Verify "uses non-exempt encryption" is set to NO
- [x] Test the production build on device (Release config, no Metro)

## Pre-Launch Marketing (Optional but Helpful)
- [ ] Simple landing page or link-in-bio site
- [ ] Social media presence (Instagram, Strava club, running forums)
- [ ] Reach out to a few runner friends for TestFlight beta feedback
- [ ] Prepare a launch day post / announcement
- [ ] Consider Product Hunt or relevant running communities

## Post-Launch Plan
- [ ] Monitor crash reports daily for first week
- [ ] Respond to App Store reviews promptly
- [ ] Have a plan for the first update (bug fixes from real-world feedback)
- [ ] Track key metrics: downloads, retention, session length
