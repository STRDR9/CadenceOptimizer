import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getRunnerProfile } from '../utils/storage';
import analytics from '../services/AnalyticsService';
import FeedbackModal from '../components/FeedbackModal';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const [hasProfile, setHasProfile] = useState(false);
  const [profile, setProfile] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  // Snappy collapse — completes over ~60px of scroll
  const COLLAPSE_DISTANCE = 60;

  // Large wordmark fades out over the first ~45px, shrinks + tucks up over the full distance
  const largeLogoOpacity = scrollY.interpolate({
    inputRange: [0, 45],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const largeLogoScale = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [1, 0.7],
    extrapolate: 'clamp',
  });
  const largeLogoTranslateY = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [0, -12],
    extrapolate: 'clamp',
  });
  // Compact banner fades in only after the large wordmark is gone — no double exposure
  const bannerOpacity = scrollY.interpolate({
    inputRange: [45, COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  // Pinned compact "STRDR" banner that tucks in as the large wordmark collapses
  const CompactBanner = () => (
    <Animated.View
      pointerEvents="none"
      style={[styles.compactBanner, { opacity: bannerOpacity }]}
    >
      <Text style={styles.compactBannerText}>STRDR</Text>
    </Animated.View>
  );

  // Animated wrapper for the large in-content wordmark (shrink + fade)
  const AnimatedLogo = ({ subheader }) => (
    <Animated.View
      style={[
        styles.logoSection,
        {
          opacity: largeLogoOpacity,
          transform: [{ scale: largeLogoScale }, { translateY: largeLogoTranslateY }],
        },
      ]}
    >
      <Text style={styles.logoText}>STRDR</Text>
      <Text style={styles.subheaderText}>{subheader}</Text>
    </Animated.View>
  );

  useEffect(() => {
    checkProfile();
  }, []);

  // Re-check profile every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      checkProfile();
    }, [])
  );

  const checkProfile = async () => {
    try {
      const savedProfile = await getRunnerProfile();
      if (savedProfile) {
        setHasProfile(true);
        setProfile(savedProfile);
      }
    } catch (error) {
      console.error('Error checking profile:', error);
    }
  };

  const ActionCard = ({ icon, title, description, onPress, style = {} }) => (
    <TouchableOpacity 
      style={[styles.actionCard, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Text style={styles.cardIcon}>{icon}</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>
      <View style={styles.cardArrow}>
        <Text style={styles.arrowText}>→</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <>
    {!hasProfile ? (
      // ONBOARDING: No profile yet — guide user to set one up
      <SafeAreaView style={styles.container} edges={['top']}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.onboardingContent}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <AnimatedLogo subheader="Cadence and Speed Optimizer" />

          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>Welcome, Runner</Text>
            <Text style={styles.welcomeBody}>
              STRDR personalizes everything — cadence targets, workout intensity, race predictions — based on your profile.
            </Text>
            <Text style={styles.welcomeBody}>
              Let's get you set up. It takes about 2 minutes.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.setupButton}
            onPress={() => {
              analytics.trackUserAction('navigation', { destination: 'Profile', source: 'onboarding' });
              navigation.navigate('Profile');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.setupButtonText}>SET UP YOUR PROFILE</Text>
            <Text style={styles.setupButtonArrow}>→</Text>
          </TouchableOpacity>

          <View style={styles.featurePreview}>
            <Text style={styles.featurePreviewTitle}>WHAT YOU'LL UNLOCK</Text>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🎵</Text>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureLabel}>Smart Metronome</Text>
                <Text style={styles.featureDesc}>5 training modes with personalized cadence</Text>
              </View>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🎯</Text>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureLabel}>Race Calculator</Text>
                <Text style={styles.featureDesc}>Cadence, pace, and stride targets for race day</Text>
              </View>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🗣️</Text>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureLabel}>Voice Coaching</Text>
                <Text style={styles.featureDesc}>Hands-free guidance during structured workouts</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.skipLink}
            onPress={() => {
              analytics.trackUserAction('navigation', { destination: 'Metronome', source: 'onboarding_skip' });
              navigation.navigate('Metronome');
            }}
          >
            <Text style={styles.skipLinkText}>Skip for now — go straight to the metronome</Text>
          </TouchableOpacity>
        </Animated.ScrollView>

        {/* Pinned compact wordmark that tucks in as the large logo collapses */}
        <CompactBanner />

        {/* Feedback button still available */}
        <TouchableOpacity
          style={styles.feedbackButton}
          onPress={() => setShowFeedback(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.feedbackButtonText}>💬</Text>
        </TouchableOpacity>

        <FeedbackModal
          visible={showFeedback}
          onClose={() => setShowFeedback(false)}
        />
      </SafeAreaView>
    ) : (
    // MAIN HOME: Profile exists — show workout-focused home
    <SafeAreaView style={styles.container} edges={['top']}>
    <Animated.ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* Collapsing wordmark */}
      <AnimatedLogo subheader="Running and Cadence Optimizer" />

      {/* Quick Actions Section */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        
        <ActionCard
          icon="📊"
          title="ANALYZE DATA"
          description="Upload your running data for intelligent performance insights"
          onPress={() => {
            analytics.trackUserAction('navigation', { destination: 'Analysis', source: 'home_quick_action' });
            navigation.navigate('Analysis');
          }}
          style={styles.analysisCard}
        />

        <ActionCard
          icon="🎵"
          title="SMART METRONOME"
          description="Precision audio coaching with adaptive cadence technology"
          onPress={() => {
            analytics.trackUserAction('navigation', { destination: 'Metronome', source: 'home_quick_action' });
            navigation.navigate('Metronome');
          }}
          style={styles.metronomeCard}
        />

        <ActionCard
          icon="🎯"
          title="RACE OPTIMIZER"
          description="Calculate optimal cadence for peak race performance"
          onPress={() => {
            analytics.trackUserAction('navigation', { destination: 'Targets', source: 'home_quick_action' });
            navigation.navigate('Targets');
          }}
          style={styles.targetsCard}
        />

        {/* Profile Section */}
        {!hasProfile ? (
          <ActionCard
            icon="👤"
            title="CREATE PROFILE"
            description="Personalize STRDR with your running metrics and goals"
            onPress={() => {
              analytics.trackUserAction('navigation', { destination: 'Profile', source: 'home_profile_setup' });
              navigation.navigate('Profile');
            }}
            style={styles.profileCard}
          />
        ) : (
          <TouchableOpacity 
            style={styles.profileCompleteCard}
            onPress={() => {
              analytics.trackUserAction('navigation', { destination: 'Profile', source: 'home_profile_complete' });
              navigation.navigate('Profile');
            }}
            activeOpacity={0.8}
          >
            <View style={styles.profileHeader}>
              <View style={styles.profileIconContainer}>
                <Text style={styles.profileIcon}>✅</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileTitle}>PROFILE COMPLETE</Text>
                <Text style={styles.profileDetails}>
                  {profile?.experience?.toUpperCase()} RUNNER
                </Text>
              </View>
            </View>
            <View style={styles.profileStats}>
              <View style={styles.profileStat}>
                <Text style={styles.profileStatValue}>{Math.round(profile?.height)}</Text>
                <Text style={styles.profileStatLabel}>CM</Text>
              </View>
              <View style={styles.profileStat}>
                <Text style={styles.profileStatValue}>{profile?.age}</Text>
                <Text style={styles.profileStatLabel}>AGE</Text>
              </View>
              <View style={styles.profileStat}>
                <Text style={styles.profileStatValue}>{Math.round(profile?.weight)}</Text>
                <Text style={styles.profileStatLabel}>KG</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Spacer */}
      <View style={styles.bottomSpacer} />
    </Animated.ScrollView>

    {/* Pinned compact wordmark that tucks in as the large logo collapses */}
    <CompactBanner />

    {/* Floating Feedback Button — sibling of ScrollView so it stays fixed over the viewport */}
    <TouchableOpacity 
      style={styles.feedbackButton}
      onPress={() => setShowFeedback(true)}
      activeOpacity={0.7}
    >
      <Text style={styles.feedbackButtonText}>💬</Text>
    </TouchableOpacity>
    
    {/* Feedback Modal */}
    <FeedbackModal
      visible={showFeedback}
      onClose={() => setShowFeedback(false)}
    />
    </SafeAreaView>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Pinned compact wordmark banner (fades in as the large logo collapses on scroll)
  compactBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  compactBannerText: {
    fontSize: 20,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    color: '#0A0A0A',
    letterSpacing: 4,
  },
  
  // Logo Section Styles
  logoSection: {
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  logoText: {
    fontSize: 48,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    color: '#0A0A0A',
    letterSpacing: 8,
    textAlign: 'center',
  },
  subheaderText: {
    fontSize: 12,
    fontFamily: 'Archivo_400Regular',
    fontWeight: '400',
    color: '#999999',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 4,
  },
  
  // Actions Section Styles
  actionsSection: {
    padding: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    marginBottom: 24,
    color: '#0A0A0A',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  // Action Card Styles
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 0,
    backgroundColor: '#F4F4F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cardIcon: {
    fontSize: 24,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 15,
    color: '#6B6B6B',
    lineHeight: 22,
    fontFamily: 'Archivo_500Medium',
    fontWeight: '500',
  },
  cardArrow: {
    position: 'absolute',
    top: 24,
    right: 24,
    width: 32,
    height: 32,
    borderRadius: 0,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
  },

  // Specialized Card Styles
  analysisCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#0A0A0A',
    backgroundColor: '#F4F4F4',
  },
  metronomeCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#0A0A0A',
    backgroundColor: '#F4F4F4',
  },
  targetsCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#0A0A0A',
    backgroundColor: '#F4F4F4',
  },
  profileCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#0A0A0A',
    backgroundColor: '#F4F4F4',
  },

  // Profile Complete Card Styles
  profileCompleteCard: {
    backgroundColor: '#F4F4F4',
    borderRadius: 0,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 0,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileIcon: {
    fontSize: 24,
  },
  profileInfo: {
    flex: 1,
  },
  profileTitle: {
    fontSize: 18,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  profileDetails: {
    fontSize: 14,
    color: '#6B6B6B',
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  profileStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  profileStat: {
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: 20,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    color: '#0A0A0A',
    letterSpacing: 0.5,
  },
  profileStatLabel: {
    fontSize: 11,
    color: '#6B6B6B',
    fontFamily: 'Archivo_700Bold',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 32,
  },
  
  // Feedback Button
  feedbackButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: '#0A0A0A',
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackButtonText: {
    fontSize: 20,
  },

  // Onboarding Styles
  onboardingContent: {
    paddingBottom: 60,
  },
  welcomeSection: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  welcomeTitle: {
    fontSize: 28,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    color: '#0A0A0A',
    letterSpacing: 1,
    marginBottom: 16,
    textAlign: 'center',
  },
  welcomeBody: {
    fontSize: 16,
    color: '#6B6B6B',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  setupButton: {
    flexDirection: 'row',
    backgroundColor: '#0A0A0A',
    marginHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  setupButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  setupButtonArrow: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    marginLeft: 12,
  },
  featurePreview: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  featurePreviewTitle: {
    fontSize: 13,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    letterSpacing: 1,
    color: '#999',
    marginBottom: 20,
    textAlign: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
    borderRadius: 0,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 14,
    color: '#6B6B6B',
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipLinkText: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'underline',
  },
});
