// Storage utility for persisting data
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  RUNNER_PROFILE: '@runner_profile',
  ANALYSIS_HISTORY: '@analysis_history',
  PREFERENCES: '@preferences',
  WORKOUT_HISTORY: '@workout_history',
};

/**
 * Save runner profile
 * @param {Object} profile - Runner profile data
 */
export const saveRunnerProfile = async (profile) => {
  try {
    await AsyncStorage.setItem(KEYS.RUNNER_PROFILE, JSON.stringify(profile));
    return true;
  } catch (error) {
    console.error('Error saving runner profile:', error);
    return false;
  }
};

/**
 * Get runner profile
 * @returns {Object|null} Runner profile or null
 */
export const getRunnerProfile = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.RUNNER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting runner profile:', error);
    return null;
  }
};

/**
 * Save analysis result
 * @param {Object} analysis - Analysis result
 */
export const saveAnalysis = async (analysis) => {
  try {
    const history = await getAnalysisHistory();
    const updated = [
      { ...analysis, timestamp: Date.now() },
      ...history.slice(0, 19), // Keep last 20
    ];
    await AsyncStorage.setItem(KEYS.ANALYSIS_HISTORY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Error saving analysis:', error);
    return false;
  }
};

/**
 * Get analysis history
 * @returns {Array} Array of past analyses
 */
export const getAnalysisHistory = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.ANALYSIS_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting analysis history:', error);
    return [];
  }
};

/**
 * Save app preferences
 * @param {Object} preferences - User preferences
 */
export const savePreferences = async (preferences) => {
  try {
    await AsyncStorage.setItem(KEYS.PREFERENCES, JSON.stringify(preferences));
    return true;
  } catch (error) {
    console.error('Error saving preferences:', error);
    return false;
  }
};

/**
 * Get app preferences
 * @returns {Object} User preferences
 */
export const getPreferences = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.PREFERENCES);
    return data ? JSON.parse(data) : {
      soundType: 'click',
      volume: 0.8,
      units: 'metric',
    };
  } catch (error) {
    console.error('Error getting preferences:', error);
    return {
      soundType: 'click',
      volume: 0.8,
      units: 'metric',
    };
  }
};


/**
 * Save a completed workout to history
 * @param {Object} workout - Workout summary data
 */
export const saveWorkoutToHistory = async (workout) => {
  try {
    const history = await getWorkoutHistory();
    const updated = [
      { ...workout, id: Date.now().toString(36), savedAt: new Date().toISOString() },
      ...history.slice(0, 99), // Keep last 100
    ];
    await AsyncStorage.setItem(KEYS.WORKOUT_HISTORY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Error saving workout:', error);
    return false;
  }
};

/**
 * Get workout history
 * @returns {Array} Array of past workouts
 */
export const getWorkoutHistory = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.WORKOUT_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting workout history:', error);
    return [];
  }
};
