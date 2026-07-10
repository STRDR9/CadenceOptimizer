import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import MetronomeService from '../services/MetronomeService';
import LocationService from '../services/LocationService';
import TerrainDetector from '../services/TerrainDetector';
import WorkoutEngine from '../services/WorkoutEngine';
import CoachingVoiceService from '../services/CoachingVoiceService';
import analytics from '../services/AnalyticsService';
import PreWorkoutCheckIn from '../components/PreWorkoutCheckIn';
import RouteTracker from '../services/RouteTracker';
import PostWorkoutSummary from '../components/PostWorkoutSummary';
import SpotifyPlaylistBuilder from '../components/SpotifyPlaylistBuilder';
import { getRunnerProfile } from '../utils/storage';
import { saveWorkoutToHistory } from '../utils/storage';

export default function MetronomeScreenSimple() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [cadence, setCadence] = useState(170);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [mode, setMode] = useState('none'); // none, fartlek, interval, progressive
  
  // Refs to avoid stale closures in callbacks
  const isPlayingRef = useRef(false);
  const handleBeatRef = useRef(null);
  const callbacksRef = useRef({
    onPhaseChange: null,
    onCadenceChange: null,
    onWorkoutComplete: null,
    onCoachingCue: null,
  });
  
  // Terrain tracking state (available in all modes)
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [terrainData, setTerrainData] = useState({
    terrain: 'flat',
    grade: 0,
    cadenceAdjustment: 0,
    confidence: 'low',
  });
  const [baseCadence, setBaseCadence] = useState(170);
  
  // Fartlek mode states
  const [workoutStatus, setWorkoutStatus] = useState({ active: false });
  const [coachingEnabled, setCoachingEnabled] = useState(true);
  const [cueBanner, setCueBanner] = useState(null); // latest coaching cue, shown non-blocking on-screen
  const cueBannerTimer = useRef(null);
  // F8: while a coaching cue speaks we duck the metronome; this holds the
  // pre-duck volume to restore afterwards (null = not currently ducked).
  const duckBaseVolume = useRef(null);
  const [fartlekDifficulty, setFartlekDifficulty] = useState('intermediate');
  
  // Pre-workout check-in state
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [feelingModifier, setFeelingModifier] = useState(null);
  const [workoutActive, setWorkoutActive] = useState(false); // tracks if a workout session exists (even when paused)
  
  // Post-workout summary state
  const [showSummary, setShowSummary] = useState(false);
  const [workoutSummary, setWorkoutSummary] = useState(null);
  const [profileUnits, setProfileUnits] = useState('metric');
  const [showMusic, setShowMusic] = useState(false);
  
  // Interval mode states
  const [intervalConfig, setIntervalConfig] = useState({
    workDuration: 240, // 4 minutes
    restDuration: 120, // 2 minutes
    intervals: 4,
    workCadence: 185,
    restCadence: 160,
  });
  
  // Progressive mode states
  const [progressiveConfig, setProgressiveConfig] = useState({
    duration: 1800, // 30 minutes
    startCadence: 160,
    endCadence: 185,
    progressionType: 'linear',
  });

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Update ref when isPlaying changes
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Workout Engine Callbacks
  const handlePhaseChange = (phase, phaseIndex, totalPhases) => {
    setWorkoutStatus(WorkoutEngine.getStatus());
  };
  
  const handleCadenceChange = (newCadence, reason) => {
    setCadence(newCadence);
    RouteTracker.updateCadence(newCadence);
    if (isPlayingRef.current) {
      MetronomeService.updateBpm(newCadence, stableHandleBeat);
    }
  };

  const handleWorkoutComplete = (workout, stats, completed) => {
    setWorkoutStatus({ active: false });
    
    if (completed) {
      Alert.alert(
        'Workout Complete! 🎉',
        `Great job! You completed the ${workout.name} workout.\n\nStats:\n• Duration: ${Math.round(stats.duration / 60)} minutes\n• Avg Cadence: ${Math.round(stats.averageCadence)} SPM\n• Phases: ${stats.phasesCompleted}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleCoachingCue = (message, type) => {
    // Speak the cue (fire-and-forget; audio path is independent of the banner)
    CoachingVoiceService.speakCoachingCue({ message, type, priority: 'normal' });

    // Non-blocking on-screen banner instead of a modal Alert (a blocking modal
    // per phase change would interrupt the run). Auto-clears after a few seconds.
    setCueBanner(message);
    if (cueBannerTimer.current) clearTimeout(cueBannerTimer.current);
    cueBannerTimer.current = setTimeout(() => setCueBanner(null), 6000);
  };
  
  // Update callback refs
  callbacksRef.current = {
    onPhaseChange: handlePhaseChange,
    onCadenceChange: handleCadenceChange,
    onWorkoutComplete: handleWorkoutComplete,
    onCoachingCue: handleCoachingCue,
  };
  
  // Stable callback wrappers
  const stableCallbacks = {
    onPhaseChange: (...args) => {
      return callbacksRef.current.onPhaseChange?.(...args);
    },
    onCadenceChange: (...args) => {
      return callbacksRef.current.onCadenceChange?.(...args);
    },
    onWorkoutComplete: (...args) => {
      return callbacksRef.current.onWorkoutComplete?.(...args);
    },
    onCoachingCue: (...args) => {
      return callbacksRef.current.onCoachingCue?.(...args);
    },
  };

  useEffect(() => {
    // Initialize workout engine callbacks with stable wrappers
    WorkoutEngine.setCallbacks(stableCallbacks);

    // Initialize coaching voice
    CoachingVoiceService.initialize();

    // F8: duck the metronome to 30% while a coaching cue speaks so voice cues
    // aren't muddied by the click, then restore. Ducking is RELATIVE to the
    // live volume so it respects the user's volume setting.
    CoachingVoiceService.setDuckHandlers({
      onStart: () => {
        const current = MetronomeService.getState().volume;
        duckBaseVolume.current = current;
        MetronomeService.setVolume(current * 0.3);
      },
      onEnd: () => {
        if (duckBaseVolume.current != null) {
          MetronomeService.setVolume(duckBaseVolume.current);
          duckBaseVolume.current = null;
        }
      },
    });

    // Load profile units
    getRunnerProfile().then(profile => {
      if (profile?.units) setProfileUnits(profile.units);
    });

    // Update workout status every second when active
    const statusInterval = setInterval(() => {
      const status = WorkoutEngine.getStatus();
      if (status.active) {
        setWorkoutStatus(status);
      }
    }, 1000);

    
    return () => {
      MetronomeService.cleanup();
      WorkoutEngine.stopWorkout();
      CoachingVoiceService.stopSpeaking();
      stopLocationTracking();
      clearInterval(statusInterval);
      if (cueBannerTimer.current) clearTimeout(cueBannerTimer.current);
    };
  }, []);

  const handleBeat = (beatNumber) => {
    setCurrentBeat(beatNumber);
    
    // Web audio fallback
    if (typeof window !== 'undefined' && audioEnabled) {
      try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = beatNumber % 4 === 0 ? 800 : 600; // Accent every 4th beat
        gainNode.gain.setValueAtTime(volume * 0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      } catch (error) {
        // Web audio not available
      }
    }
    
    // Pulse animation
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };
  
  // Update handleBeat ref
  handleBeatRef.current = handleBeat;
  
  // Stable callback that always uses current handleBeat
  const stableHandleBeat = (beatNumber) => {
    if (handleBeatRef.current) {
      handleBeatRef.current(beatNumber);
    }
  };

  // Handle location updates for terrain detection
  const handleLocationUpdate = (location, locationHistory) => {
    const analysis = TerrainDetector.processLocation(location, locationHistory);
    setTerrainData(analysis);
    
    // Record point for route tracking
    RouteTracker.addPoint(location);
    RouteTracker.updateCadence(cadence);
    
    // Adjust cadence if terrain is enabled and metronome is playing
    if (terrainEnabled && isPlaying) {
      const adjustedCadence = baseCadence + analysis.cadenceAdjustment;
      const newCadence = Math.max(140, Math.min(200, adjustedCadence));
      
      if (Math.abs(newCadence - cadence) >= 2) { // Only update if significant change
        setCadence(newCadence);
        MetronomeService.updateBpm(newCadence, stableHandleBeat);
      }
    }
  };

  // Start location tracking for terrain mode
  const startLocationTracking = async () => {
    try {
      await LocationService.startTracking(handleLocationUpdate);
      setIsTrackingLocation(true);
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      Alert.alert(
        'Location Error',
        'Unable to access GPS. Please enable location permissions for terrain mode.',
        [{ text: 'OK' }]
      );
    }
  };

  // Stop location tracking
  const stopLocationTracking = () => {
    LocationService.stopTracking();
    setIsTrackingLocation(false);
    setTerrainData({
      terrain: 'flat',
      grade: 0,
      cadenceAdjustment: 0,
      confidence: 'low',
    });
  };

  // Handle split completion — voice coaching check-in
  const handleSplitComplete = (split) => {
    if (!coachingEnabled) return;

    const unitLabel = profileUnits === 'imperial' ? 'mile' : 'kilometer';
    const paceLabel = profileUnits === 'imperial' ? 'per mile' : 'per K';

    const formatPace = (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const splitPace = formatPace(split.splitPace);
    const overallPace = formatPace(split.overallPace);

    // Build the message
    let message = `${unitLabel} ${split.splitNumber} complete. `;
    message += `${splitPace} ${paceLabel}. `;
    message += `Cadence ${split.splitCadence}. `;

    // Compare to overall pace and give adjustment cue
    const paceDiff = split.splitPace - split.overallPace;
    if (paceDiff > 10) {
      message += `You're slowing down. Pick it up a bit.`;
    } else if (paceDiff < -10) {
      message += `Running hot. Make sure you can hold this.`;
    } else {
      message += `Right on pace. Keep it steady.`;
    }

    CoachingVoiceService.speakCoachingCue({
      message,
      type: 'instruction',
      priority: 'high',
    });
  };

  // Actually start the metronome and workout with optional feeling modifier
  const startWorkout = async (modifier = null) => {
    try {
      const cadenceOffset = modifier?.cadenceOffset || 0;
      const adjustedCadence = cadence + cadenceOffset;
      
      analytics.trackFeatureUsage('metronome', 'workout_started', {
        mode: mode,
        cadence: adjustedCadence,
        feeling: modifier?.key || 'skipped',
        audioEnabled: audioEnabled,
        coachingEnabled: coachingEnabled
      });
      
      setWorkoutStartTime(Date.now());
      if (modifier) setFeelingModifier(modifier);
      setWorkoutActive(true);
      
      // Start terrain tracking if enabled
      if (terrainEnabled) {
        setBaseCadence(adjustedCadence);
        const splitMeters = profileUnits === 'imperial' ? 1609.34 : 1000;
        RouteTracker.start(splitMeters, handleSplitComplete);
        RouteTracker.updateCadence(adjustedCadence);
        await startLocationTracking();
      }
      
      setIsPlaying(true);
      setCadence(adjustedCadence);
      await MetronomeService.start(adjustedCadence, stableHandleBeat, volume, audioEnabled);
      
      if (mode === 'fartlek') {
        await WorkoutEngine.startFartlek({
          baseCadence: adjustedCadence,
          difficulty: fartlekDifficulty,
          duration: 1800,
          coachingEnabled: coachingEnabled,
        });
        setWorkoutStatus(WorkoutEngine.getStatus());
      }
      
      if (mode === 'interval') {
        const intensityMult = modifier?.intensityMultiplier || 1.0;
        await WorkoutEngine.startInterval({
          workDuration: intervalConfig.workDuration,
          restDuration: intervalConfig.restDuration,
          intervals: intervalConfig.intervals,
          workCadence: Math.round(intervalConfig.workCadence + cadenceOffset),
          restCadence: Math.round(intervalConfig.restCadence + cadenceOffset),
          coachingEnabled: coachingEnabled,
        });
        setWorkoutStatus(WorkoutEngine.getStatus());
      }
      
      if (mode === 'progressive') {
        await WorkoutEngine.startProgressive({
          duration: progressiveConfig.duration,
          startCadence: progressiveConfig.startCadence + cadenceOffset,
          endCadence: progressiveConfig.endCadence + cadenceOffset,
          progressionType: progressiveConfig.progressionType,
          coachingEnabled: coachingEnabled,
        });
        setWorkoutStatus(WorkoutEngine.getStatus());
      }
    } catch (error) {
      console.error('Metronome error:', error);
    }
  };

  const handleCheckInSelect = (option) => {
    setShowCheckIn(false);
    startWorkout(option);
  };

  const handleCheckInSkip = () => {
    setShowCheckIn(false);
    startWorkout(null);
  };

  const toggleMetronome = async () => {
    if (isPlaying) {
      // PAUSE — stop audio but keep workout alive
      await MetronomeService.stop();
      WorkoutEngine.pauseWorkout();
      setIsPlaying(false);
      // Don't reset workoutStatus — keep the progress visible
    } else if (workoutActive) {
      // RESUME — pick up where we left off
      setIsPlaying(true);
      await MetronomeService.start(cadence, stableHandleBeat, volume, audioEnabled);
      WorkoutEngine.resumeWorkout();
    } else {
      // START — new workout
      if (mode !== 'none') {
        setShowCheckIn(true);
      } else {
        startWorkout(null);
      }
    }
  };

  const endWorkout = async () => {
    const duration = Date.now() - workoutStartTime;
    
    analytics.trackFeatureUsage('metronome', 'workout_stopped', {
      mode: mode,
      duration: duration,
      cadence: cadence
    });

    await MetronomeService.stop();
    WorkoutEngine.stopWorkout();
    setIsPlaying(false);
    setCurrentBeat(0);
    setWorkoutActive(false);
    setFeelingModifier(null);

    let routeSummary = null;
    if (terrainEnabled) {
      routeSummary = RouteTracker.stop();
      stopLocationTracking();
    }

    // Build workout summary — always show it
    const summary = {
      date: new Date().toISOString(),
      mode: mode === 'none' ? 'free run' : mode,
      duration: duration / 1000,
      avgCadence: routeSummary?.avgCadence || cadence,
      totalDistance: routeSummary?.totalDistance || 0,
      route: routeSummary?.route || [],
      splitsKm: routeSummary?.splitsKm || [],
      splitsMi: routeSummary?.splitsMi || [],
      feeling: feelingModifier?.label || null,
      terrainEnabled: terrainEnabled,
    };

    // Save to history
    await saveWorkoutToHistory(summary);

    setWorkoutSummary(summary);
    setShowSummary(true);
    setWorkoutStatus({ active: false });
  };

  const adjustCadence = (change) => {
    const newCadence = Math.max(120, Math.min(200, cadence + change));
    setCadence(newCadence);
    if (isPlaying) {
      MetronomeService.updateBpm(newCadence, stableHandleBeat);
    }
  };

  const setPresetCadence = (newCadence) => {
    setCadence(newCadence);
    if (isPlaying) {
      MetronomeService.updateBpm(newCadence, stableHandleBeat);
    }
  };

  const updateVolume = (newVolume) => {
    setVolume(newVolume);
    if (isPlaying) {
      if (duckBaseVolume.current != null) {
        // Currently ducked under a voice cue: update the restore target so we
        // don't stomp the user's new setting when speech ends. Keep the click
        // ducked live at 30% of the new value.
        duckBaseVolume.current = newVolume;
        MetronomeService.setVolume(newVolume * 0.3);
      } else {
        MetronomeService.setVolume(newVolume);
      }
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        {/* Cadence Display - replaces old title */}
        <View style={styles.cadenceHeader}>
          <Text style={styles.cadenceValue}>{cadence}</Text>
          <Text style={styles.cadenceLabel}>SPM</Text>
          {terrainEnabled && (
            <Text style={styles.terrainBadge}>
              {terrainData.terrain === 'uphill' ? '🔺' : terrainData.terrain === 'downhill' ? '🔻' : '➡️'} 
              {terrainData.cadenceAdjustment !== 0 ? `${terrainData.cadenceAdjustment > 0 ? '+' : ''}${terrainData.cadenceAdjustment}` : 'FLAT'}
            </Text>
          )}
        </View>

        {/* Coaching cue banner — non-blocking, replaces the old modal Alert */}
        {cueBanner && (
          <View style={styles.cueBanner}>
            <Text style={styles.cueBannerText}>🎙️ {cueBanner}</Text>
          </View>
        )}

        {/* Visual Beat Indicator with +/- controls inside */}
        <View style={styles.visualSection}>
          <View style={styles.beatRow}>
            <TouchableOpacity 
              style={styles.adjustButton}
              onPress={() => adjustCadence(-5)}
            >
              <Text style={styles.adjustButtonText}>-5</Text>
            </TouchableOpacity>

            <Animated.View 
              style={[
                styles.pulseCircle,
                {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor: isPlaying ? 'rgba(0, 0, 0, 0.1)' : '#FFFFFF',
                  borderColor: isPlaying ? '#000000' : '#E5E5E5',
                }
              ]}
            >
              <Text style={styles.pulseText}>♪</Text>
            </Animated.View>

            <TouchableOpacity 
              style={styles.adjustButton}
              onPress={() => adjustCadence(5)}
            >
              <Text style={styles.adjustButtonText}>+5</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.beatCounter}>
            Beat: {currentBeat} | {Math.floor(currentBeat / 4) + 1} cycles
          </Text>
        </View>

        {/* Start/Pause Button */}
        <TouchableOpacity 
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={toggleMetronome}
        >
          <Text style={styles.playButtonText}>
            {isPlaying ? 'PAUSE' : 'START'}
          </Text>
        </TouchableOpacity>

        {/* End Workout Button — visible once a workout has started */}
        {workoutActive && (
          <TouchableOpacity 
            style={styles.endWorkoutButton}
            onPress={endWorkout}
          >
            <Text style={styles.endWorkoutButtonText}>END WORKOUT</Text>
          </TouchableOpacity>
        )}

        {/* Web Compatibility Notice */}
        {typeof window !== 'undefined' && (
          <View style={styles.webNotice}>
            <Text style={styles.webNoticeText}>
              📱 <Text style={styles.webNoticeTitle}>Mobile Experience</Text>
            </Text>
            <Text style={styles.webNoticeDesc}>
              Audio and voice coaching work best on mobile devices. Web version shows visual notifications.
            </Text>
          </View>
        )}

        {/* Voice Coaching Controls */}
        <View style={styles.audioControls}>
          <Text style={styles.controlLabel}>VOICE COACHING</Text>
          
          <TouchableOpacity 
            style={[styles.audioToggle, coachingEnabled && styles.audioToggleActive]}
            onPress={() => setCoachingEnabled(!coachingEnabled)}
          >
            <Text style={[styles.audioToggleText, coachingEnabled && styles.audioToggleTextActive]}>
              {coachingEnabled ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Spotify Music */}
        <TouchableOpacity
          style={styles.musicButton}
          onPress={() => setShowMusic(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.musicButtonIcon}>🎵</Text>
          <View style={styles.musicButtonContent}>
            <Text style={styles.musicButtonText}>FIND MUSIC AT {cadence} BPM</Text>
            <Text style={styles.musicButtonDesc}>Build a Spotify playlist for your run</Text>
          </View>
          <Text style={styles.musicButtonArrow}>→</Text>
        </TouchableOpacity>

        {/* Mode-Specific Configuration */}
        {mode === 'fartlek' && (
          <View style={styles.configSection}>
            <Text style={styles.controlLabel}>FARTLEK CONFIGURATION</Text>
            
            <View style={styles.difficultySection}>
              <Text style={styles.configLabel}>Difficulty Level</Text>
              <View style={styles.difficultyButtons}>
                {[
                  { key: 'beginner', label: 'BEGINNER', desc: '±5 SPM' },
                  { key: 'intermediate', label: 'INTERMEDIATE', desc: '±10 SPM' },
                  { key: 'advanced', label: 'ADVANCED', desc: '±15 SPM' },
                  { key: 'elite', label: 'ELITE', desc: '±20 SPM' },
                ].map((diff) => (
                  <TouchableOpacity
                    key={diff.key}
                    style={[styles.difficultyButton, fartlekDifficulty === diff.key && styles.difficultyButtonActive]}
                    onPress={() => setFartlekDifficulty(diff.key)}
                  >
                    <Text style={[styles.difficultyButtonText, fartlekDifficulty === diff.key && styles.difficultyButtonTextActive]}>
                      {diff.label}
                    </Text>
                    <Text style={[styles.difficultyButtonDesc, fartlekDifficulty === diff.key && styles.difficultyButtonDescActive]}>
                      {diff.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {mode === 'interval' && (
          <View style={styles.configSection}>
            <Text style={styles.controlLabel}>INTERVAL CONFIGURATION</Text>
            
            <View style={styles.intervalGrid}>
              <View style={styles.intervalSetting}>
                <Text style={styles.configLabel}>Work Duration</Text>
                <View style={styles.durationButtons}>
                  {[120, 180, 240, 300].map((duration) => (
                    <TouchableOpacity
                      key={duration}
                      style={[styles.durationButton, intervalConfig.workDuration === duration && styles.durationButtonActive]}
                      onPress={() => setIntervalConfig({...intervalConfig, workDuration: duration})}
                    >
                      <Text style={[styles.durationButtonText, intervalConfig.workDuration === duration && styles.durationButtonTextActive]}>
                        {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.intervalSetting}>
                <Text style={styles.configLabel}>Rest Duration</Text>
                <View style={styles.durationButtons}>
                  {[60, 90, 120, 180].map((duration) => (
                    <TouchableOpacity
                      key={duration}
                      style={[styles.durationButton, intervalConfig.restDuration === duration && styles.durationButtonActive]}
                      onPress={() => setIntervalConfig({...intervalConfig, restDuration: duration})}
                    >
                      <Text style={[styles.durationButtonText, intervalConfig.restDuration === duration && styles.durationButtonTextActive]}>
                        {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.intervalSetting}>
                <Text style={styles.configLabel}>Number of Intervals</Text>
                <View style={styles.numberSelector}>
                  <TouchableOpacity 
                    style={styles.numberButton}
                    onPress={() => setIntervalConfig({...intervalConfig, intervals: Math.max(1, intervalConfig.intervals - 1)})}
                  >
                    <Text style={styles.numberButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.numberDisplay}>{intervalConfig.intervals}</Text>
                  <TouchableOpacity 
                    style={styles.numberButton}
                    onPress={() => setIntervalConfig({...intervalConfig, intervals: Math.min(10, intervalConfig.intervals + 1)})}
                  >
                    <Text style={styles.numberButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.cadenceSettings}>
                <View style={styles.cadenceSetting}>
                  <Text style={styles.configLabel}>Work Cadence</Text>
                  <View style={styles.cadenceSelector}>
                    <TouchableOpacity 
                      style={styles.numberButton}
                      onPress={() => setIntervalConfig({...intervalConfig, workCadence: Math.max(140, intervalConfig.workCadence - 5)})}
                    >
                      <Text style={styles.numberButtonText}>-5</Text>
                    </TouchableOpacity>
                    <Text style={styles.cadenceDisplay}>{intervalConfig.workCadence}</Text>
                    <TouchableOpacity 
                      style={styles.numberButton}
                      onPress={() => setIntervalConfig({...intervalConfig, workCadence: Math.min(200, intervalConfig.workCadence + 5)})}
                    >
                      <Text style={styles.numberButtonText}>+5</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.cadenceSetting}>
                  <Text style={styles.configLabel}>Rest Cadence</Text>
                  <View style={styles.cadenceSelector}>
                    <TouchableOpacity 
                      style={styles.numberButton}
                      onPress={() => setIntervalConfig({...intervalConfig, restCadence: Math.max(140, intervalConfig.restCadence - 5)})}
                    >
                      <Text style={styles.numberButtonText}>-5</Text>
                    </TouchableOpacity>
                    <Text style={styles.cadenceDisplay}>{intervalConfig.restCadence}</Text>
                    <TouchableOpacity 
                      style={styles.numberButton}
                      onPress={() => setIntervalConfig({...intervalConfig, restCadence: Math.min(200, intervalConfig.restCadence + 5)})}
                    >
                      <Text style={styles.numberButtonText}>+5</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Workout Status */}
        {workoutStatus.active && (
          <View style={styles.workoutStatus}>
            <Text style={styles.controlLabel}>WORKOUT STATUS</Text>
            <View style={styles.statusCard}>
              <Text style={styles.statusPhase}>
                Phase {workoutStatus.currentPhase + 1}/{workoutStatus.workout?.phases?.length || 0}
              </Text>
              <Text style={styles.statusDescription}>
                {workoutStatus.phase?.type?.toUpperCase() || 'Active'}
              </Text>
              <Text style={styles.statusIntensity}>
                {workoutStatus.phase?.intensity === 'hard' ? '🔥 HIGH INTENSITY' :
                 workoutStatus.phase?.intensity === 'easy' ? '😌 RECOVERY' : '⚡ MODERATE'}
              </Text>
              <View style={styles.progressBar}>
                <View 
                  style={[styles.progressFill, { 
                    width: `${(workoutStatus.phaseProgress || 0) * 100}%` 
                  }]} 
                />
              </View>
              <Text style={styles.statusTime}>
                {Math.round(workoutStatus.phaseTimeRemaining || 0)}s remaining
              </Text>
            </View>
          </View>
        )}

        {/* Mode Selection */}
        <View style={styles.modeSection}>
          <Text style={styles.controlLabel}>TRAINING MODE</Text>
          <View style={styles.modeButtons}>
            {[
              { key: 'fartlek', label: 'FARTLEK', desc: 'Speed play' },
              { key: 'interval', label: 'INTERVAL', desc: 'Work/rest' },
              { key: 'progressive', label: 'PROGRESSIVE', desc: 'Build up' },
            ].map((modeOption) => (
              <TouchableOpacity
                key={modeOption.key}
                style={[styles.modeButton, mode === modeOption.key && styles.modeButtonActive]}
                onPress={() => setMode(mode === modeOption.key ? 'none' : modeOption.key)}
              >
                <Text style={[styles.modeButtonText, mode === modeOption.key && styles.modeButtonTextActive]}>
                  {modeOption.label}
                </Text>
                <Text style={[styles.modeButtonDesc, mode === modeOption.key && styles.modeButtonDescActive]}>
                  {modeOption.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* GPS Terrain Toggle */}
          <TouchableOpacity
            style={[styles.terrainToggle, terrainEnabled && styles.terrainToggleActive]}
            onPress={() => setTerrainEnabled(!terrainEnabled)}
          >
            <Text style={[styles.terrainToggleText, terrainEnabled && styles.terrainToggleTextActive]}>
              {terrainEnabled ? '📍 GPS TERRAIN ON' : '📍 GPS TERRAIN OFF'}
            </Text>
            <Text style={[styles.terrainToggleDesc, terrainEnabled && styles.terrainToggleDescActive]}>
              Auto-adjusts cadence for hills
            </Text>
          </TouchableOpacity>
        </View>

        {/* Feeling indicator during workout */}
        {feelingModifier && isPlaying && (
          <View style={styles.feelingIndicator}>
            <Text style={styles.feelingIndicatorText}>
              {feelingModifier.emoji} {feelingModifier.label}
              {feelingModifier.cadenceOffset !== 0 && ` (${feelingModifier.cadenceOffset > 0 ? '+' : ''}${feelingModifier.cadenceOffset} SPM)`}
            </Text>
          </View>
        )}
      </View>

      {/* Pre-workout check-in modal */}
      <PreWorkoutCheckIn
        visible={showCheckIn}
        onSelect={handleCheckInSelect}
        onSkip={handleCheckInSkip}
      />

      {/* Post-workout summary modal */}
      <PostWorkoutSummary
        visible={showSummary}
        onClose={() => setShowSummary(false)}
        summary={workoutSummary}
        units={profileUnits}
      />

      {/* Spotify playlist builder */}
      <SpotifyPlaylistBuilder
        visible={showMusic}
        onClose={() => setShowMusic(false)}
        targetCadence={cadence}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  section: {
    padding: 20,
    paddingTop: 8,
  },
  cadenceHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  cadenceValue: {
    fontSize: 64,
    fontWeight: '900',
    color: '#000000',
    lineHeight: 68,
  },
  cadenceLabel: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '700',
    letterSpacing: 2,
  },
  terrainBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  cueBanner: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cueBannerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  visualSection: {
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  beatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pulseCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#000000',
    marginHorizontal: 24,
  },
  pulseText: {
    fontSize: 48,
    color: '#000000',
    fontWeight: '900',
  },
  beatCounter: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    fontWeight: '600',
  },
  adjustButton: {
    backgroundColor: '#FFFFFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  adjustButtonText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
  },
  playButton: {
    backgroundColor: '#000000',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  playButtonActive: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  playButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  endWorkoutButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  endWorkoutButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  audioControls: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  controlLabel: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: '#000000',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  audioToggle: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginBottom: 16,
  },
  audioToggleActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  audioToggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  audioToggleTextActive: {
    color: '#FFFFFF',
  },
  volumeControl: {
    marginTop: 8,
  },
  volumeLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
    fontWeight: '600',
  },
  volumeSlider: {
    width: '100%',
    height: 40,
  },
  presets: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  presetButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetButton: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  presetButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  presetButtonTextActive: {
    color: '#FFFFFF',
  },
  modeSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  modeButton: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  modeButtonDesc: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  modeButtonDescActive: {
    color: '#CCCCCC',
  },
  configSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  configLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  difficultySection: {
    marginBottom: 20,
  },
  difficultyButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  difficultyButton: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
  },
  difficultyButtonActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  difficultyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  difficultyButtonTextActive: {
    color: '#FFFFFF',
  },
  difficultyButtonDesc: {
    fontSize: 10,
    color: '#666666',
    fontWeight: '500',
  },
  difficultyButtonDescActive: {
    color: '#CCCCCC',
  },
  coachingToggle: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  coachingToggleActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  coachingToggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  coachingToggleTextActive: {
    color: '#FFFFFF',
  },
  workoutStatus: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  statusCard: {
    alignItems: 'center',
  },
  statusPhase: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 8,
  },
  statusDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  statusIntensity: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#000000',
    borderRadius: 4,
  },
  statusTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  webNotice: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFEAA7',
  },
  webNoticeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 8,
  },
  webNoticeTitle: {
    fontWeight: '800',
  },
  webNoticeDesc: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  intervalGrid: {
    marginBottom: 20,
  },
  intervalSetting: {
    marginBottom: 20,
  },
  durationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  durationButton: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  durationButtonActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  durationButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  durationButtonTextActive: {
    color: '#FFFFFF',
  },
  numberSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  numberButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    margin: 4,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  numberButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
  },
  numberDisplay: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    minWidth: 36,
    textAlign: 'center',
  },
  cadenceSettings: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cadenceSetting: {
    flex: 1,
    marginHorizontal: 8,
  },
  cadenceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cadenceDisplay: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    minWidth: 50,
    textAlign: 'center',
  },
  progressiveGrid: {
    marginBottom: 20,
  },
  progressionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressionButton: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  progressionButtonActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  progressionButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  progressionButtonTextActive: {
    color: '#FFFFFF',
  },
  progressionButtonDesc: {
    fontSize: 10,
    color: '#666666',
    fontWeight: '500',
    textAlign: 'center',
  },
  progressionButtonDescActive: {
    color: '#CCCCCC',
  },
  feelingIndicator: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  feelingIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  musicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  musicButtonIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  musicButtonContent: {
    flex: 1,
  },
  musicButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  musicButtonDesc: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  musicButtonArrow: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
  },
  terrainToggle: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginTop: 12,
  },
  terrainToggleActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  terrainToggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  terrainToggleTextActive: {
    color: '#FFFFFF',
  },
  terrainToggleDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  terrainToggleDescActive: {
    color: '#CCCCCC',
  },
});