// Workout Engine
// Handles advanced metronome modes including Fartlek, Intervals, Progressive, etc.

import { getRunnerProfile } from '../utils/storage';
import TerrainDetector from './TerrainDetector';

export class WorkoutEngine {
  constructor() {
    this.currentWorkout = null;
    this.isActive = false;
    this.currentPhase = 0;
    this.phaseStartTime = null;
    this.workoutStartTime = null;
    this.callbacks = {
      onPhaseChange: null,
      onCadenceChange: null,
      onWorkoutComplete: null,
      onCoachingCue: null,
    };
    this.stats = {
      totalTime: 0,
      phasesCompleted: 0,
      cadenceChanges: 0,
      averageCompliance: 0,
    };
    this.isPaused = false;
    this.phaseTimeRemaining = 0;
    this.phaseTimer = null;
    this.cueTimers = [];
  }

  /**
   * Start a Fartlek workout
   * @param {Object} config - Fartlek configuration
   */
  async startFartlek(config = {}) {
    const profile = await getRunnerProfile();
    const fartlekConfig = {
      duration: config.duration || 1800, // 30 minutes default
      difficulty: config.difficulty || 'intermediate', // beginner, intermediate, advanced, elite
      baseCadence: config.baseCadence || this.getBaseCadence(profile),
      terrainAware: config.terrainAware !== false,
      coachingEnabled: config.coachingEnabled !== false,
      ...config
    };

    const workout = this.generateFartlekWorkout(fartlekConfig, profile);
    await this.startWorkout(workout);
  }

  /**
   * Start an Interval workout
   * @param {Object} config - Interval configuration
   */
  async startInterval(config = {}) {
    const profile = await getRunnerProfile();
    const intervalConfig = {
      workDuration: config.workDuration || 240, // 4 minutes default
      restDuration: config.restDuration || 120, // 2 minutes default
      intervals: config.intervals || 4, // 4 intervals default
      workCadence: config.workCadence || this.getBaseCadence(profile) + 15,
      restCadence: config.restCadence || this.getBaseCadence(profile) - 10,
      warmupDuration: config.warmupDuration || 300, // 5 minutes
      cooldownDuration: config.cooldownDuration || 300, // 5 minutes
      terrainAware: config.terrainAware !== false,
      coachingEnabled: config.coachingEnabled !== false,
      ...config
    };

    const workout = this.generateIntervalWorkout(intervalConfig, profile);
    await this.startWorkout(workout);
  }

  /**
   * Start a Progressive workout
   * @param {Object} config - Progressive configuration
   */
  async startProgressive(config = {}) {
    const profile = await getRunnerProfile();
    const progressiveConfig = {
      duration: config.duration || 1800, // 30 minutes default
      startCadence: config.startCadence || this.getBaseCadence(profile) - 10,
      endCadence: config.endCadence || this.getBaseCadence(profile) + 20,
      progressionType: config.progressionType || 'linear', // linear, exponential, stepped
      stepDuration: config.stepDuration || 300, // 5 minutes per step
      terrainAware: config.terrainAware !== false,
      coachingEnabled: config.coachingEnabled !== false,
      ...config
    };

    const workout = this.generateProgressiveWorkout(progressiveConfig, profile);
    await this.startWorkout(workout);
  }

  /**
   * Generate a dynamic Fartlek workout
   * @param {Object} config - Configuration
   * @param {Object} profile - Runner profile
   * @returns {Object} Generated workout
   */
  generateFartlekWorkout(config, profile) {
    const { duration, difficulty, baseCadence, terrainAware, coachingEnabled } = config;
    
    // Difficulty settings
    const difficultySettings = {
      beginner: {
        cadenceRange: [-10, +15], // -10 to +15 SPM from base
        intervalRange: [45, 180], // 45s to 3min intervals
        changeFrequency: 0.3, // 30% chance of change per interval
        maxConsecutiveHard: 2,
      },
      intermediate: {
        cadenceRange: [-15, +20],
        intervalRange: [30, 240],
        changeFrequency: 0.4,
        maxConsecutiveHard: 3,
      },
      advanced: {
        cadenceRange: [-20, +25],
        intervalRange: [20, 300],
        changeFrequency: 0.5,
        maxConsecutiveHard: 4,
      },
      elite: {
        cadenceRange: [-25, +30],
        intervalRange: [15, 360],
        changeFrequency: 0.6,
        maxConsecutiveHard: 5,
      }
    };

    const settings = difficultySettings[difficulty];
    const phases = [];
    let currentTime = 0;
    let consecutiveHard = 0;
    let lastCadence = baseCadence;

    // Warmup phase — duration scales with difficulty
    const warmupDurations = { beginner: 300, intermediate: 240, advanced: 180, elite: 120 };
    const warmupDuration = warmupDurations[difficulty] || 240;
    const warmupCadence = Math.round(baseCadence - 10);

    phases.push({
      id: 0,
      cadence: warmupCadence,
      duration: warmupDuration,
      intensity: 'warmup',
      type: 'fartlek',
      coachingCues: coachingEnabled ? [
        { timing: 0, message: `Starting your fartlek workout. ${Math.round(warmupDuration / 60)} minute warmup at ${warmupCadence}. Find your rhythm.`, type: 'instruction', priority: 'urgent' },
        { timing: 0.85, message: `Warmup almost done. Get ready for speed play.`, type: 'guidance' },
      ] : [],
      terrainAdjustment: terrainAware,
    });
    currentTime += warmupDuration;

    // Generate random phases until we reach target duration
    while (currentTime < duration) {
      const remainingTime = duration - currentTime;
      const maxInterval = Math.min(settings.intervalRange[1], remainingTime);
      const intervalDuration = Math.random() * (maxInterval - settings.intervalRange[0]) + settings.intervalRange[0];
      
      // Decide if this should be a cadence change
      const shouldChange = Math.random() < settings.changeFrequency;
      let newCadence = lastCadence;
      let intensity = 'base';

      if (shouldChange) {
        const cadenceChange = Math.random() * (settings.cadenceRange[1] - settings.cadenceRange[0]) + settings.cadenceRange[0];
        newCadence = Math.round(baseCadence + cadenceChange);
        
        // Ensure reasonable bounds
        newCadence = Math.max(150, Math.min(200, newCadence));
        
        // Determine intensity
        if (newCadence > baseCadence + 10) {
          intensity = 'hard';
          consecutiveHard++;
        } else if (newCadence < baseCadence - 5) {
          intensity = 'easy';
          consecutiveHard = 0;
        } else {
          intensity = 'moderate';
          consecutiveHard = 0;
        }

        // Prevent too many consecutive hard intervals
        if (intensity === 'hard' && consecutiveHard > settings.maxConsecutiveHard) {
          newCadence = baseCadence - 5; // Force an easy interval
          intensity = 'easy';
          consecutiveHard = 0;
        }
      }

      phases.push({
        id: phases.length,
        cadence: Math.round(newCadence),
        duration: Math.round(intervalDuration),
        intensity,
        type: 'fartlek',
        coachingCues: this.generateCoachingCues(newCadence, lastCadence, intensity, coachingEnabled),
        terrainAdjustment: terrainAware,
      });

      currentTime += intervalDuration;
      lastCadence = newCadence;
    }

    // Cooldown phase
    const cooldownDuration = warmupDuration;
    phases.push({
      id: phases.length,
      cadence: warmupCadence,
      duration: cooldownDuration,
      intensity: 'cooldown',
      type: 'fartlek',
      coachingCues: coachingEnabled ? [
        { timing: 0.01, message: `Cool down. Bring it back to ${warmupCadence}. Nice work.`, type: 'guidance' },
      ] : [],
      terrainAdjustment: terrainAware,
    });
    currentTime += cooldownDuration;

    return {
      id: `fartlek_${Date.now()}`,
      name: `Fartlek ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`,
      type: 'fartlek',
      difficulty,
      duration: Math.round(currentTime),
      baseCadence,
      phases,
      config,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a structured Interval workout
   * @param {Object} config - Configuration
   * @param {Object} profile - Runner profile
   * @returns {Object} Generated workout
   */
  generateIntervalWorkout(config, profile) {
    const { workDuration, restDuration, intervals, workCadence, restCadence, warmupDuration, cooldownDuration, coachingEnabled } = config;
    
    const phases = [];
    let currentTime = 0;

    // Warmup phase
    phases.push({
      id: phases.length,
      cadence: Math.round(restCadence - 5),
      duration: warmupDuration,
      intensity: 'warmup',
      type: 'interval',
      coachingCues: this.generateIntervalCoachingCues('warmup', restCadence - 5, 0, coachingEnabled),
      terrainAdjustment: config.terrainAware,
    });
    currentTime += warmupDuration;

    // Main interval phases
    for (let i = 0; i < intervals; i++) {
      // Work interval
      phases.push({
        id: phases.length,
        cadence: Math.round(workCadence),
        duration: workDuration,
        intensity: 'work',
        type: 'interval',
        intervalNumber: i + 1,
        totalIntervals: intervals,
        coachingCues: this.generateIntervalCoachingCues('work', workCadence, i + 1, coachingEnabled, intervals),
        terrainAdjustment: config.terrainAware,
      });
      currentTime += workDuration;

      // Rest interval (except after last work interval)
      if (i < intervals - 1) {
        phases.push({
          id: phases.length,
          cadence: Math.round(restCadence),
          duration: restDuration,
          intensity: 'rest',
          type: 'interval',
          intervalNumber: i + 1,
          totalIntervals: intervals,
          coachingCues: this.generateIntervalCoachingCues('rest', restCadence, i + 1, coachingEnabled, intervals),
          terrainAdjustment: config.terrainAware,
        });
        currentTime += restDuration;
      }
    }

    // Cooldown phase
    phases.push({
      id: phases.length,
      cadence: Math.round(restCadence - 5),
      duration: cooldownDuration,
      intensity: 'cooldown',
      type: 'interval',
      coachingCues: this.generateIntervalCoachingCues('cooldown', restCadence - 5, 0, coachingEnabled),
      terrainAdjustment: config.terrainAware,
    });
    currentTime += cooldownDuration;

    return {
      id: `interval_${Date.now()}`,
      name: `${intervals}x${Math.round(workDuration/60)}:${Math.round(restDuration/60)} Intervals`,
      type: 'interval',
      duration: Math.round(currentTime),
      workCadence,
      restCadence,
      intervals,
      phases,
      config,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a Progressive workout
   * @param {Object} config - Configuration
   * @param {Object} profile - Runner profile
   * @returns {Object} Generated workout
   */
  generateProgressiveWorkout(config, profile) {
    const { duration, startCadence, endCadence, progressionType, stepDuration, coachingEnabled } = config;
    
    const phases = [];
    let currentTime = 0;
    const totalSteps = Math.floor(duration / stepDuration);
    const cadenceRange = endCadence - startCadence;

    // Warmup phase
    const warmupDuration = 180; // 3 minutes
    phases.push({
      id: 0,
      cadence: Math.round(startCadence - 5),
      duration: warmupDuration,
      intensity: 'warmup',
      type: 'progressive',
      step: 0,
      totalSteps,
      progress: 0,
      coachingCues: coachingEnabled ? [
        { timing: 0, message: `Starting your progressive workout. Building from ${startCadence} to ${endCadence} over ${Math.round(duration / 60)} minutes. Warming up now.`, type: 'instruction', priority: 'urgent' },
        { timing: 0.85, message: `Warmup done. Starting the build.`, type: 'guidance' },
      ] : [],
      terrainAdjustment: config.terrainAware,
    });
    currentTime += warmupDuration;

    for (let step = 0; step < totalSteps; step++) {
      let stepCadence;
      
      // Calculate cadence based on progression type
      switch (progressionType) {
        case 'exponential':
          // Exponential progression (slow start, fast finish)
          const expProgress = Math.pow(step / (totalSteps - 1), 2);
          stepCadence = startCadence + (cadenceRange * expProgress);
          break;
        case 'stepped':
          // Stepped progression (discrete jumps every few steps)
          const stepsPerJump = Math.max(1, Math.floor(totalSteps / 4));
          const jumpNumber = Math.floor(step / stepsPerJump);
          stepCadence = startCadence + (cadenceRange * jumpNumber / 3);
          break;
        case 'linear':
        default:
          // Linear progression
          stepCadence = startCadence + (cadenceRange * step / (totalSteps - 1));
          break;
      }

      const remainingTime = duration - currentTime;
      const phaseDuration = Math.min(stepDuration, remainingTime);
      
      if (phaseDuration <= 0) break;

      // Determine intensity based on cadence relative to range
      const progress = (stepCadence - startCadence) / cadenceRange;
      let intensity;
      if (progress < 0.3) intensity = 'easy';
      else if (progress < 0.7) intensity = 'moderate';
      else intensity = 'hard';

      phases.push({
        id: phases.length,
        cadence: Math.round(stepCadence),
        duration: Math.round(phaseDuration),
        intensity,
        type: 'progressive',
        step: step + 1,
        totalSteps,
        progress: progress,
        coachingCues: this.generateProgressiveCoachingCues(stepCadence, step + 1, totalSteps, intensity, coachingEnabled),
        terrainAdjustment: config.terrainAware,
      });

      currentTime += phaseDuration;
    }

    // Cooldown phase
    const cooldownDuration = 180;
    phases.push({
      id: phases.length,
      cadence: Math.round(startCadence - 5),
      duration: cooldownDuration,
      intensity: 'cooldown',
      type: 'progressive',
      step: totalSteps + 1,
      totalSteps,
      progress: 1,
      coachingCues: coachingEnabled ? [
        { timing: 0.01, message: `Cool down. Bring it back easy. Great build.`, type: 'guidance' },
      ] : [],
      terrainAdjustment: config.terrainAware,
    });
    currentTime += cooldownDuration;

    return {
      id: `progressive_${Date.now()}`,
      name: `Progressive ${Math.round(duration/60)}min (${startCadence}→${endCadence} SPM)`,
      type: 'progressive',
      duration: Math.round(currentTime),
      startCadence,
      endCadence,
      progressionType,
      phases,
      config,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generate coaching cues for a phase
   * @param {number} newCadence - Target cadence
   * @param {number} lastCadence - Previous cadence
   * @param {string} intensity - Phase intensity
   * @param {boolean} enabled - Whether coaching is enabled
   * @returns {Array} Array of coaching cues
   */
  generateCoachingCues(newCadence, lastCadence, intensity, enabled) {
    if (!enabled) return [];

    const cues = [];
    const cadenceChange = newCadence - lastCadence;

    // Always announce the phase — no silent transitions
    if (intensity === 'hard' || cadenceChange > 10) {
      cues.push({
        timing: 0,
        message: `Pick it up to ${newCadence} steps per minute`,
        type: 'motivation',
        priority: 'high'
      });
    } else if (intensity === 'easy' || cadenceChange < -5) {
      cues.push({
        timing: 0,
        message: `Easy pace. ${newCadence} steps per minute`,
        type: 'guidance',
        priority: 'medium'
      });
    } else if (Math.abs(cadenceChange) > 2) {
      cues.push({
        timing: 0,
        message: `${cadenceChange > 0 ? 'Up' : 'Down'} to ${newCadence} steps per minute`,
        type: 'instruction',
        priority: 'medium'
      });
    } else {
      cues.push({
        timing: 0,
        message: `Hold your pace. ${newCadence} steps per minute`,
        type: 'instruction',
        priority: 'low'
      });
    }

    // Mid-phase cue for hard intervals
    if (intensity === 'hard') {
      cues.push({
        timing: 0.7,
        message: 'Stay strong, almost there',
        type: 'motivation',
        priority: 'medium'
      });
    }

    return cues;
  }

  /**
   * Generate coaching cues for interval phases
   * @param {string} phaseType - Phase type (warmup, work, rest, cooldown)
   * @param {number} cadence - Target cadence
   * @param {number} intervalNumber - Current interval number
   * @param {boolean} enabled - Whether coaching is enabled
   * @param {number} totalIntervals - Total number of intervals
   * @returns {Array} Array of coaching cues
   */
  generateIntervalCoachingCues(phaseType, cadence, intervalNumber, enabled, totalIntervals = 0) {
    if (!enabled) return [];

    const cues = [];

    switch (phaseType) {
      case 'warmup':
        cues.push({
          timing: 0,
          message: `Starting your interval workout. ${totalIntervals} intervals ahead. Warming up at ${cadence} steps per minute.`,
          type: 'instruction',
          priority: 'urgent'
        });
        cues.push({
          timing: 0.85,
          message: 'Warmup almost done. First interval coming up.',
          type: 'guidance',
          priority: 'medium'
        });
        break;

      case 'work':
        cues.push({
          timing: 0,
          message: `Interval ${intervalNumber} of ${totalIntervals}. ${cadence} steps per minute`,
          type: 'motivation',
          priority: 'high'
        });
        cues.push({
          timing: 0.8,
          message: 'Almost there',
          type: 'motivation',
          priority: 'medium'
        });
        break;

      case 'rest':
        cues.push({
          timing: 0,
          message: `Recovery. Easy ${cadence} steps per minute`,
          type: 'guidance',
          priority: 'medium'
        });
        break;

      case 'cooldown':
        cues.push({
          timing: 0,
          message: `Cooldown. Nice work`,
          type: 'motivation',
          priority: 'high'
        });
        break;
    }

    return cues;
  }

  /**
   * Generate coaching cues for progressive phases
   * @param {number} cadence - Target cadence
   * @param {number} step - Current step number
   * @param {number} totalSteps - Total number of steps
   * @param {string} intensity - Phase intensity
   * @param {boolean} enabled - Whether coaching is enabled
   * @returns {Array} Array of coaching cues
   */
  generateProgressiveCoachingCues(cadence, step, totalSteps, intensity, enabled) {
    if (!enabled) return [];

    const cues = [];

    // One cue at phase start
    if (step === 1) {
      cues.push({
        timing: 0,
        message: `Starting at ${cadence} steps per minute. Building up gradually`,
        type: 'instruction',
        priority: 'high'
      });
    } else if (step === totalSteps) {
      cues.push({
        timing: 0,
        message: `Final stage. ${cadence} steps per minute. Finish strong`,
        type: 'motivation',
        priority: 'high'
      });
    } else {
      cues.push({
        timing: 0,
        message: `Step ${step} of ${totalSteps}. ${cadence} steps per minute`,
        type: 'instruction',
        priority: 'medium'
      });
    }

    return cues;
  }

  /**
   * Start a workout
   * @param {Object} workout - Workout definition
   */
  async startWorkout(workout) {
    this.currentWorkout = workout;
    this.isActive = true;
    this.currentPhase = 0;
    this.workoutStartTime = Date.now();
    this.phaseStartTime = Date.now();
    this.stats = {
      totalTime: 0,
      phasesCompleted: 0,
      cadenceChanges: 0,
      averageCompliance: 0,
    };

    // Start first phase
    await this.startPhase(0);
  }

  /**
   * Start a specific phase
   * @param {number} phaseIndex - Phase index
   */
  async startPhase(phaseIndex) {
    
    if (!this.currentWorkout || phaseIndex >= this.currentWorkout.phases.length) {
      return this.completeWorkout();
    }

    const phase = this.currentWorkout.phases[phaseIndex];
    const previousPhase = phaseIndex > 0 ? this.currentWorkout.phases[phaseIndex - 1] : null;
    this.currentPhase = phaseIndex;
    this.phaseStartTime = Date.now();

    // Apply terrain adjustment if enabled
    let adjustedCadence = phase.cadence;
    if (phase.terrainAdjustment) {
      const terrainAdjustment = this.getTerrainAdjustment();
      adjustedCadence = Math.round(phase.cadence + terrainAdjustment);
      adjustedCadence = Math.max(150, Math.min(200, adjustedCadence));
    }

    // Notify callbacks
    if (this.callbacks.onPhaseChange) {
      try {
        this.callbacks.onPhaseChange(phase, phaseIndex, this.currentWorkout.phases.length);
      } catch (error) {
        // Phase change callback failed
      }
    }

    // ALWAYS call onCadenceChange for first phase, then check for changes
    const previousCadence = previousPhase ? previousPhase.cadence : null;
    const shouldCallCadenceChange = phaseIndex === 0 || adjustedCadence !== previousCadence;
    
    if (this.callbacks.onCadenceChange && shouldCallCadenceChange) {
      try {
        this.callbacks.onCadenceChange(adjustedCadence, phase.cadence);
      } catch (error) {
        // Cadence change callback failed
      }
    }

    // Schedule coaching cues
    this.scheduleCoachingCues(phase);

    // Schedule next phase
    this.phaseTimeRemaining = phase.duration * 1000;
    this.phaseTimer = setTimeout(() => {
      if (this.isActive && !this.isPaused) {
        this.stats.phasesCompleted++;
        this.stats.cadenceChanges++;
        this.startPhase(phaseIndex + 1);
      }
    }, phase.duration * 1000);
  }

  /**
   * Schedule coaching cues for a phase
   * @param {Object} phase - Phase definition
   */
  scheduleCoachingCues(phase) {
    if (!phase.coachingCues || !this.callbacks.onCoachingCue) {
      return;
    }

    this.cueTimers = [];
    phase.coachingCues.forEach((cue) => {
      const delay = cue.timing * phase.duration * 1000;
      
      if (delay <= 50) {
        // Fire immediately for timing 0 cues
        if (this.isActive && !this.isPaused && this.callbacks.onCoachingCue) {
          try {
            this.callbacks.onCoachingCue(cue.message, cue.type);
          } catch (error) {
            // Coaching cue callback failed
          }
        }
      } else {
        const timer = setTimeout(() => {
          if (this.isActive && !this.isPaused && this.callbacks.onCoachingCue) {
            try {
              this.callbacks.onCoachingCue(cue.message, cue.type);
            } catch (error) {
              // Coaching cue callback failed
            }
          }
        }, delay);
        this.cueTimers.push(timer);
      }
    });
  }

  /**
   * Get terrain-based cadence adjustment
   * @returns {number} Adjustment in SPM
   */
  getTerrainAdjustment() {
    try {
      const terrainData = TerrainDetector.currentTerrain;
      if (!terrainData || !terrainData.grade) return 0;

      const grade = terrainData.grade;
      
      // Fartlek-specific terrain adjustments (more aggressive than normal)
      if (grade > 3) {
        return Math.min(8, grade * 2); // Uphill: +2 SPM per % grade, max +8
      } else if (grade < -3) {
        return Math.max(-5, grade * 1.5); // Downhill: -1.5 SPM per % grade, max -5
      }
      
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get base cadence from profile or default
   * @param {Object} profile - Runner profile
   * @returns {number} Base cadence
   */
  getBaseCadence(profile) {
    if (profile?.currentCadence) {
      const cadence = parseInt(profile.currentCadence);
      if (cadence >= 150 && cadence <= 200) {
        return cadence;
      }
    }

    // Default based on experience level
    const experienceDefaults = {
      beginner: 165,
      intermediate: 172,
      advanced: 178,
      elite: 182,
    };

    return experienceDefaults[profile?.experience] || 172;
  }

  /**
   * Pause the current workout
   */
  pauseWorkout() {
    if (!this.isActive || this.isPaused) return;
    this.isPaused = true;

    // Calculate remaining time in current phase
    const phaseElapsed = Date.now() - this.phaseStartTime;
    const currentPhase = this.currentWorkout.phases[this.currentPhase];
    this.phaseTimeRemaining = Math.max(0, (currentPhase.duration * 1000) - phaseElapsed);

    // Clear all timers
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.cueTimers.forEach(t => clearTimeout(t));
    this.cueTimers = [];
  }

  /**
   * Resume the current workout
   */
  resumeWorkout() {
    if (!this.isActive || !this.isPaused) return;
    this.isPaused = false;
    this.phaseStartTime = Date.now() - ((this.currentWorkout.phases[this.currentPhase].duration * 1000) - this.phaseTimeRemaining);

    // Reschedule phase transition with remaining time
    this.phaseTimer = setTimeout(() => {
      if (this.isActive && !this.isPaused) {
        this.stats.phasesCompleted++;
        this.stats.cadenceChanges++;
        this.startPhase(this.currentPhase + 1);
      }
    }, this.phaseTimeRemaining);
  }

  /**
   * Stop the current workout
   */
  stopWorkout() {
    if (!this.isActive) return;

    this.isActive = false;
    this.isPaused = false;
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.cueTimers.forEach(t => clearTimeout(t));
    this.cueTimers = [];
    this.stats.totalTime = Date.now() - this.workoutStartTime;
    
    if (this.callbacks.onWorkoutComplete) {
      this.callbacks.onWorkoutComplete(this.currentWorkout, this.stats, false);
    }
  }

  /**
   * Complete the current workout
   */
  completeWorkout() {
    if (!this.isActive) return;

    this.isActive = false;
    this.stats.totalTime = Date.now() - this.workoutStartTime;
    this.stats.completed = true;
    
    if (this.callbacks.onWorkoutComplete) {
      this.callbacks.onWorkoutComplete(this.currentWorkout, this.stats, true);
    }
  }

  /**
   * Get current workout status
   * @returns {Object} Current status
   */
  getStatus() {
    if (!this.isActive || !this.currentWorkout) {
      return { active: false, paused: false };
    }

    const currentPhase = this.currentWorkout.phases[this.currentPhase];
    const phaseElapsed = this.isPaused
      ? (currentPhase.duration * 1000 - this.phaseTimeRemaining) / 1000
      : (Date.now() - this.phaseStartTime) / 1000;
    const phaseProgress = Math.min(1, phaseElapsed / currentPhase.duration);
    const workoutElapsed = (Date.now() - this.workoutStartTime) / 1000;
    const workoutProgress = Math.min(1, workoutElapsed / this.currentWorkout.duration);

    return {
      active: true,
      paused: this.isPaused,
      workout: this.currentWorkout,
      currentPhase: this.currentPhase,
      phase: currentPhase,
      phaseProgress,
      workoutProgress,
      stats: this.stats,
      timeRemaining: Math.max(0, this.currentWorkout.duration - workoutElapsed),
      phaseTimeRemaining: Math.max(0, currentPhase.duration - phaseElapsed),
    };
  }

  /**
   * Set callback functions
   * @param {Object} callbacks - Callback functions
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Generate workout summary for analytics
   * @returns {Object} Workout summary
   */
  generateWorkoutSummary() {
    if (!this.currentWorkout) return null;

    return {
      workoutId: this.currentWorkout.id,
      type: this.currentWorkout.type,
      difficulty: this.currentWorkout.difficulty,
      duration: this.stats.totalTime / 1000,
      phasesCompleted: this.stats.phasesCompleted,
      totalPhases: this.currentWorkout.phases.length,
      cadenceChanges: this.stats.cadenceChanges,
      completed: this.stats.completed || false,
      createdAt: new Date().toISOString(),
    };
  }
}

// Singleton instance
export default new WorkoutEngine();