// Cadence Analyzer Service
// Analyzes running data and provides personalized cadence recommendations

export class CadenceAnalyzer {
  /**
   * Analyze cadence efficiency from running data
   * @param {Array} cadenceData - Cadence data points
   * @param {Array} speedData - Speed data points
   * @returns {Object} Efficiency analysis
   */
  static analyzeEfficiency(cadenceData, speedData) {
    // TODO: Calculate efficiency metrics
    return {
      avgCadence: 0,
      optimalCadence: 0,
      efficiency: 0,
      zones: {},
    };
  }

  /**
   * Calculate personalized cadence targets
   * @param {Object} runnerProfile - Runner's biometric data
   * @param {Object} historicalData - Past running data
   * @returns {Object} Personalized targets
   */
  static calculatePersonalizedTargets(runnerProfile, historicalData) {
    if (!runnerProfile) {
      // Return default values if no profile
      return {
        baseCadence: 170,
        easyPace: 165,
        moderatePace: 170,
        racePace: 175,
        intervalPace: 180,
        profile: null,
      };
    }

    const { height, weight, age, experience } = runnerProfile;
    
    // Base cadence calculation
    let baseCadence = 170;
    
    // Height adjustment (-3 to +3 SPM)
    const heightAdjustment = this.calculateHeightAdjustment(height);
    
    // Experience level adjustment
    const experienceAdjustment = this.calculateExperienceAdjustment(experience);
    
    // Age adjustment
    const ageAdjustment = this.calculateAgeAdjustment(age);
    
    // Weight adjustment (minor factor)
    const weightAdjustment = this.calculateWeightAdjustment(weight, height);
    
    const finalBaseCadence = baseCadence + heightAdjustment + experienceAdjustment + ageAdjustment + weightAdjustment;
    
    return {
      baseCadence: Math.round(finalBaseCadence),
      easyPace: Math.round(finalBaseCadence - 5),
      moderatePace: Math.round(finalBaseCadence),
      racePace: Math.round(finalBaseCadence + 5),
      intervalPace: Math.round(finalBaseCadence + 10),
      profile: {
        height,
        weight,
        age,
        experience,
        heightAdjustment,
        experienceAdjustment,
        ageAdjustment,
        weightAdjustment,
      },
    };
  }

  /**
   * Calculate height-based cadence adjustment
   * @param {number} height - Height in cm
   * @returns {number} Adjustment in SPM
   */
  static calculateHeightAdjustment(height) {
    if (height < 160) return 3;
    if (height < 170) return 1;
    if (height < 180) return 0;
    if (height < 190) return -1;
    return -3;
  }

  /**
   * Calculate experience level adjustment
   * @param {string} experience - beginner, intermediate, advanced, elite
   * @returns {number} Adjustment in SPM
   */
  static calculateExperienceAdjustment(experience) {
    const adjustments = {
      beginner: -8,
      intermediate: -2,
      advanced: 3,
      elite: 8,
    };
    return adjustments[experience] || 0;
  }

  /**
   * Calculate age-based adjustment
   * @param {number} age - Age in years
   * @returns {number} Adjustment in SPM
   */
  static calculateAgeAdjustment(age) {
    if (age < 20) return 2; // Young runners tend to have higher natural cadence
    if (age < 30) return 0;
    if (age < 40) return -1;
    if (age < 50) return -2;
    if (age < 60) return -3;
    return -4; // Older runners may benefit from slightly lower cadence
  }

  /**
   * Calculate weight-based adjustment (BMI factor)
   * @param {number} weight - Weight in kg
   * @param {number} height - Height in cm
   * @returns {number} Adjustment in SPM
   */
  static calculateWeightAdjustment(weight, height) {
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    
    if (bmi < 18.5) return 1; // Underweight - slightly higher cadence
    if (bmi < 25) return 0; // Normal weight
    if (bmi < 30) return -1; // Overweight - slightly lower cadence
    return -2; // Obese - lower cadence for joint protection
  }

  /**
   * Identify patterns in running data
   * @param {Object} runData - Complete run data
   * @returns {Object} Identified patterns
   */
  static identifyPatterns(runData) {
    // TODO: Implement pattern recognition
    return {
      fatiguePattern: null,
      terrainAdaptation: null,
      consistency: 0,
    };
  }

  /**
   * Generate actionable recommendations
   * @param {Object} analysis - Analysis results
   * @param {Object} runnerProfile - Runner profile data
   * @returns {Array} Recommendations
   */
  static generateRecommendations(analysis, runnerProfile) {
    const recommendations = [];
    
    if (!runnerProfile) {
      recommendations.push({
        type: 'info',
        title: 'Create Your Profile',
        message: 'Set up your runner profile for personalized cadence recommendations based on your height, weight, age, and experience.',
      });
      return recommendations;
    }

    const personalizedTargets = this.calculatePersonalizedTargets(runnerProfile);
    const currentAvgCadence = analysis.avgCadence || 0;
    const targetCadence = personalizedTargets.baseCadence;

    // Cadence-specific recommendations
    if (currentAvgCadence < targetCadence - 10) {
      recommendations.push({
        type: 'improvement',
        title: 'Increase Your Cadence',
        message: `Your average cadence of ${Math.round(currentAvgCadence)} SPM is below your personalized target of ${targetCadence} SPM. Focus on quicker, lighter steps.`,
      });
    } else if (currentAvgCadence > targetCadence + 10) {
      recommendations.push({
        type: 'caution',
        title: 'Consider Longer Strides',
        message: `Your cadence of ${Math.round(currentAvgCadence)} SPM is higher than your target of ${targetCadence} SPM. Try slightly longer, more efficient strides.`,
      });
    } else {
      recommendations.push({
        type: 'success',
        title: 'Excellent Cadence!',
        message: `Your cadence of ${Math.round(currentAvgCadence)} SPM is perfect for your profile (target: ${targetCadence} SPM).`,
      });
    }

    // Experience-based recommendations
    if (runnerProfile.experience === 'beginner') {
      recommendations.push({
        type: 'info',
        title: 'Beginner Focus',
        message: 'As a beginner, focus on consistency over speed. Gradually work toward your target cadence over several weeks.',
      });
    } else if (runnerProfile.experience === 'elite') {
      recommendations.push({
        type: 'info',
        title: 'Elite Performance',
        message: 'Fine-tune your cadence for different race distances and terrain. Consider 5-10 SPM variations for tactical racing.',
      });
    }

    // Age-based recommendations
    if (runnerProfile.age > 50) {
      recommendations.push({
        type: 'info',
        title: 'Joint-Friendly Running',
        message: 'Higher cadence with shorter strides can reduce impact forces and protect your joints during longer runs.',
      });
    }

    return recommendations;
  }
}
