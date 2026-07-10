// Terrain Detector Service
// Detects terrain changes using GPS elevation data and provides real-time cadence adjustments

export class TerrainDetector {
  constructor() {
    this.recentGrades = [];
    this.maxGradeHistory = 5; // Keep last 5 grade calculations for smoothing
    this.currentTerrain = 'flat';
    this.currentGrade = 0;
  }

  /**
   * Process new GPS location and detect terrain
   * @param {Object} currentLocation - Current GPS location
   * @param {Array} locationHistory - Recent location history
   * @returns {Object} Terrain analysis result
   */
  processLocation(currentLocation, locationHistory) {
    if (!currentLocation || locationHistory.length < 2) {
      return {
        terrain: 'flat',
        grade: 0,
        cadenceAdjustment: 0,
        confidence: 'low',
      };
    }

    // Get previous location for comparison
    const previousLocation = locationHistory[locationHistory.length - 2];
    
    // Calculate distance and elevation change
    const distance = this.calculateDistance(previousLocation, currentLocation);
    const elevationChange = currentLocation.altitude - previousLocation.altitude;
    
    // Skip if distance is too small (GPS noise)
    if (distance < 3) {
      return {
        terrain: this.currentTerrain,
        grade: this.currentGrade,
        cadenceAdjustment: 0,
        confidence: 'low',
      };
    }

    // Calculate grade
    const grade = this.calculateGrade(elevationChange, distance);
    
    // Add to grade history for smoothing
    this.recentGrades.push(grade);
    if (this.recentGrades.length > this.maxGradeHistory) {
      this.recentGrades.shift();
    }

    // Get smoothed grade
    const smoothedGrade = this.getSmoothedGrade();
    
    // Classify terrain
    const terrain = this.classifyTerrain(smoothedGrade);
    
    // Calculate cadence adjustment
    const cadenceAdjustment = this.calculateCadenceAdjustment(terrain, smoothedGrade);
    
    // Determine confidence based on GPS accuracy and consistency
    const confidence = this.calculateConfidence(currentLocation, this.recentGrades);

    // Update current state
    this.currentTerrain = terrain;
    this.currentGrade = smoothedGrade;

    return {
      terrain,
      grade: Math.round(smoothedGrade * 10) / 10, // Round to 1 decimal
      cadenceAdjustment,
      confidence,
      rawGrade: Math.round(grade * 10) / 10,
      distance: Math.round(distance),
      elevationChange: Math.round(elevationChange * 10) / 10,
    };
  }

  /**
   * Get smoothed grade from recent history
   * @returns {number} Smoothed grade percentage
   */
  getSmoothedGrade() {
    if (this.recentGrades.length === 0) return 0;
    
    // Use weighted average (more recent grades have higher weight)
    let weightedSum = 0;
    let totalWeight = 0;
    
    this.recentGrades.forEach((grade, index) => {
      const weight = index + 1; // More recent = higher weight
      weightedSum += grade * weight;
      totalWeight += weight;
    });
    
    return weightedSum / totalWeight;
  }

  /**
   * Calculate confidence level based on GPS accuracy and grade consistency
   * @param {Object} location - Current location
   * @param {Array} grades - Recent grade calculations
   * @returns {string} Confidence level: 'low', 'medium', 'high'
   */
  calculateConfidence(location, grades) {
    // GPS accuracy factor (lower accuracy = lower confidence)
    const accuracyFactor = location.accuracy < 10 ? 1 : location.accuracy < 20 ? 0.7 : 0.4;
    
    // Grade consistency factor
    let consistencyFactor = 1;
    if (grades.length >= 3) {
      const variance = this.calculateVariance(grades);
      consistencyFactor = variance < 2 ? 1 : variance < 5 ? 0.7 : 0.4;
    }
    
    const overallConfidence = accuracyFactor * consistencyFactor;
    
    if (overallConfidence > 0.8) return 'high';
    if (overallConfidence > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Calculate variance of an array of numbers
   * @param {Array} values - Array of numbers
   * @returns {number} Variance
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate cadence adjustment based on terrain and user profile
   * @param {string} terrain - Terrain type
   * @param {number} grade - Grade percentage
   * @param {Object} userProfile - User profile for personalization
   * @returns {number} Cadence adjustment in SPM
   */
  calculateCadenceAdjustment(terrain, grade, userProfile = null) {
    let baseAdjustment = 0;
    
    switch (terrain) {
      case 'uphill':
        // Increase cadence for uphill (5-10 SPM)
        baseAdjustment = Math.min(10, 5 + Math.abs(grade) * 0.5);
        break;
      case 'downhill':
        // Decrease cadence for downhill (3-8 SPM)
        baseAdjustment = -Math.min(8, 3 + Math.abs(grade) * 0.4);
        break;
      case 'flat':
      default:
        baseAdjustment = 0;
    }

    // Adjust based on user experience level
    if (userProfile?.experience) {
      const experienceMultiplier = {
        beginner: 0.7,       // Smaller adjustments for beginners
        intermediate: 1.0,   // Standard adjustments
        advanced: 1.2,       // Slightly larger adjustments
        elite: 1.3,          // Larger adjustments for elite runners
      };
      
      baseAdjustment *= experienceMultiplier[userProfile.experience] || 1.0;
    }

    return Math.round(baseAdjustment);
  }

  /**
   * Calculate grade from elevation change
   * @param {number} elevationChange - Change in meters
   * @param {number} distance - Distance in meters
   * @returns {number} Grade percentage
   */
  static calculateGrade(elevationChange, distance) {
    if (distance === 0) return 0;
    return (elevationChange / distance) * 100;
  }

  /**
   * Classify terrain based on grade
   * @param {number} grade - Grade percentage
   * @returns {string} Terrain type: 'uphill', 'downhill', 'flat'
   */
  static classifyTerrain(grade) {
    if (grade > 2) return 'uphill';
    if (grade < -2) return 'downhill';
    return 'flat';
  }

  /**
   * Calculate cadence adjustment for terrain (static version)
   * @param {string} terrainType - Type of terrain
   * @param {number} grade - Grade percentage
   * @param {number} baseCadence - Base cadence in SPM
   * @returns {number} Adjusted cadence
   */
  static adjustCadenceForTerrain(terrainType, grade, baseCadence) {
    let adjustment = 0;
    
    switch (terrainType) {
      case 'uphill':
        // +5 to +10 SPM for uphill
        adjustment = Math.min(10, 5 + Math.abs(grade) * 0.5);
        break;
      case 'downhill':
        // -3 to -8 SPM for downhill
        adjustment = -Math.min(8, 3 + Math.abs(grade) * 0.4);
        break;
      case 'flat':
      default:
        adjustment = 0;
    }
    
    return Math.round(baseCadence + adjustment);
  }

  /**
   * Calculate distance between two GPS points
   * @param {Object} point1 - First GPS point
   * @param {Object} point2 - Second GPS point
   * @returns {number} Distance in meters
   */
  static calculateDistance(point1, point2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (point1.latitude * Math.PI) / 180;
    const φ2 = (point2.latitude * Math.PI) / 180;
    const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Analyze terrain from GPS data (existing method for FIT file analysis)
   * @param {Array} gpsData - Array of GPS points with elevation
   * @returns {Object} Terrain analysis
   */
  static analyzeTerrainProfile(gpsData) {
    if (!gpsData || gpsData.length < 2) {
      return {
        totalElevationGain: 0,
        totalElevationLoss: 0,
        avgGrade: 0,
        terrainDistribution: { flat: 100, uphill: 0, downhill: 0 },
      };
    }

    let elevationGain = 0;
    let elevationLoss = 0;
    const terrainSegments = { flat: 0, uphill: 0, downhill: 0 };

    for (let i = 1; i < gpsData.length; i++) {
      const elevChange = gpsData[i].elevation - gpsData[i - 1].elevation;
      const distance = this.calculateDistance(gpsData[i - 1], gpsData[i]);
      const grade = this.calculateGrade(elevChange, distance);
      const terrain = this.classifyTerrain(grade);

      terrainSegments[terrain] += distance;

      if (elevChange > 0) elevationGain += elevChange;
      if (elevChange < 0) elevationLoss += Math.abs(elevChange);
    }

    const totalDistance = Object.values(terrainSegments).reduce((a, b) => a + b, 0);
    const terrainDistribution = {
      flat: (terrainSegments.flat / totalDistance) * 100,
      uphill: (terrainSegments.uphill / totalDistance) * 100,
      downhill: (terrainSegments.downhill / totalDistance) * 100,
    };

    return {
      totalElevationGain: Math.round(elevationGain),
      totalElevationLoss: Math.round(elevationLoss),
      terrainDistribution,
    };
  }

  /**
   * Reset terrain detector state
   */
  reset() {
    this.recentGrades = [];
    this.currentTerrain = 'flat';
    this.currentGrade = 0;
  }

  /**
   * Get current terrain state
   * @returns {Object} Current terrain information
   */
  getCurrentState() {
    return {
      terrain: this.currentTerrain,
      grade: this.currentGrade,
      gradeHistory: [...this.recentGrades],
    };
  }
}

// Singleton instance
export default new TerrainDetector();
