# 📱 STRDR App Store Submission Guide

**Production Build Ready!** ✅  
Build ID: cdbb86e3-d79c-4a23-9e9e-cb58957308de

---

## 🚀 Quick Start - Submit Now

### Option 1: Automated Submission (Recommended)
```bash
npx eas-cli submit --platform ios
```

This will:
1. Automatically upload your build to App Store Connect
2. Create the app listing if it doesn't exist
3. Set up TestFlight (optional)

### Option 2: Manual Upload
1. Download the .ipa file:
   https://expo.dev/artifacts/eas/rptvzZxi6Z6tvpYG3KXV9j.ipa

2. Open Xcode or Transporter app

3. Upload to App Store Connect

---

## 📋 Pre-Submission Checklist

### ✅ Technical Requirements (All Complete!)
- [x] Production build successful
- [x] Bundle ID: com.strdr.app
- [x] Team ID: 2U94X28K73
- [x] Distribution certificate configured
- [x] Provisioning profiles set up
- [x] App version: 1.0.0
- [x] Build number: 1

### ⚠️ Required Before Submission
- [ ] Create 5 app store screenshots (see below)
- [ ] Write app description (use APP_STORE_COPY.md)
- [ ] Set up privacy policy URL
- [ ] Set up support URL
- [ ] Choose app category (Health & Fitness)
- [ ] Set age rating (4+)

---

## 📸 App Store Screenshots (Required)

### Requirements
- **Size:** 1290x2796px (iPhone 15 Pro Max)
- **Format:** PNG or JPG
- **Count:** 5 screenshots minimum
- **Content:** Show key features

### Suggested Screenshots

**Screenshot 1: Home Screen**
- Show STRDR logo and hero section
- Display quick action cards
- Highlight "AI Powered" and "GPS Adaptive"

**Screenshot 2: Smart Metronome**
- Show metronome interface
- Display training mode selector
- Show cadence controls

**Screenshot 3: Training Modes**
- Show all 5 training modes
- Highlight Terrain, Fartlek, Interval modes
- Display GPS tracking

**Screenshot 4: FIT File Analysis**
- Show analysis results
- Display professional charts
- Show performance insights

**Screenshot 5: Runner Profile**
- Show profile setup
- Display personalized recommendations
- Show post-workout summary or History tab

### How to Create Screenshots

**Option A: Use Simulator**
```bash
# Start iOS simulator
npx expo start --ios

# Take screenshots with Cmd+S
# Screenshots saved to Desktop
```

**Option B: Use Real Device**
- Install via TestFlight
- Take screenshots on iPhone
- Transfer to Mac via AirDrop

**Option C: Use Design Tool**
- Use Figma or Sketch
- Import app screens
- Add marketing overlays
- Export at 1290x2796px

---

## 📝 App Store Listing

### App Information

**App Name:**
```
STRDR: Cadence & Speed Optimizer
```

**Subtitle (30 characters):**
```
AI-Powered Running Coach
```

**Description:**
Use the content from `APP_STORE_COPY.md` - it's already formatted and ready to paste.

**Keywords (100 characters):**
```
running,cadence,metronome,training,GPS,pace,coach,fitness,workout,interval
```

**Category:**
- Primary: Health & Fitness
- Secondary: Sports

**Age Rating:**
- 4+ (No objectionable content)

---

## 🔒 Privacy & Compliance

### Privacy Policy URL
You need to host `PRIVACY_POLICY.md` on a public URL. Options:

**Option 1: GitHub Pages (Free)**
1. Create a new repo: strdr-privacy
2. Upload PRIVACY_POLICY.md
3. Enable GitHub Pages
4. Use URL: https://yourusername.github.io/strdr-privacy/

**Option 2: Simple Hosting**
- Use Netlify, Vercel, or similar
- Upload as static HTML
- Get public URL

**Option 3: Personal Website**
- Add to your existing website
- Create /privacy page

### Support URL
Options:
- Email: support@strdr.app (if you have domain)
- GitHub Issues: https://github.com/yourusername/strdr/issues
- Contact form on website

### Data Collection Declaration
**What data does STRDR collect?**
- ✅ Location data (GPS for terrain detection)
- ✅ Health & Fitness data (cadence, pace, heart rate from FIT files)
- ✅ Usage analytics (local storage only, anonymous)
- ❌ No personal information
- ❌ No third-party tracking
- ❌ No advertising

---

## 🎯 App Store Connect Setup

### Step 1: Log in to App Store Connect
https://appstoreconnect.apple.com

### Step 2: Create New App
1. Click "My Apps"
2. Click "+" button
3. Select "New App"
4. Fill in details:
   - Platform: iOS
   - Name: STRDR
   - Primary Language: English
   - Bundle ID: com.strdr.app
   - SKU: strdr-001

### Step 3: Upload Build
```bash
npx eas-cli submit --platform ios
```

Or manually upload .ipa file using Transporter app.

### Step 4: Complete App Information
1. **App Information**
   - Name, subtitle, description
   - Keywords
   - Category
   - Age rating

2. **Pricing and Availability**
   - Free app
   - Available in all countries

3. **App Privacy**
   - Privacy policy URL
   - Data collection details

4. **Version Information**
   - Screenshots (5 required)
   - Promotional text
   - What's new (for updates)

5. **Build**
   - Select your uploaded build
   - Export compliance: No encryption

### Step 5: Submit for Review
1. Review all information
2. Click "Submit for Review"
3. Wait 1-3 days for Apple review

---

## ⏱️ Timeline

### Immediate (Today)
- [ ] Create 5 app store screenshots (2-3 hours)
- [ ] Set up privacy policy URL (30 minutes)
- [ ] Set up support URL (15 minutes)

### Day 1
- [ ] Submit build to App Store Connect (30 minutes)
- [ ] Complete app listing (1-2 hours)
- [ ] Submit for review (5 minutes)

### Day 2-4
- [ ] Wait for Apple review (1-3 days)
- [ ] Respond to any feedback if needed

### Day 5
- [ ] App approved and live! 🎉

---

## 🆘 Troubleshooting

### Build Upload Fails
```bash
# Check build status
npx eas-cli build:view cdbb86e3-d79c-4a23-9e9e-cb58957308de

# Try manual upload with Transporter app
# Download .ipa from: https://expo.dev/artifacts/eas/rptvzZxi6Z6tvpYG3KXV9j.ipa
```

### Missing Certificates
```bash
# Regenerate certificates
npx eas-cli credentials
```

### App Store Connect Errors
- Check Team ID is correct: 2U94X28K73
- Verify Bundle ID matches: com.strdr.app
- Ensure Apple Developer account is active

---

## 📞 Support Resources

### Expo Documentation
- EAS Submit: https://docs.expo.dev/submit/introduction/
- App Store: https://docs.expo.dev/submit/ios/

### Apple Documentation
- App Store Connect: https://developer.apple.com/app-store-connect/
- Review Guidelines: https://developer.apple.com/app-store/review/guidelines/

### STRDR Documentation
- `MOBILE_DEPLOYMENT.md` - Full deployment guide
- `APP_STORE_COPY.md` - Marketing copy
- `PRIVACY_POLICY.md` - Privacy policy template
- `BUILD_FIX_SUMMARY.md` - Build fixes and changes

---

## 🎉 You're Ready!

Your production build is successful and ready for submission. The hardest part is done!

**Next steps:**
1. Create screenshots (2-3 hours)
2. Submit to App Store Connect (30 minutes)
3. Wait for Apple review (1-3 days)

**Good luck with your launch! 🚀**
