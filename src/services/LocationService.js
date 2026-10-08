// Location Service
// Handles GPS tracking and location updates

import * as Location from 'expo-location';

export class LocationService {
  constructor() {
    this.isTracking = false;
    this.subscription = null;
    this.currentLocation = null;
    this.locationHistory = [];
    this.maxHistorySize = 10; // Keep last 10 points for smoothing
    this.onLocationUpdate = null;
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

    try {
      // Start watching location with high accuracy
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

    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.isTracking = false;
      throw error;
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

    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    this.isTracking = false;
    this.onLocationUpdate = null;
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
export default new LocationService();
