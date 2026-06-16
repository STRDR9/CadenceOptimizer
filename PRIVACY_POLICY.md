# Privacy Policy — STRDR

**Last Updated: June 16, 2026**

## Overview

STRDR is a running cadence optimizer. Your data stays on your device by default. We don't run servers, we don't have user accounts, and we don't sell anything to anyone. The only time STRDR makes a network request is if you choose to connect your Spotify account to build cadence-matched playlists.

## What Data the App Uses

### Data You Enter (Stored On Device)
- **Runner Profile**: Age, height, weight, experience level, and running goals. Used to calculate personalized cadence and stride recommendations.
- **Workout Preferences**: Training mode selections, target cadence, and race goal times.
- **Workout History**: Completed runs, including duration, distance, cadence stats, and route GPS traces.
- **Feedback You Submit**: Bug reports and feature requests entered through the in-app feedback form.

### Data Collected During Use (Stored On Device)
- **GPS Location**: Used for terrain detection (hill-based cadence adjustments) and to record your run route. Location data stays on your device — it is not transmitted to us or any third party.
- **Motion Sensor Data**: Used to detect step cadence in real time. Not stored or transmitted.
- **FIT Files**: If you import a FIT file from a GPS watch (Garmin, Polar, Suunto, etc.), it is parsed and analyzed entirely on your device. The file is never uploaded anywhere.
- **Anonymous Usage Events**: The app tracks local feature-usage events (which screens you visited, which workouts you started) to help diagnose issues if you submit feedback. These events stay on your device — they are never sent to us or anyone else.
- **Crash Reports**: If the app crashes, basic diagnostic info is logged locally on your device. Nothing is automatically sent off-device.

### Data NOT Collected
- We do not have analytics that send data off your device.
- We do not use third-party crash reporting services.
- We do not track you across apps or websites.
- We do not collect device identifiers, IP addresses, or advertising IDs.
- There are no STRDR accounts, logins, or cloud syncing.

## Spotify Integration (Optional)

STRDR offers optional Spotify integration to find songs that match your running cadence. **This feature is only active if you explicitly tap "Connect Spotify"** in the Music screen.

If you connect your Spotify account:
- STRDR uses Spotify's official OAuth flow to obtain a temporary access token.
- The token is stored securely on your device.
- STRDR sends search requests to Spotify's API to find tracks at your target BPM, and writes any playlist you build back to your Spotify account.
- STRDR receives back: track names, artist names, album art URLs, your Spotify display name and email (so we can show "Connected as <name>"), and a Spotify user ID (so we can save playlists to your account).
- STRDR does **not** send your run data, location, or any other STRDR data to Spotify.
- You can disconnect at any time from the Music screen, which removes the token from your device.

If you never tap "Connect Spotify", **no network requests are made by the app at all** and Spotify never receives any data from STRDR.

Spotify's own privacy policy applies to data they receive. See: https://www.spotify.com/us/legal/privacy-policy/

## Data Storage

All STRDR data is stored locally on your device using AsyncStorage (the standard local storage for React Native apps). There is no STRDR server, no STRDR database, and no STRDR cloud backup.

If you delete the app, all locally stored data is deleted with it. (If you connected Spotify, any playlists you saved live on your Spotify account and persist there.)

## Data Sharing

STRDR does not share data with anyone. The Spotify integration sends search/playlist API calls to Spotify directly when you use that feature; that traffic is not routed through any STRDR server.

There are no analytics SDKs, ad networks, or tracking tools in the app.

## Children's Privacy

STRDR does not collect personal information about children. The app is rated 4+ and is safe for all ages. The Spotify integration follows Spotify's age policies; users under 13 should not connect Spotify.

## Your Rights

Since all data lives on your device:
- **Delete it** by deleting the app or clearing app data in iOS Settings.
- **View it** in the Runner Profile, History, and Settings screens within the app.
- There is nothing stored on STRDR servers to request, export, or delete.
- For data Spotify holds about you, manage it in your Spotify account.

## Permissions

STRDR may request the following iOS permissions:
- **Location (When In Use)**: For GPS-based terrain detection and route recording during runs. You can deny this and still use all non-route features.
- **Audio**: For metronome playback and voice coaching.
- **Motion**: For cadence detection via device sensors.

All permissions are optional. The core metronome works without any of them.

## Changes to This Policy

If we update this policy, the updated version will be available at the same URL.

## Contact

If you have questions about this privacy policy or the app:

**Email**: andybiesiadecki@gmail.com

---

*This policy is effective as of June 16, 2026.*
