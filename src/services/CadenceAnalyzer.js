// Cadence Analyzer Service
// Analyzes running data and provides personalized cadence recommendations

import {
  getCadenceBands,
  heightAdjustment,
  experienceAdjustment,
  ageAdjustment,
  weightAdjustment,
} from './cadenceModel';

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
    // F5: base cadence + effort bands now come from cadenceModel (single source
    // of truth) so these match the Targets screen and the workout metronome.
    const bands = getCadenceBands(runnerProfile);

    if (!runnerProfile) {
      return { ...bands, profile: null };
    }

    const { height, weight, age, experience } = runnerProfile;

    return {
      ...bands,
      profile: {
        height,
        weight,
        age,
        experience,
        heightAdjustment: heightAdjustment(height),
        experienceAdjustment: experienceAdjustment(experience),
        ageAdjustment: ageAdjustment(age),
        weightAdjustment: weightAdjustment(weight, height),
      },
    };
  }

  // F5: the per-factor adjustments now live in cadenceModel (single source of
  // truth). These thin forwarders remain for backward compatibility. Note the
  // model guards missing inputs (returns 0) where the old bodies did not.
  static calculateHeightAdjustment(height) {
    return heightAdjustment(height);
  }

  static calculateExperienceAdjustment(experience) {
    return experienceAdjustment(experience);
  }

  static calculateAgeAdjustment(age) {
    return ageAdjustment(age);
  }

  static calculateWeightAdjustment(weight, height) {
    return weightAdjustment(weight, height);
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
