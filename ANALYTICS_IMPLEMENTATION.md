# 📊 STRDR Analytics Implementation

## Overview
STRDR now includes comprehensive analytics tracking to understand user behavior, feature usage, and app performance. The analytics system is lightweight, privacy-focused, and stores data locally with optional server sync capability.

## Analytics Service Features

### 🎯 Event Tracking
- **User Actions**: Navigation, button clicks, feature interactions
- **Feature Usage**: Metronome modes, file uploads, workout sessions
- **Performance**: Operation timing, success/failure rates
- **Errors**: Crash tracking and error context
- **Screen Views**: Page navigation and time spent

### 📱 Data Collection
- **Local Storage**: Events stored in AsyncStorage (last 100 events)
- **Session Tracking**: Unique session IDs and user IDs
- **Privacy First**: No personal data collected, only usage patterns
- **Offline Capable**: Works without internet connection

## Implemented Tracking Points

### 🏠 Home Screen
- **App Launch**: Track when users open STRDR
- **Navigation**: Track which features users access most
- **Profile Status**: Monitor profile completion rates
- **Quick Actions**: Measure feature discovery and usage

### 🎵 Metronome Screen
- **Workout Sessions**: Track workout start/stop with duration
- **Training Modes**: Monitor which modes are most popular
- **Settings**: Track cadence preferences and audio settings
- **Performance**: Measure workout completion rates

### 📊 Analysis Screen
- **File Uploads**: Track FIT file analysis usage
- **File Types**: Monitor supported formats and success rates
- **Processing Time**: Measure analysis performance
- **User Engagement**: Track feature adoption

### 🎯 General App Usage
- **Screen Navigation**: Track user flow through the app
- **Feature Discovery**: Identify most/least used features
- **Session Duration**: Understand user engagement levels
- **Error Tracking**: Identify and fix user pain points

## Analytics Dashboard

> **Note:** The in-app development dashboard (📊 button on Home screen) was removed in build 23 ahead of App Store submission. The analytics service itself is still active — events are tracked locally and can be inspected via React Native debugger or by extending `AnalyticsService` to emit logs / sync to a server. Re-introduce a developer-only UI if needed (e.g. gated behind `__DEV__`).

### 📈 Key Metrics Tracked
- **Daily Active Users**: Session frequency and duration
- **Feature Adoption**: Which features users discover and use
- **Workout Completion**: Success rates for different training modes
- **File Analysis**: Upload success rates and processing times
- **User Flow**: Navigation patterns and drop-off points

## Privacy & Data Handling

### 🔒 Privacy First
- **No Personal Data**: No names, emails, or identifying information
- **Anonymous IDs**: Random user IDs generated locally
- **Local Storage**: Data stays on device unless explicitly synced
- **Opt-out Ready**: Easy to disable analytics if needed

### 📋 Data Retention
- **Local Limit**: Only last 100 events stored locally
- **Session Based**: Data tied to app sessions, not persistent user tracking
- **Automatic Cleanup**: Old events automatically removed

## Usage Examples

### Track User Action
```javascript
analytics.trackUserAction('button_click', { 
  button: 'start_workout',
  screen: 'metronome' 
});
```

### Track Feature Usage
```javascript
analytics.trackFeatureUsage('metronome', 'workout_started', {
  mode: 'terrain',
  cadence: 170,
  duration: 1800
});
```

### Track Performance
```javascript
analytics.trackPerformance('fit_file_parsing', 2340, true);
```

### Track Screen Views
```javascript
analytics.trackScreen('HomeScreen');
```

## Future Enhancements

### 🚀 Planned Features
- **Server Sync**: Optional cloud analytics for cross-device insights
- **Advanced Metrics**: Cohort analysis, retention tracking
- **A/B Testing**: Feature flag support for testing new features
- **Crash Reporting**: Detailed error tracking with stack traces
- **Performance Monitoring**: App performance and optimization insights

### 📊 Advanced Analytics
- **User Segmentation**: Beginner vs advanced runner behavior
- **Feature Correlation**: Which features lead to better engagement
- **Workout Analysis**: Training pattern insights
- **Retention Metrics**: What keeps users coming back

## Implementation Status

### ✅ Completed
- [x] Analytics service architecture
- [x] Local event storage and management
- [x] Core tracking points across all screens
- [x] Privacy-first data handling
- [x] Error tracking and performance monitoring

### 🔄 Ready for Production
- [x] No external dependencies required
- [x] Works offline and online
- [x] Minimal performance impact
- [x] Privacy compliant
- [x] Easy to extend and customize

## Access Analytics Data

### 🛠️ During Development
The in-app dashboard was removed in build 23. To inspect analytics events during development:
1. Open STRDR with the dev client connected
2. Use `console.log(await analytics.getRecentEvents())` from a debug screen, or
3. Inspect `AsyncStorage` for the analytics keys via React Native debugger

### 📱 Production Considerations
- ✅ In-app dashboard / debug button removed for App Store build
- Add server sync for aggregated insights (future)
- Implement user consent flow for analytics (future)
- Add analytics export functionality (future)

---

**STRDR now has professional-grade analytics to understand user behavior and optimize the running experience!** 🏃‍♂️📊