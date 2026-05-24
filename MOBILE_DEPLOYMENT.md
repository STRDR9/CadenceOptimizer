# 📱 STRDR Mobile Production Deployment Guide

## 🚀 Quick Start

The STRDR app is now configured for mobile production deployment using Expo Application Services (EAS).

## 📋 Prerequisites

### Required Accounts
- **Expo Account**: Sign up at https://expo.dev
- **Apple Developer Account**: $99/year for iOS deployment
- **Google Play Console**: $25 one-time fee for Android deployment

### Required Tools
```bash
# Install EAS CLI
npm install -g @expo/eas-cli

# Login to Expo
eas login
```

## 🏗️ Build Configuration

### 1. Initialize EAS Project
```bash
# Initialize EAS project
eas build:configure

# Set up project ID (will be generated)
eas project:init
```

### 2. Update Configuration
Edit `eas.json` and `app.json` with your specific details:

**eas.json**:
- Replace `your-apple-id@email.com` with your Apple ID
- Replace `your-app-store-connect-app-id` with your App Store Connect app ID
- Replace `your-apple-team-id` with your Apple Developer Team ID

**app.json**:
- Update `extra.eas.projectId` with your Expo project ID

## 📱 iOS Deployment

### Step 1: Prepare iOS Build
```bash
# Create iOS production build
eas build --platform ios --profile production

# Or create a preview build for testing
eas build --platform ios --profile preview
```

### Step 2: App Store Connect Setup
1. **Create App** in App Store Connect
2. **App Information**:
   - Name: "Cadence Optimizer"
   - Bundle ID: `com.cadenceoptimizer.app`
   - Category: Health & Fitness
3. **App Privacy**: Configure data collection details
4. **Age Rating**: 4+ (suitable for all ages)

### Step 3: Submit to App Store
```bash
# Submit build to App Store Connect
eas submit --platform ios --profile production
```

## 🤖 Android Deployment

### Step 1: Prepare Android Build
```bash
# Create Android production build (AAB format)
eas build --platform android --profile production

# Or create APK for testing
eas build --platform android --profile preview
```

### Step 2: Google Play Console Setup
1. **Create App** in Google Play Console
2. **App Details**:
   - App Name: "Cadence Optimizer"
   - Package Name: `com.cadenceoptimizer.app`
   - Category: Health & Fitness
3. **Content Rating**: Everyone
4. **Privacy Policy**: Required for apps that collect data

### Step 3: Submit to Google Play
```bash
# Submit build to Google Play Console
eas submit --platform android --profile production
```

## 🎨 Assets Needed

### App Icons
- **iOS**: 1024x1024px PNG (no transparency)
- **Android**: 512x512px PNG + adaptive icon assets
- **Design**: Athletic theme with #00FF9D accent color

### Screenshots
Required for both app stores:
- **iPhone**: 6.7", 6.5", 5.5" displays
- **Android**: Phone and tablet sizes
- **Content**: Show key features (metronome, analysis, profile setup)

### App Store Descriptions
See `APP_STORE_COPY.md` for optimized descriptions and keywords.

## 🔧 Environment Configuration

### Production Environment Variables
Create `.env.production`:
```
SPOTIFY_CLIENT_ID=your_production_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_production_spotify_client_secret
API_BASE_URL=https://your-api-domain.com
ANALYTICS_KEY=your_analytics_key
```

### Secrets Management
```bash
# Add secrets to EAS
eas secret:create --scope project --name SPOTIFY_CLIENT_SECRET --value your_secret_here
```

## 📊 Analytics & Monitoring

### Recommended Services
- **Expo Analytics**: Built-in usage analytics
- **Sentry**: Error tracking and performance monitoring
- **Firebase Analytics**: User behavior analytics

### Implementation
```bash
# Add Sentry for error tracking
npx expo install @sentry/react-native

# Add Firebase for analytics
npx expo install @react-native-firebase/app @react-native-firebase/analytics
```

## 🧪 Testing Strategy

### Pre-Production Testing
1. **Internal Testing**:
   ```bash
   # Build preview version
   eas build --platform all --profile preview
   ```

2. **TestFlight (iOS)**:
   - Automatic after App Store Connect submission
   - Invite beta testers

3. **Internal Testing (Android)**:
   - Upload AAB to Google Play Console
   - Create internal testing track

### Test Scenarios
- [ ] Profile setup flow
- [ ] FIT file upload (various formats)
- [ ] ZIP file extraction
- [ ] Metronome functionality
- [ ] GPS terrain detection
- [ ] Voice coaching
- [ ] Data persistence
- [ ] Navigation between screens
- [ ] Background audio playback

## 🚀 Deployment Checklist

### Pre-Launch
- [ ] All features tested on physical devices
- [ ] App icons and splash screens created
- [ ] App Store/Play Store listings prepared
- [ ] Privacy policy and terms of service created
- [ ] Analytics and error tracking configured
- [ ] Production environment variables set
- [ ] Beta testing completed

### Launch Day
- [ ] Production builds submitted
- [ ] App store listings published
- [ ] Social media announcements prepared
- [ ] User support documentation ready
- [ ] Monitoring dashboards active

### Post-Launch
- [ ] Monitor crash reports and user feedback
- [ ] Track key metrics (downloads, retention, usage)
- [ ] Plan first update based on user feedback
- [ ] Respond to app store reviews

## 🔄 Update Process

### Regular Updates
```bash
# Bump the version string in app.json (e.g. "1.0.0" -> "1.0.1")
# Bump the iOS build number in BOTH:
#   - ios/STRDR/Info.plist            (CFBundleVersion)
#   - ios/STRDR.xcodeproj/project.pbxproj  (CURRENT_PROJECT_VERSION)
# Bump the Android versionCode in app.json
# (This is a bare-workflow project — EAS does NOT read iOS buildNumber from app.json)

# Build and submit new version
eas build --platform all --profile production
eas submit --platform all --profile production
```

### Over-the-Air Updates
```bash
# For non-native changes (JS, assets)
eas update --branch production --message "Bug fixes and improvements"
```

## 📞 Support & Resources

### Documentation
- **Expo Docs**: https://docs.expo.dev
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **App Store Guidelines**: https://developer.apple.com/app-store/guidelines/
- **Google Play Policies**: https://play.google.com/about/developer-content-policy/

### Community
- **Expo Discord**: https://chat.expo.dev
- **React Native Community**: https://reactnative.dev/community/overview

---

## 🎯 Next Steps

1. **Set up Expo account** and install EAS CLI
2. **Create app store accounts** (Apple Developer, Google Play)
3. **Design app icons** and screenshots
4. **Run test builds** to verify configuration
5. **Submit for review** when ready

The app is production-ready with all core features working! 🚀