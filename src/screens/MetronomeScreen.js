import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert, AppState, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MetronomeService from '../services/MetronomeService';
import LocationService from '../services/LocationService';
import TerrainDetector from '../services/TerrainDetector';
import WorkoutEngine, { workoutStatsToEventProps, fartlekRangeLabel } from '../services/WorkoutEngine';
import CoachingVoiceService from '../services/CoachingVoiceService';
import SFIcon from '../components/SFIcon';
import analytics from '../services/AnalyticsService';
import PreWorkoutCheckIn from '../components/PreWorkoutCheckIn';
import RouteTracker, { downsamplePoints } from '../services/RouteTracker';
import StepCadenceService, {
  summarizeCadenceSamples,
  measuredCadenceAt,
  mergeMeasuredIntoSamples,
} from '../services/StepCadenceService';
import PostWorkoutSummary, { defaultUnitsFromLocale } from '../components/PostWorkoutSummary';
import SpotifyPlaylistBuilder from '../components/SpotifyPlaylistBuilder';
import { getRunnerProfile, saveWorkoutToHistory, getRunScreenPrefs, saveRunScreenPrefs } from '../utils/storage';
import { formatCountdown, formatDistance, describePhase } from '../utils/format';
import { buildSplitAnnouncement } from '../utils/splitAnnouncement';
import { getQuickStartCadence } from '../services/cadenceModel';

// FORGE-013: top tabs on the Run screen. Run = quick start + steady runs
// (default), Intervals and Fartlek host the structured modes. Tab <-> engine
// mode mapping lives here so the two can never drift.
const RUN_TABS = [
  { key: 'run', label: 'RUN', mode: 'none' },
  { key: 'intervals', label: 'INTERVALS', mode: 'interval' },
  { key: 'fartlek', label: 'FARTLEK', mode: 'fartlek' },
];
const modeForTab = (tabKey) => (RUN_TABS.find((t) => t.key === tabKey) || RUN_TABS[0]).mode;

export default function MetronomeScreenSimple({ navigation, route }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [cadence, setCadence] = useState(170);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [volume] = useState(0.8);
  const [audioEnabled] = useState(true);
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [mode, setMode] = useState('none'); // none, fartlek, interval
  const [runTab, setRunTab] = useState('run'); // FORGE-013: run | intervals | fartlek
  
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
  const [, setIsTrackingLocation] = useState(false);
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
  // FORGE-013: split callbacks are captured at workout start — read the
  // live switch value through a ref so turning it off mid-run takes effect.
  const coachingEnabledRef = useRef(true);
  useEffect(() => { coachingEnabledRef.current = coachingEnabled; }, [coachingEnabled]);
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
  const [profileUnits, setProfileUnits] = useState(defaultUnitsFromLocale()); // profile overrides below
  const [showMusic, setShowMusic] = useState(false);
  // Spotify app is in dev mode: non-allowlisted users get a 403 after OAuth.
  // When that happens we hide the entry point for the session (session-only
  // by design — allowlist status can change server-side at any time).
  const [spotifyUnavailable, setSpotifyUnavailable] = useState(false);

  // FORGE-006: Quick Start (pre-profile entry from HomeScreen).
  // quickStartSessionRef marks that this session began via Quick Start;
  // personalizePromptShownRef enforces the once-per-session cap on the
  // post-session "set up your profile" nudge (inline, never a blocking modal).
  const quickStartSessionRef = useRef(false);
  const personalizePromptShownRef = useRef(false);
  const [showPersonalizePrompt, setShowPersonalizePrompt] = useState(false);

  // FORGE-009: measured cadence. cadenceTargetRef mirrors the cadence state
  // so the step-sample callback (a long-lived closure) always reads the
  // CURRENT target. cadenceSamplesRef logs {t, target, measured} every ~2 s
  // while playing — the source for adherence/avg analytics at workout end.
  // stepTrackingRef: whether the pedometer actually started this workout.
  const cadenceTargetRef = useRef(170);
  const cadenceSamplesRef = useRef([]);
  const stepTrackingRef = useRef(false);
  // FORGE-009b: background-time accounting for tracking_quality analytics.
  const bgAccumMsRef = useRef(0);
  const bgSinceRef = useRef(null);
  const workoutStartRef = useRef(null); // ms mirror of workoutStartTime for callbacks
  // Live in-run stats (Andy 10/11): distance + elapsed, every tab. Polled
  // once a second from RouteTracker's running total while a workout is on.
  // TIME = active time: PAUSE freezes the clock (workout stays alive).
  const [liveStats, setLiveStats] = useState({ meters: 0, elapsedSec: 0, phaseLeftSec: null });
  // Andy 10/11: TOTAL TIME and INTERVAL LEFT must flip on the same second.
  // Both now come from one integer active-time clock: interval left =
  // phase length - (whole seconds since this phase began on that clock).
  const phaseClockRef = useRef({ index: -1, startSec: 0 });
  const activeMsRef = useRef(0); // banked active time from earlier segments
  const segmentStartRef = useRef(null); // start of the current playing segment
  useEffect(() => {
    if (!workoutActive) {
      activeMsRef.current = 0;
      segmentStartRef.current = null;
      phaseClockRef.current = { index: -1, startSec: 0 };
      setLiveStats({ meters: 0, elapsedSec: 0, phaseLeftSec: null });
      return undefined;
    }
    if (isPlaying && segmentStartRef.current == null) {
      segmentStartRef.current = Date.now();
    } else if (!isPlaying && segmentStartRef.current != null) {
      activeMsRef.current += Date.now() - segmentStartRef.current;
      segmentStartRef.current = null;
    }
    const tick = () => {
      const seg = segmentStartRef.current;
      const activeMs = activeMsRef.current + (seg != null ? Date.now() - seg : 0);
      const elapsedSec = Math.floor(activeMs / 1000); // whole seconds, stopwatch-style
      let phaseLeftSec = null;
      const st = WorkoutEngine.getStatus();
      if (st.active && st.phase) {
        if (st.currentPhase !== phaseClockRef.current.index) {
          phaseClockRef.current = { index: st.currentPhase, startSec: elapsedSec };
        }
        phaseLeftSec = Math.max(
          0,
          Math.round(st.phase.duration) - (elapsedSec - phaseClockRef.current.startSec)
        );
        setWorkoutStatus(st); // same tick as the clocks -> header/progress in step too
      }
      setLiveStats({ meters: RouteTracker.getLiveDistance(), elapsedSec, phaseLeftSec });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [workoutActive, isPlaying]);
  // FORGE-009c: location mode/error captured AT START — reading
  // LocationService.trackingMode after stopLocationTracking() always gave
  // 'none' (field test #2's useless diagnostic).
  const locationModeRef = useRef('none');
  const locationStartErrorRef = useRef(null);

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
  
  // Keep the target-cadence mirror current (FORGE-009)
  useEffect(() => {
    cadenceTargetRef.current = cadence;
  }, [cadence]);

  // FORGE-009b: accumulate time spent backgrounded/locked so workout events
  // can report app_state_background_pct (explains a run's tracking quality).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const now = Date.now();
      if (next === 'active') {
        if (bgSinceRef.current != null) {
          bgAccumMsRef.current += now - bgSinceRef.current;
          bgSinceRef.current = null;
        }
      } else if (bgSinceRef.current == null) {
        bgSinceRef.current = now;
      }
    });
    return () => sub.remove();
  }, []);

  // FORGE-009b: snapshot of tracking health for workout analytics. Closes the
  // background-time window without losing it (re-opens if still backgrounded).
  const buildTrackingQuality = async (series) => {
    const now = Date.now();
    if (bgSinceRef.current != null) {
      bgAccumMsRef.current += now - bgSinceRef.current;
      bgSinceRef.current = now;
    }
    const elapsed = workoutStartRef.current ? now - workoutStartRef.current : 0;
    const c = LocationService.counters || {};
    return {
      route_points: RouteTracker.points.length,
      step_windows: series ? series.filter((b) => b.cadenceSpm != null).length : 0,
      app_state_background_pct:
        elapsed > 0 ? Math.min(100, Math.round((bgAccumMsRef.current / elapsed) * 100)) : 0,
      location_permission: await LocationService.getPermissionLevel(),
      // FORGE-009c: mode as captured at START (post-stop it reads 'none'),
      // plus pipeline counters so the next field test says where points die.
      location_mode: locationModeRef.current,
      location_start_error: locationStartErrorRef.current,
      task_deliveries: c.taskDeliveries ?? 0,
      task_locations_received: c.taskLocationsReceived ?? 0,
      route_points_added: c.routePointsAdded ?? 0,
      route_points_dropped: c.routePointsDropped ?? 0,
      callback_errors: c.callbackErrors ?? 0,
      first_error: c.firstError ?? null,
    };
  };

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

  const handleWorkoutComplete = async (workout, stats, completed) => {
    setWorkoutStatus({ active: false });

    // Engine stats carry totalTime (ms) + averageCadence — shape them into the
    // normalized durationSec/avgCadence fields (FORGE-008: stats.duration never
    // existed, so this event logged zeros).
    const statProps = workoutStatsToEventProps(stats);
    if (!statProps.durationSec && workoutStartTime) {
      // Defensive fallback: derive duration from the screen's own wall clock,
      // the same source endWorkout uses.
      statProps.durationSec = Math.round((Date.now() - workoutStartTime) / 1000);
    }

    // FORGE-009/009b: measured-vs-target summary. Live samples are garbage
    // for any locked-screen stretch, so rebuild from CMPedometer history
    // when available (null => keep live samples: better than nothing).
    let samples = cadenceSamplesRef.current;
    let series = null;
    if (workoutStartRef.current) {
      series = await StepCadenceService.rebuildSeries(workoutStartRef.current, Date.now());
      if (series) samples = mergeMeasuredIntoSamples(samples, series);
    }
    const cadenceSummary = summarizeCadenceSamples(samples);
    const trackingQuality = await buildTrackingQuality(series);

    // Funnel payoff: did they run to completion, and for how long?
    analytics.trackFeatureUsage('metronome', 'workout_completed', {
      mode,
      completed: !!completed,
      ...statProps,
      target_avg_cadence: cadenceSummary.targetAvgCadence ?? statProps.avgCadence,
      measured_avg_cadence: cadenceSummary.measuredAvgCadence,
      cadence_adherence_pct: cadenceSummary.adherencePct,
      has_route: RouteTracker.points.length > 1,
      cadence_source: stepTrackingRef.current ? 'phone' : 'none',
      terrain_adjust_enabled: terrainEnabled,
      tracking_quality: trackingQuality, // FORGE-009b
    });

    if (completed) {
      Alert.alert(
        'Workout Complete',
        `Great job! You completed the ${workout.name} workout.\n\nStats:\n• Duration: ${Math.round(statProps.durationSec / 60)} minutes\n• Avg Cadence: ${statProps.avgCadence} SPM\n• Phases: ${statProps.phasesCompleted}`,
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
        // FORGE-013 item 4: dip Spotify/podcasts too while the coach speaks.
        MetronomeService.setVoiceDucking(true);
      },
      onEnd: () => {
        if (duckBaseVolume.current != null) {
          MetronomeService.setVolume(duckBaseVolume.current);
          duckBaseVolume.current = null;
        }
        MetronomeService.setVoiceDucking(false);
      },
    });

    // Load profile units
    getRunnerProfile().then(profile => {
      if (profile?.units) setProfileUnits(profile.units);
    });

    // FORGE-013: restore last-used tab + persisted voice-coach choice.
    getRunScreenPrefs().then((prefs) => {
      // A pending Quick Start param wins — it must land on the Run tab.
      if (!route?.params?.quickStart) {
        setRunTab(prefs.lastRunTab);
        setMode(modeForTab(prefs.lastRunTab));
      }
      setCoachingEnabled(prefs.coachingEnabled !== false);
    });

    // (Workout status now refreshes on the live-stats tick — one clock, Andy 10/11.)

    
    return () => {
      MetronomeService.cleanup();
      WorkoutEngine.stopWorkout();
      CoachingVoiceService.stopSpeaking();
      stopLocationTracking();
      StepCadenceService.stop();
      if (cueBannerTimer.current) clearTimeout(cueBannerTimer.current);
    };
    // Deliberate mount-once effect: stableCallbacks is a fresh object each
    // render (its stability comes from callbacksRef inside); depending on it
    // would re-init audio/engine/voice every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      } catch (_error) {
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

  // Handle location updates for route recording + terrain detection.
  // FORGE-009: RouteTracker's target cadence is kept current by the cadence
  // change paths (engine callback, +/- buttons, terrain adjust below) — the
  // old `RouteTracker.updateCadence(cadence)` here re-wrote it with this
  // closure's STALE start-time cadence on every GPS tick, mislabeling points
  // in interval/fartlek runs.
  const handleLocationUpdate = (location, locationHistory) => {
    // FORGE-009c: route points are now recorded UPSTREAM in LocationService
    // (before this callback runs), so nothing in here can cost a point.
    const analysis = TerrainDetector.processLocation(location, locationHistory);
    setTerrainData(analysis);

    // GPS-movement hint for the step sensor's confidence flag
    StepCadenceService.reportMovement((location.speed || 0) > 0.7);

    // Adjust cadence if terrain adjustment is enabled and metronome is playing
    if (terrainEnabled && isPlayingRef.current) {
      const adjustedCadence = baseCadence + analysis.cadenceAdjustment;
      const newCadence = Math.max(140, Math.min(200, adjustedCadence));
      const previousCadence = cadenceTargetRef.current;

      if (Math.abs(newCadence - previousCadence) >= 2) { // Only update if significant change
        setCadence(newCadence);
        RouteTracker.updateCadence(newCadence);
        MetronomeService.updateBpm(newCadence, stableHandleBeat);
        // FORGE-009: terrain moves the target — log every adjustment so the
        // opt-in default can be revisited with data.
        analytics.trackFeatureUsage('metronome', 'terrain_adjustment', {
          direction: newCadence > previousCadence ? 'up' : 'down',
          from: previousCadence,
          to: newCadence,
          grade: analysis.grade,
        });
      }
    }
  };

  // Start location tracking. FORGE-009: this now runs on EVERY workout (route
  // recording), so a denied permission must stay quiet — no map, run goes on.
  // Only an explicit terrain-adjustment opt-in earns the alert, since the
  // feature the user just asked for can't work. Terrain adjustment also gets
  // the faster 2 s updates; plain recording samples every 5 s for battery.
  const startLocationTracking = async () => {
    try {
      await LocationService.startTracking(handleLocationUpdate, {
        timeInterval: terrainEnabled ? 2000 : 5000,
      });
      // FORGE-009c: snapshot mode + any background-start error NOW — the
      // service resets them on stop, which is before analytics fire.
      locationModeRef.current = LocationService.trackingMode || 'none';
      locationStartErrorRef.current = LocationService.lastStartError;
      setIsTrackingLocation(true);
      return true;
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      locationModeRef.current = 'none';
      locationStartErrorRef.current = String(error?.message || error).slice(0, 200);
      if (terrainEnabled) {
        Alert.alert(
          'Location Error',
          'Unable to access GPS. Please enable location permissions to adjust the beat on hills.',
          [{ text: 'OK' }]
        );
      }
      return false;
    }
  };

  // FORGE-009: step-sensor sample every ~2 s. Long-lived closure — reads only
  // refs. Feeds RouteTracker (points carry measured cadence) and the sample
  // log behind adherence/avg analytics. Paused time is not logged.
  const handleCadenceSample = (sample) => {
    RouteTracker.updateMeasuredCadence(sample.cadenceSpm);
    if (isPlayingRef.current) {
      cadenceSamplesRef.current.push({
        t: sample.timestamp,
        target: cadenceTargetRef.current,
        measured: sample.cadenceSpm,
      });
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
    // FORGE-013 (Andy 10/10): mile/km split announcements on EVERY tab —
    // split number, split pace, running average pace, and measured cadence
    // for the split + overall. Matches the mile markers on the route map.
    // Text built (and unit-tested) in utils/splitAnnouncement.
    if (!coachingEnabledRef.current) return;
    const units = profileUnits === 'imperial' ? 'imperial' : 'metric';
    CoachingVoiceService.speakCoachingCue({
      message: buildSplitAnnouncement(split, units),
      type: 'instruction',
      priority: 'high',
    });
  };


  // Actually start the metronome and workout with optional feeling modifier.
  // `overrides` ({ cadence, mode }) lets programmatic starts (Quick Start)
  // bypass state that hasn't committed yet in the same render.
  const startWorkout = async (modifier = null, overrides = {}) => {
    try {
      const activeMode = overrides.mode ?? mode;
      const cadenceOffset = modifier?.cadenceOffset || 0;
      const adjustedCadence = (overrides.cadence ?? cadence) + cadenceOffset;

      // FORGE-014: which TTS voice this device will coach with (selected at
      // mount by CoachingVoiceService.initialize). null identifier = iOS
      // system default — the robotic case we're trying to measure.
      const voiceInfo = CoachingVoiceService.getSelectedVoiceInfo();

      analytics.trackFeatureUsage('metronome', 'workout_started', {
        mode: activeMode,
        cadence: adjustedCadence,
        feeling: modifier?.key || 'skipped',
        audioEnabled: audioEnabled,
        coachingEnabled: coachingEnabled,
        terrain_adjust_enabled: terrainEnabled, // FORGE-009
        voice_identifier: voiceInfo.identifier || 'system_default', // FORGE-014
        voice_quality: voiceInfo.quality || 'unknown', // FORGE-014
      });

      const startedAt = Date.now();
      setWorkoutStartTime(startedAt);
      workoutStartRef.current = startedAt; // FORGE-009b: callbacks need it pre-commit
      bgAccumMsRef.current = 0;            // FORGE-009b: per-workout background time
      bgSinceRef.current = AppState.currentState === 'active' ? null : startedAt;
      if (modifier) setFeelingModifier(modifier);
      setWorkoutActive(true);

      // FORGE-009: route + measured cadence are recorded on EVERY workout —
      // no toggle. Each start() is permission-gated and fails quietly:
      // location denied => no map; motion denied/simulator => measured null.
      // The terrain toggle now ONLY opts into cadence ADJUSTMENT on hills.
      setBaseCadence(adjustedCadence);
      const splitMeters = profileUnits === 'imperial' ? 1609.34 : 1000;
      RouteTracker.start(splitMeters, handleSplitComplete);
      RouteTracker.updateCadence(adjustedCadence);
      RouteTracker.updateMeasuredCadence(null);
      cadenceSamplesRef.current = [];
      await startLocationTracking();
      stepTrackingRef.current = await StepCadenceService.start(handleCadenceSample);

      // Andy 10/11: intervals open on the warmup = rest cadence he set, not
      // whatever the metronome dial happened to show.
      const openingCadence = activeMode === 'interval'
        ? Math.round(intervalConfig.restCadence + cadenceOffset)
        : adjustedCadence;
      setIsPlaying(true);
      setCadence(openingCadence);
      await MetronomeService.start(openingCadence, stableHandleBeat, volume, audioEnabled);

      if (activeMode === 'fartlek') {
        await WorkoutEngine.startFartlek({
          baseCadence: adjustedCadence,
          difficulty: fartlekDifficulty,
          duration: 1800,
          coachingEnabled: coachingEnabled,
          terrainAware: terrainEnabled,
        });
        setWorkoutStatus(WorkoutEngine.getStatus());
      }
      
      if (activeMode === 'interval') {
        await WorkoutEngine.startInterval({
          workDuration: intervalConfig.workDuration,
          restDuration: intervalConfig.restDuration,
          intervals: intervalConfig.intervals,
          workCadence: Math.round(intervalConfig.workCadence + cadenceOffset),
          restCadence: Math.round(intervalConfig.restCadence + cadenceOffset),
          coachingEnabled: coachingEnabled,
          terrainAware: terrainEnabled,
        });
        setWorkoutStatus(WorkoutEngine.getStatus());
      }
      
    } catch (error) {
      console.error('Metronome error:', error);
    }
  };

  // FORGE-006: Quick Start entry — auto-start the plain metronome at the stock
  // default cadence, zero profile required. One-shot: the param is consumed
  // immediately so re-focusing the tab never restarts audio.
  useEffect(() => {
    if (!route?.params?.quickStart) return;
    navigation?.setParams({ quickStart: undefined });
    if (isPlayingRef.current || workoutActive) return; // never stomp a live session
    quickStartSessionRef.current = true;
    setRunTab('run'); // FORGE-013: quick start always lands on the Run tab
    setMode('none'); // stock settings: plain metronome, no workout engine
    // Andy 10/11: profiled runners quick-start at THEIR cadence (Home's START A
    // RUN shows that number); no profile -> stock QUICK_START_CADENCE.
    (async () => {
      let profile = null;
      try { profile = await getRunnerProfile(); } catch (_e) { profile = null; }
      if (isPlayingRef.current) return; // a manual start won the race
      const qsCadence = getQuickStartCadence(profile);
      setCadence(qsCadence);
      startWorkout(null, { cadence: qsCadence, mode: 'none' });
    })();
    // Deliberately keyed to the quickStart param only; startWorkout/workoutActive
    // are read at fire time and must not re-trigger an audio start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.quickStart]);

  // FORGE-006: after a quick-start session ends, nudge toward profile setup —
  // inline (non-blocking) and at most ONCE per session, only while no profile
  // exists. Post-profile sessions never see it.
  const maybeShowPersonalizePrompt = async () => {
    if (!quickStartSessionRef.current || personalizePromptShownRef.current) return;
    const profile = await getRunnerProfile();
    if (profile) return; // already personalized — nothing to pitch
    personalizePromptShownRef.current = true;
    setShowPersonalizePrompt(true);
  };

  // FORGE-013: switch top tab (and the engine mode with it). Locked during a
  // session — changing the workout type mid-run was never meaningful and the
  // old mode buttons allowed it.
  const selectTab = (tabKey) => {
    if (workoutActive || isPlaying) return;
    setRunTab(tabKey);
    setMode(modeForTab(tabKey));
    saveRunScreenPrefs({ lastRunTab: tabKey });
  };

  const toggleCoaching = () => {
    const next = !coachingEnabled;
    setCoachingEnabled(next);
    saveRunScreenPrefs({ coachingEnabled: next });
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
      maybeShowPersonalizePrompt(); // FORGE-006: they stopped — quick-start nudge (once)
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
    const endedAt = Date.now();
    const duration = endedAt - workoutStartTime;

    // FORGE-009: close out recording first so the analytics below see the
    // final route + cadence samples. Recording runs on every workout now.
    RouteTracker.stop();
    stopLocationTracking();
    StepCadenceService.stop();

    // FORGE-009b: rebuild measured cadence from CMPedometer HISTORY — the
    // phone counted steps the whole run even while locked, when our live
    // callbacks were throttled into garbage (field test: 28 spm on a ~115
    // spm walk). History overwrites live values in both the sample log and
    // the recorded route points; null (no history / permission) keeps live.
    let samples = cadenceSamplesRef.current;
    const series = await StepCadenceService.rebuildSeries(workoutStartTime, endedAt);
    if (series) {
      samples = mergeMeasuredIntoSamples(samples, series);
      RouteTracker.reattachMeasured((t) => measuredCadenceAt(series, t));
    }
    const routeSummary = RouteTracker.getSummary();
    const cadenceSummary = summarizeCadenceSamples(samples);
    const trackingQuality = await buildTrackingQuality(series);
    const hasRoute = (routeSummary?.route?.length || 0) > 1;

    analytics.trackFeatureUsage('metronome', 'workout_stopped', {
      mode: mode,
      duration: duration,
      cadence: cadence,
      // Normalized fields shared with workout_completed (FORGE-008). The old
      // keys above (ms + instantaneous cadence) stay for historical queries.
      durationSec: Math.round(duration / 1000),
      // Engine average when a workout drove cadence; for plain-metronome
      // sessions the engine never ran, so the current setting IS the cadence.
      avgCadence: Math.round(WorkoutEngine.getAverageCadence()) || cadence,
      // FORGE-009: measured vs target (avgCadence above stays = target).
      target_avg_cadence: cadenceSummary.targetAvgCadence ?? cadence,
      measured_avg_cadence: cadenceSummary.measuredAvgCadence,
      cadence_adherence_pct: cadenceSummary.adherencePct,
      has_route: hasRoute,
      cadence_source: stepTrackingRef.current ? 'phone' : 'none',
      terrain_adjust_enabled: terrainEnabled,
      tracking_quality: trackingQuality, // FORGE-009b
    });

    await MetronomeService.stop();
    WorkoutEngine.stopWorkout();
    // FORGE-013 review: end any in-flight coaching speech so the duckOthers
    // session option is always released — if iOS interrupts speech (call,
    // Siri) onDone may never fire and Spotify would stay ducked.
    CoachingVoiceService.stopSpeaking();
    setIsPlaying(false);
    setCurrentBeat(0);
    setWorkoutActive(false);
    setFeelingModifier(null);

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
      // FORGE-009: per-point series (capped) + measured-cadence summary, so
      // the post-run report (FORGE-010) can draw cadence-vs-target over the
      // route. Legacy workouts simply lack these keys.
      points: downsamplePoints(routeSummary?.points || []),
      targetAvgCadence: cadenceSummary.targetAvgCadence ?? cadence,
      measuredAvgCadence: cadenceSummary.measuredAvgCadence,
      cadenceAdherencePct: cadenceSummary.adherencePct,
      cadenceSource: stepTrackingRef.current ? 'phone' : 'none',
    };

    // Save to history
    await saveWorkoutToHistory(summary);

    setWorkoutSummary(summary);
    setShowSummary(true);
    setWorkoutStatus({ active: false });
    maybeShowPersonalizePrompt(); // FORGE-006: session over — quick-start nudge (once)
  };

  const adjustCadence = (change) => {
    const newCadence = Math.max(120, Math.min(200, cadence + change));
    setCadence(newCadence);
    RouteTracker.updateCadence(newCadence); // keep recorded target current (FORGE-009)
    if (isPlaying) {
      MetronomeService.updateBpm(newCadence, stableHandleBeat);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        {/* FORGE-013: top tabs — Run (default) · Intervals · Fartlek.
            Locked during a session; last-used tab is persisted. */}
        <View style={styles.topTabs}>
          {RUN_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.topTab,
                runTab === tab.key && styles.topTabActive,
                (workoutActive || isPlaying) && runTab !== tab.key && styles.topTabDisabled,
              ]}
              onPress={() => selectTab(tab.key)}
              disabled={workoutActive || isPlaying}
            >
              <Text style={[styles.topTabText, runTab === tab.key && styles.topTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cadence Display - replaces old title */}
        <View style={styles.cadenceHeader}>
          <Text style={styles.cadenceValue}>{cadence}</Text>
          <Text style={styles.cadenceLabel}>SPM</Text>
          {terrainEnabled && (
            <Text style={styles.terrainBadge}>
              {terrainData.terrain === 'uphill' ? '▲' : terrainData.terrain === 'downhill' ? '▼' : '—'} 
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

        {/* Live in-run stats (Andy 10/11) — every tab, only during a workout.
            Intervals/Fartlek: ONE card = phase + distance + total time +
            time left in the interval (replaces the separate Workout Status
            card). Run tab: distance + time. */}
        {workoutActive && (() => {
          const d = formatDistance(liveStats.meters, profileUnits === 'imperial' ? 'imperial' : 'metric');
          const distLabel = d.unit === 'mi' ? 'MILES' : 'KM';
          if (workoutStatus.active) {
            const phase = workoutStatus.phase;
            const { title: phaseTitle, tag: intensity } = describePhase(
              phase, workoutStatus.currentPhase, workoutStatus.workout?.phases?.length || 0
            );
            return (
              <View style={styles.liveStats}>
                {/* Andy 10/11: phase is the card's headline (was a small row he
                    couldn't find on device). Never blank: 'WORKOUT' fallback. */}
                <View style={styles.liveHeader}>
                  <Text style={styles.livePhase} numberOfLines={1} adjustsFontSizeToFit>
                    {phaseTitle || 'WORKOUT'}
                  </Text>
                  {!!intensity && <Text style={styles.liveIntensity}>{intensity}</Text>}
                </View>
                <View style={styles.liveHeaderRule} />
                <View style={styles.liveRow}>
                  <View style={styles.liveStat}>
                    <Text style={styles.liveStatValueSm}>{d.value}</Text>
                    <Text style={styles.liveStatLabel}>{distLabel}</Text>
                  </View>
                  <View style={styles.liveStatDivider} />
                  <View style={styles.liveStat}>
                    <Text style={styles.liveStatValueSm}>{formatCountdown(liveStats.elapsedSec)}</Text>
                    <Text style={styles.liveStatLabel}>TOTAL TIME</Text>
                  </View>
                  <View style={styles.liveStatDivider} />
                  <View style={styles.liveStat}>
                    <Text style={styles.liveStatValueSm}>{formatCountdown(
                      liveStats.phaseLeftSec ?? workoutStatus.phaseTimeRemaining
                    )}</Text>
                    <Text style={styles.liveStatLabel}>INTERVAL LEFT</Text>
                  </View>
                </View>
                <View style={styles.liveProgress}>
                  <View style={[styles.liveProgressFill, { width: `${(workoutStatus.phaseProgress || 0) * 100}%` }]} />
                </View>
              </View>
            );
          }
          return (
            <View style={styles.liveStats}>
              <View style={styles.liveRow}>
                <View style={styles.liveStat}>
                  <Text style={styles.liveStatValue}>{d.value}</Text>
                  <Text style={styles.liveStatLabel}>{d.unit === 'mi' ? 'MILES' : 'KILOMETERS'}</Text>
                </View>
                <View style={styles.liveStatDivider} />
                <View style={styles.liveStat}>
                  <Text style={styles.liveStatValue}>{formatCountdown(liveStats.elapsedSec)}</Text>
                  <Text style={styles.liveStatLabel}>TIME</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Start/Pause Button */}
        <TouchableOpacity 
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={toggleMetronome}
        >
          <Text style={styles.playButtonText}>
            {isPlaying ? 'PAUSE' : 'START'}
          </Text>
        </TouchableOpacity>

        {/* FORGE-013: voice coach — small toggle below Start, structured
            tabs AND Run tab (mile/km split announcements, Andy 10/10). Default ON,
            choice persisted. Real iOS Switch so on/off is unambiguous;
            centered between Start and the music note (24pt each side). */}
        <View style={styles.voiceToggle}>
          <Text style={styles.voiceToggleText}>VOICE COACH</Text>
          <Switch
            value={coachingEnabled}
            onValueChange={toggleCoaching}
            trackColor={{ false: '#E5E5E5', true: '#0A0A0A' }}
            ios_backgroundColor="#E5E5E5"
            accessibilityLabel="Voice coach"
          />
        </View>

        {/* End Workout Button — visible once a workout has started */}
        {workoutActive && (
          <TouchableOpacity 
            style={styles.endWorkoutButton}
            onPress={endWorkout}
          >
            <Text style={styles.endWorkoutButtonText}>END WORKOUT</Text>
          </TouchableOpacity>
        )}

        {/* FORGE-006: post-quick-start personalize nudge — inline, once per session */}
        {showPersonalizePrompt && (
          <TouchableOpacity
            style={styles.personalizePrompt}
            onPress={() => {
              setShowPersonalizePrompt(false);
              analytics.trackUserAction('navigation', { destination: 'Profile', source: 'quick_start_prompt' });
              navigation?.navigate('Profile', { source: 'quick_start_prompt' });
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.personalizePromptTitle}>PERSONALIZE YOUR CADENCE</Text>
            <Text style={styles.personalizePromptDesc}>Set up your profile (2 min) →</Text>
          </TouchableOpacity>
        )}

        {/* Spotify Music — Run tab only (FORGE-013): BPM matching targets
            steady runs; structured modes change tempo every phase. */}
        {runTab !== 'run' ? (
          <View style={styles.musicUnavailable}>
            <Text style={styles.musicUnavailableText}>
              Music sync works on steady runs.
            </Text>
          </View>
        ) : spotifyUnavailable ? (
          <View style={styles.musicUnavailable}>
            <Text style={styles.musicUnavailableText}>
              Spotify matching is in limited beta — coming to everyone soon.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.musicButton}
            onPress={() => setShowMusic(true)}
            activeOpacity={0.8}
          >
            <SFIcon name="music.note" size={22} style={{ marginRight: 12 }} />
            <View style={styles.musicButtonContent}>
              <Text style={styles.musicButtonText}>FIND MUSIC AT {cadence} BPM</Text>
              <Text style={styles.musicButtonDesc}>Build a Spotify playlist for your run</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Mode-Specific Configuration */}
        {mode === 'fartlek' && (
          <View
            style={[styles.configSection, workoutActive && styles.configLocked]}
            pointerEvents={workoutActive ? 'none' : 'auto'}
          >
            {workoutActive && (
              <Text style={styles.configLockedNote}>LOCKED DURING WORKOUT — END THE RUN TO CHANGE</Text>
            )}
            <Text style={styles.controlLabel}>FARTLEK CONFIGURATION</Text>
            
            <View style={styles.difficultySection}>
              <Text style={styles.configLabel}>Difficulty Level</Text>
              <View style={styles.difficultyButtons}>
                {[
                  // desc is generated from the engine's ranges — never retype it
                  { key: 'beginner', label: 'BEGINNER', desc: fartlekRangeLabel('beginner') },
                  { key: 'intermediate', label: 'INTERMEDIATE', desc: fartlekRangeLabel('intermediate') },
                  { key: 'advanced', label: 'ADVANCED', desc: fartlekRangeLabel('advanced') },
                  { key: 'elite', label: 'ELITE', desc: fartlekRangeLabel('elite') },
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
          <View
            style={[styles.configSection, workoutActive && styles.configLocked]}
            pointerEvents={workoutActive ? 'none' : 'auto'}
          >
            {workoutActive && (
              <Text style={styles.configLockedNote}>LOCKED DURING WORKOUT — END THE RUN TO CHANGE</Text>
            )}
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

        {/* Workout Status card merged into the live stats card (Andy 10/11). */}

        {/* FORGE-013: mode buttons replaced by the top tabs. */}
        <View style={styles.modeSection}>
          {/* Terrain cadence-adjustment toggle. FORGE-009: routes are now
              recorded on EVERY workout — this opt-in ONLY controls whether
              hills move the target cadence (default OFF: it conflicts with
              steady %-above-baseline retraining and is unvalidated). */}
          <TouchableOpacity
            style={[styles.terrainToggle, terrainEnabled && styles.terrainToggleActive]}
            onPress={() => setTerrainEnabled(!terrainEnabled)}
          >
            <Text style={[styles.terrainToggleText, terrainEnabled && styles.terrainToggleTextActive]}>
              {terrainEnabled ? 'ADJUST BEAT ON HILLS — ON' : 'ADJUST BEAT ON HILLS — OFF'}
            </Text>
            <Text style={[styles.terrainToggleDesc, terrainEnabled && styles.terrainToggleDescActive]}>
              Moves the target cadence with the grade
            </Text>
          </TouchableOpacity>
        </View>

        {/* Feeling indicator during workout */}
        {/* Feeling badge ("Good to Go" etc.) removed during workouts, Andy 10/11.
            The check-in answer still adjusts intensity/cadence. */}
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
        onNotAllowlisted={() => {
          setSpotifyUnavailable(true);
          setShowMusic(false);
        }}
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
    borderRadius: 8,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 28,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
  personalizePrompt: {
    borderRadius: 14,
    backgroundColor: '#F4F4F4',
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0A0A0A',
    borderLeftWidth: 4,
  },
  personalizePromptTitle: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 14,
    color: '#0A0A0A',
    letterSpacing: 1,
    marginBottom: 4,
  },
  personalizePromptDesc: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
  },
  controlLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
    marginBottom: 16,
    color: '#6B6B6B',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  modeSection: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  topTabs: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  topTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  topTabActive: {
    backgroundColor: '#000',
  },
  topTabDisabled: {
    opacity: 0.4,
  },
  topTabText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#666',
  },
  topTabTextActive: {
    color: '#FFF',
  },
  liveStats: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveHeader: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  livePhase: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    letterSpacing: 0.5,
    color: '#0A0A0A',
    textAlign: 'center',
  },
  liveIntensity: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#6B6B6B',
    marginTop: 4,
  },
  liveHeaderRule: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginTop: 12,
    marginBottom: 14,
    marginHorizontal: 6,
  },
  liveStatValueSm: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 24,
    color: '#0A0A0A',
    fontVariant: ['tabular-nums'],
  },
  liveProgress: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E5E5',
    marginTop: 14,
    marginHorizontal: 6,
    overflow: 'hidden',
  },
  liveProgressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0A0A0A',
  },
  liveStat: {
    flex: 1,
    alignItems: 'center',
  },
  liveStatValue: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 32,
    color: '#0A0A0A',
    fontVariant: ['tabular-nums'],
  },
  liveStatLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#6B6B6B',
    marginTop: 2,
  },
  liveStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#E5E5E5',
  },
  voiceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 0, // playButton already gives 24 above
    marginBottom: 24, // matches the 24 above -> centered
  },
  voiceToggleText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#0A0A0A',
    marginRight: 12,
  },
  configLocked: {
    opacity: 0.45,
  },
  configLockedNote: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#0A0A0A',
    textAlign: 'center',
    marginBottom: 12,
  },
  configSection: {
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  numberButton: {
    borderRadius: 20,
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
    borderRadius: 14,
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
  musicButton: {
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
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
  musicUnavailable: {
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  musicUnavailableText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  terrainToggle: {
    borderRadius: 14,
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
