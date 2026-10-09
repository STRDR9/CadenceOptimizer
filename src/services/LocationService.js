// Location Service
// Handles GPS tracking and location updates
//
// FORGE-009b: route recording must survive the screen locking (phone in a
// pocket is the NORMAL case). `watchPositionAsync` is foreground-only — iOS
// stops delivering once the app backgrounds, even with the `location`
// background mode present. The background-capable path is a TaskManager task
// + `Location.startLocationUpdatesAsync`, which on iOS needs only When-In-Use
// permission when started in the foreground (verified in expo-location's
// LocationModule.swift: it checks foreground permission + the background
// mode, and sets allowsBackgroundLocationUpdates). The blue system indicator
// is shown via showsBackgroundLocationIndicator. If that path fails for any
// reason we fall back to the old foreground watcher rather than not tracking
// at all, and report which mode ran (tracking_quality).

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

// Task name is module-scoped; defineTask MUST run at module load (this file
// is imported on app start via MetronomeScreen's import chain).
export const ROUTE_LOCATION_TASK = 'strdr-route-location';

export class LocationService {
  constructor() {
    this.isTracking = false;
    this.subscription = null;
    this.currentLocation = null;
    this.locationHistory = [];
    this.maxHistorySize = 10; // Keep last 10 points for smoothing
    this.onLocationUpdate = null;
    this.trackingMode = null; // 'background' | 'foreground' | null
  }

  /**
   * Request location permissions
   * @returns {boolean} Whether permission was granted
   */
  async requestPermissions() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  /**
   * Start tracking location
   * @param {Function} callback - Called with location updates
   * @param {Object} [options]
   * @param {number} [options.timeInterval=5000] - ms between updates. 5 s is
   *   the battery-friendly default for route recording (FORGE-009); terrain
   *   adjustment passes 2000 for responsiveness, as before.
   * @param {number} [options.distanceInterval=5] - meters between updates.
   */
  async startTracking(callback, { timeInterval = 5000, distanceInterval = 5 } = {}) {
    if (this.isTracking) {
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    this.onLocationUpdate = callback;
    this.isTracking = true;
    this.locationHistory = [];

    // Preferred: background-capable updates via the TaskManager task.
    try {
      await Location.startLocationUpdatesAsync(ROUTE_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        activityType: Location.ActivityType.Fitness,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        timeInterval, // Android-only; iOS paces via distance + deferral
        distanceInterval,
        deferredUpdatesInterval: timeInterval,
      });
      this.trackingMode = 'background';
      return;
    } catch (error) {
      // Fall through to the foreground watcher (e.g. background mode
      // missing in a dev build, or the task module unavailable).
      console.error('Background location updates unavailable, falling back:', error);
    }

    try {
      // Fallback: foreground-only watcher (pre-009b behavior).
      this.subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval,
          distanceInterval,
        },
        (location) => {
          this.handleLocationUpdate(location);
        }
      );
      this.trackingMode = 'foreground';
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.isTracking = false;
      this.trackingMode = null;
      throw error;
    }
  }

  /**
   * Entry point for the background task (FORGE-009b): deliveries may arrive
   * batched (deferred updates), so feed each location through the same
   * pipeline the foreground watcher used.
   */
  handleBackgroundLocations(locations) {
    if (!this.isTracking || !Array.isArray(locations)) return;
    for (const location of locations) {
      this.handleLocationUpdate(location);
    }
  }

  /**
   * Handle location update
   * @param {Object} location - Location object from expo-location
   */
  handleLocationUpdate(location) {
    const locationData = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude || 0,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed || 0,
      timestamp: location.timestamp,
    };

    this.currentLocation = locationData;
    
    // Add to history
    this.locationHistory.push(locationData);
    
    // Keep only recent history
    if (this.locationHistory.length > this.maxHistorySize) {
      this.locationHistory.shift();
    }

    // Call callback with location data
    if (this.onLocationUpdate) {
      this.onLocationUpdate(locationData, this.locationHistory);
    }
  }

  /**
   * Stop tracking location
   */
  async stopTracking() {
    if (!this.isTracking) {
      return;
    }

    if (this.trackingMode === 'background') {
      try {
        if (await Location.hasStartedLocationUpdatesAsync(ROUTE_LOCATION_TASK)) {
          await Location.stopLocationUpdatesAsync(ROUTE_LOCATION_TASK);
        }
      } catch (error) {
        console.error('Error stopping background location updates:', error);
      }
    }

    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    this.isTracking = false;
    this.trackingMode = null;
    this.onLocationUpdate = null;
  }

  /**
   * FORGE-009b: permission level for tracking_quality analytics.
   * @returns {'always'|'whenInUse'|'denied'}
   */
  async getPermissionLevel() {
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg?.status === 'granted') return 'always';
      const fg = await Location.getForegroundPermissionsAsync();
      return fg?.status === 'granted' ? 'whenInUse' : 'denied';
    } catch (_error) {
      return 'denied';
    }
  }

  /**
   * Get current location (one-time)
   * @returns {Object} Current location
   */
  async getCurrentLocation() {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude || 0,
        accuracy: location.coords.accuracy,
        speed: location.coords.speed || 0,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      throw error;
    }
  }

  /**
   * Get smoothed elevation from recent history
   * @returns {number} Smoothed elevation in meters
   */
  getSmoothedElevation() {
    if (this.locationHistory.length === 0) {
      return 0;
    }

    // Use last 5 points for smoothing
    const recentPoints = this.locationHistory.slice(-5);
    const elevations = recentPoints.map(p => p.altitude);
    const sum = elevations.reduce((a, b) => a + b, 0);
    return sum / elevations.length;
  }

  /**
   * Get tracking state
   * @returns {Object} Current tracking state
   */
  getState() {
    return {
      isTracking: this.isTracking,
      currentLocation: this.currentLocation,
      historySize: this.locationHistory.length,
    };
  }

  /**
   * Clear location history
   */
  clearHistory() {
    this.locationHistory = [];
  }
}

// Singleton instance
const locationService = new LocationService();

// FORGE-009b: background location task — defined at module load, before any
// start. Receives { data: { locations }, error } even while the app is
// backgrounded/locked (the metronome's audio session keeps JS alive).
TaskManager.defineTask(ROUTE_LOCATION_TASK, ({ data, error }) => {
  if (error || !data) return;
  locationService.handleBackgroundLocations(data.locations || []);
});

export default locationService;
