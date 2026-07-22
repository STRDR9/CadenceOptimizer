import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const [mode, setMode] = useState('none'); // none, fartlek, interval
  
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

    // Funnel payoff: did they run to completion, and for how long?
    analytics.trackFeatureUsage('metronome', 'workout_completed', {
      mode,
      completed: !!completed,
      durationSec: Math.round(stats?.duration || 0),
      avgCadence: Math.round(stats?.averageCadence || 0),
      phasesCompleted: stats?.phasesCompleted || 0,
    });

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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
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
    fontFamily: 'Archivo_900Black',
    fontSize: 84,
    color: '#0A0A0A',
    lineHeight: 88,
    letterSpacing: -2,
    marginTop: 4,
  },
  cadenceLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    color: '#6B6B6B',
    letterSpacing: 3,
    marginTop: 2,
  },
  terrainBadge: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
    color: '#6B6B6B',
    letterSpacing: 1.5,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    paddingVertical: 5,
    paddingHorizontal: 12,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  cueBanner: {
    backgroundColor: '#0A0A0A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cueBannerText: {
    fontFamily: 'Archivo_600SemiBold',
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
  },
  visualSection: {
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
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
    borderColor: '#0A0A0A',
    marginHorizontal: 24,
  },
  pulseText: {
    fontSize: 48,
    color: '#0A0A0A',
    fontWeight: '900',
  },
  beatCounter: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#6B6B6B',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  adjustButton: {
    backgroundColor: '#FFFFFF',
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0A0A0A',
  },
  adjustButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    color: '#0A0A0A',
  },
  playButton: {
    backgroundColor: '#0A0A0A',
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  playButtonActive: {
    backgroundColor: '#6B6B6B',
  },
  playButtonText: {
    fontFamily: 'Archivo_800ExtraBold',
    color: '#FFFFFF',
    fontSize: 20,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  endWorkoutButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#0A0A0A',
  },
  endWorkoutButtonText: {
    fontFamily: 'Archivo_700Bold',
    color: '#0A0A0A',
    fontSize: 15,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  audioControls: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  controlLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
    marginBottom: 16,
    color: '#6B6B6B',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  audioToggle: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginBottom: 16,
  },
  audioToggleActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  audioToggleText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
    color: '#0A0A0A',
    letterSpacing: 1,
  },
  audioToggleTextActive: {
    color: '#FFFFFF',
  },
  volumeControl: {
    marginTop: 8,
  },
  volumeLabel: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  volumeSlider: {
    width: '100%',
    height: 40,
  },
  presets: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  presetButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  presetButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
    color: '#0A0A0A',
  },
  presetButtonTextActive: {
    color: '#FFFFFF',
  },
  modeSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  modeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  modeButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  modeButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    color: '#0A0A0A',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  modeButtonDesc: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
    color: '#6B6B6B',
  },
  modeButtonDescActive: {
    color: '#B0B0B0',
  },
  configSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  configLabel: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
    color: '#0A0A0A',
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
  },
  difficultyButtonActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  difficultyButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
    color: '#0A0A0A',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  difficultyButtonTextActive: {
    color: '#FFFFFF',
  },
  difficultyButtonDesc: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 10,
    color: '#6B6B6B',
  },
  difficultyButtonDescActive: {
    color: '#B0B0B0',
  },
  coachingToggle: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  coachingToggleActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  coachingToggleText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
    color: '#0A0A0A',
  },
  coachingToggleTextActive: {
    color: '#FFFFFF',
  },
  workoutStatus: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  statusCard: {
    alignItems: 'center',
  },
  statusPhase: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 18,
    color: '#0A0A0A',
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusDescription: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    color: '#6B6B6B',
    marginBottom: 8,
  },
  statusIntensity: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    color: '#0A0A0A',
    marginBottom: 16,
    letterSpacing: 1,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#E5E5E5',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0A0A0A',
  },
  statusTime: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    letterSpacing: 0.5,
  },
  webNotice: {
    backgroundColor: '#F4F4F4',
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: '#0A0A0A',
  },
  webNoticeText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
    color: '#0A0A0A',
    marginBottom: 8,
  },
  webNoticeTitle: {
    fontFamily: 'Archivo_800ExtraBold',
  },
  webNoticeDesc: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    color: '#6B6B6B',
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  durationButtonActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  durationButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    color: '#0A0A0A',
  },
  durationButtonTextActive: {
    color: '#FFFFFF',
  },
  numberSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  numberButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 4,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  numberButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 16,
    color: '#0A0A0A',
  },
  numberDisplay: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    color: '#0A0A0A',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cadenceDisplay: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 16,
    color: '#0A0A0A',
    minWidth: 50,
    textAlign: 'center',
  },
  feelingIndicator: {
    backgroundColor: '#F4F4F4',
    padding: 12,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  feelingIndicatorText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    color: '#0A0A0A',
  },
  musicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  musicButtonIcon: {
    fontSize: 26,
    marginRight: 16,
  },
  musicButtonContent: {
    flex: 1,
  },
  musicButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    color: '#0A0A0A',
    letterSpacing: 0.5,
  },
  musicButtonDesc: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 3,
  },
  musicButtonArrow: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 20,
    color: '#0A0A0A',
  },
  terrainToggle: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginTop: 12,
  },
  terrainToggleActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  terrainToggleText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
    color: '#0A0A0A',
  },
  terrainToggleTextActive: {
    color: '#FFFFFF',
  },
  terrainToggleDesc: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#6B6B6B',
    marginTop: 4,
  },
  terrainToggleDescActive: {
    color: '#B0B0B0',
  },
});
