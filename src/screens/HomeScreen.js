import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { getRunnerProfile } from '../utils/storage';
import analytics from '../services/AnalyticsService';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import FeedbackModal from '../components/FeedbackModal';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const [hasProfile, setHasProfile] = useState(false);
  const [profile, setProfile] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    checkProfile();
  }, []);

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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Logo Section */}
      <View style={styles.logoSection}>
        <Text style={styles.logoText}>STRDR</Text>
        <Text style={styles.subheaderText}>Running and Cadence Optimizer</Text>
      </View>

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
      
      {/* Floating Action Buttons */}
      <TouchableOpacity 
        style={styles.feedbackButton}
        onPress={() => setShowFeedback(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.feedbackButtonText}>💬</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.analyticsButton}
        onPress={() => setShowAnalytics(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.analyticsButtonText}>📊</Text>
      </TouchableOpacity>
    </ScrollView>
    
    {/* Feedback Modal */}
    <FeedbackModal
      visible={showFeedback}
      onClose={() => setShowFeedback(false)}
    />
    
    {/* Analytics Dashboard Modal */}
    <AnalyticsDashboard 
      visible={showAnalytics}
      onClose={() => setShowAnalytics(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 8,
    textAlign: 'center',
  },
  subheaderText: {
    fontSize: 12,
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
    fontWeight: '900',
    marginBottom: 24,
    color: '#000000',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  // Action Card Styles
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F8F8F8',
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
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    fontWeight: '500',
  },
  cardArrow: {
    position: 'absolute',
    top: 24,
    right: 24,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Specialized Card Styles
  analysisCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#000000',
    backgroundColor: '#FAFAFA',
  },
  metronomeCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#000000',
    backgroundColor: '#FAFAFA',
  },
  targetsCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#000000',
    backgroundColor: '#FAFAFA',
  },
  profileCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#000000',
    backgroundColor: '#FAFAFA',
  },

  // Profile Complete Card Styles
  profileCompleteCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#000000',
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
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  profileDetails: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  profileStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  profileStat: {
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.5,
  },
  profileStatLabel: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 32,
  },
  
  // Analytics Button (Development)
  analyticsButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  analyticsButtonText: {
    fontSize: 20,
  },
  
  // Feedback Button
  feedbackButton: {
    position: 'absolute',
    bottom: 160,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  feedbackButtonText: {
    fontSize: 20,
  },
});
