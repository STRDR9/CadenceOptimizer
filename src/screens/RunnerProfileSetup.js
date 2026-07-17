import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform } from 'react-native';
import { saveRunnerProfile } from '../utils/storage';
import { webAlert, showSuccess, showError } from '../utils/webAlert';

export default function RunnerProfileSetup({ navigation, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [profile, setProfile] = useState({
    // Basic Demographics
    height: '',
    weight: '',
    age: '',
    gender: 'prefer_not_to_say',
    
    // Running Experience
    experience: 'intermediate',
    yearsRunning: '',
    weeklyMileage: '',
    typicalDistance: '5k',
    
    // Current Performance
    recentRaceTimes: {
      '5k': '',
      '10k': '',
      'half_marathon': '',
      'marathon': ''
    },
    comfortablePace: '',
    currentCadence: '',
    
    // Goals & Preferences
    primaryGoals: [],
    targetRaces: [],
    preferredIntensity: 'moderate',
    
    // Physical Characteristics
    injuryHistory: 'none',
    footStrike: 'midfoot',
    runningSurfaces: [],
    
    // Additional Info
    trainingDays: '3-4',
    longestRun: ''
  });
  const [units, setUnits] = useState('metric'); // metric or imperial
  const [loading, setLoading] = useState(false);
  
  const totalSteps = 6;

  // Data options
  const genderOptions = [
    { key: 'male', label: 'Male' },
    { key: 'female', label: 'Female' },
    { key: 'prefer_not_to_say', label: 'Prefer not to say' }
  ];

  const experienceLevels = [
    { key: 'beginner', label: 'Beginner', desc: 'New to running or < 1 year' },
    { key: 'intermediate', label: 'Intermediate', desc: '1-3 years of regular running' },
    { key: 'advanced', label: 'Advanced', desc: '3+ years, competitive runner' },
    { key: 'elite', label: 'Elite', desc: 'Professional/sub-elite athlete' },
  ];

  const weeklyMileageOptions = [
    { key: '0-10', label: '0-10 miles/week' },
    { key: '10-20', label: '10-20 miles/week' },
    { key: '20-30', label: '20-30 miles/week' },
    { key: '30-50', label: '30-50 miles/week' },
    { key: '50+', label: '50+ miles/week' }
  ];

  const distanceOptions = [
    { key: '5k', label: '5K (3.1 mi)' },
    { key: '10k', label: '10K (6.2 mi)' },
    { key: 'half_marathon', label: 'Half Marathon (13.1 mi)' },
    { key: 'marathon', label: 'Marathon (26.2 mi)' },
    { key: 'ultra', label: 'Ultra Marathon (50K+)' }
  ];

  const goalOptions = [
    { key: 'speed', label: 'Improve Speed', icon: '⚡' },
    { key: 'endurance', label: 'Build Endurance', icon: '🏃' },
    { key: 'injury_prevention', label: 'Prevent Injuries', icon: '🛡️' },
    { key: 'weight_loss', label: 'Weight Management', icon: '⚖️' },
    { key: 'general_fitness', label: 'General Fitness', icon: '💪' },
    { key: 'race_pr', label: 'Race PR', icon: '🏆' }
  ];

  const intensityOptions = [
    { key: 'easy', label: 'Easy/Recovery Focus', desc: 'Mostly easy runs, minimal intensity' },
    { key: 'moderate', label: 'Moderate Training', desc: 'Mix of easy and moderate efforts' },
    { key: 'intense', label: 'High Intensity', desc: 'Regular speed work and hard efforts' }
  ];

  const injuryOptions = [
    { key: 'none', label: 'No significant injuries' },
    { key: 'knee', label: 'Knee issues (past or current)' },
    { key: 'ankle', label: 'Ankle/foot problems' },
    { key: 'hip', label: 'Hip/IT band issues' },
    { key: 'shin', label: 'Shin splints' },
    { key: 'other', label: 'Other injuries' }
  ];

  const footStrikeOptions = [
    { key: 'forefoot', label: 'Forefoot', desc: 'Land on balls of feet' },
    { key: 'midfoot', label: 'Midfoot', desc: 'Land on middle of foot' },
    { key: 'heel', label: 'Heel Strike', desc: 'Land on heel first' },
    { key: 'unknown', label: 'Not Sure', desc: 'Haven\'t analyzed my form' }
  ];

  const surfaceOptions = [
    { key: 'road', label: 'Road/Pavement', icon: '🛣️' },
    { key: 'trail', label: 'Trails', icon: '🌲' },
    { key: 'track', label: 'Track', icon: '🏃‍♂️' },
    { key: 'treadmill', label: 'Treadmill', icon: '🏃‍♀️' },
    { key: 'mixed', label: 'Mixed Surfaces', icon: '🔄' }
  ];
  const handleSave = async () => {
    // Validate required fields
    if (!profile.height || !profile.weight || !profile.age) {
      showError('Please fill in height, weight, and age to continue.');
      return;
    }

    // Extract numeric values from formatted strings
    const heightValue = parseFloat(profile.height.replace(/[^\d.]/g, ''));
    const weightValue = parseFloat(profile.weight.replace(/[^\d.]/g, ''));
    const age = parseInt(profile.age);

    // Validate ranges
    if (units === 'metric') {
      if (heightValue < 120 || heightValue > 220) {
        showError('Please enter a height between 120-220 cm.');
        return;
      }
      if (weightValue < 30 || weightValue > 200) {
        showError('Please enter a weight between 30-200 kg.');
        return;
      }
    } else {
      if (heightValue < 48 || heightValue > 84) {
        showError('Please enter a height between 48-84 inches.');
        return;
      }
      if (weightValue < 66 || weightValue > 440) {
        showError('Please enter a weight between 66-440 lbs.');
        return;
      }
    }

    if (age < 13 || age > 100) {
      showError('Please enter an age between 13-100 years.');
      return;
    }

    setLoading(true);

    try {
      // Convert to metric if needed and calculate additional metrics
      const heightInCm = units === 'metric' ? heightValue : heightValue * 2.54;
      const weightInKg = units === 'metric' ? weightValue : weightValue * 0.453592;
      
      // Calculate stride length estimate (height * 0.43 for average runner)
      const estimatedStrideLength = heightInCm * 0.43;
      
      // Calculate BMI
      const bmi = weightInKg / Math.pow(heightInCm / 100, 2);
      
      const profileData = {
        // Basic Demographics
        height: heightInCm,
        weight: weightInKg,
        age,
        gender: profile.gender,
        bmi: Math.round(bmi * 10) / 10,
        
        // Running Experience
        experience: profile.experience,
        yearsRunning: profile.yearsRunning,
        weeklyMileage: profile.weeklyMileage,
        typicalDistance: profile.typicalDistance,
        
        // Current Performance
        recentRaceTimes: profile.recentRaceTimes,
        comfortablePace: profile.comfortablePace,
        currentCadence: profile.currentCadence,
        
        // Goals & Preferences
        primaryGoals: profile.primaryGoals,
        targetRaces: profile.targetRaces,
        preferredIntensity: profile.preferredIntensity,
        
        // Physical Characteristics
        injuryHistory: profile.injuryHistory,
        footStrike: profile.footStrike,
        runningSurfaces: profile.runningSurfaces,
        estimatedStrideLength: Math.round(estimatedStrideLength),
        
        // Additional Info
        trainingDays: profile.trainingDays,
        longestRun: profile.longestRun,
        
        // Metadata
        units,
        createdAt: new Date().toISOString(),
        version: '2.0'
      };

      const saveResult = await saveRunnerProfile(profileData);
      
      if (!saveResult) {
        throw new Error('Failed to save profile to storage');
      }
      
      // Use web-compatible success message
      showSuccess(
        'Your comprehensive runner profile has been saved. All cadence recommendations will now be personalized based on your data.',
        () => {
          try {
            if (onComplete) {
              onComplete(profileData);
            } else if (navigation && navigation.navigate) {
              navigation.navigate('Home');
            }
          } catch (navError) {
            console.error('Navigation error:', navError);
          }
        }
      );
    } catch (error) {
      console.error('Error saving profile:', error);
      showError('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateProfile = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayValue = (field, value) => {
    setProfile(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(item => item !== value)
        : [...prev[field], value]
    }));
  };

  const updateRaceTime = (distance, time) => {
    setProfile(prev => ({
      ...prev,
      recentRaceTimes: {
        ...prev.recentRaceTimes,
        [distance]: time
      }
    }));
  };

  // Format time input to auto-add colons (MM:SS or H:MM:SS)
  const formatTimeInput = (value) => {
    // Remove all non-numeric characters
    const numbers = value.replace(/[^\d]/g, '');
    
    if (numbers.length === 0) return '';
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) {
      // MM:SS format
      return `${numbers.slice(0, 2)}:${numbers.slice(2)}`;
    }
    // H:MM:SS format for longer times
    const hours = numbers.slice(0, numbers.length - 4);
    const minutes = numbers.slice(numbers.length - 4, numbers.length - 2);
    const seconds = numbers.slice(numbers.length - 2);
    return `${hours}:${minutes}:${seconds}`;
  };

  const handleTimeInput = (distance, value) => {
    const formatted = formatTimeInput(value);
    updateRaceTime(distance, formatted);
  };

  // Format pace input to auto-add /mile or /km
  const formatPaceInput = (value) => {
    // Remove existing unit suffixes
    let cleanValue = value.replace(/\s*\/\s*(mile|km|mi)$/i, '').trim();
    
    // If empty, return empty
    if (!cleanValue) return '';
    
    // Add the appropriate unit based on current setting
    const unit = units === 'metric' ? '/km' : '/mile';
    return `${cleanValue} ${unit}`;
  };

  const handlePaceInput = (value) => {
    // Remove unit suffixes first to get just the time part
    let cleanValue = value.replace(/\s*\/\s*(mile|km|mi)$/i, '').trim();
    
    // Apply time formatting (colons)
    const formatted = formatTimeInput(cleanValue);
    
    // Store the formatted time (units will be added on blur)
    updateProfile('comfortablePace', formatted);
  };

  const handlePaceBlur = () => {
    // Format the pace when user finishes typing
    if (profile.comfortablePace) {
      const formatted = formatPaceInput(profile.comfortablePace);
      updateProfile('comfortablePace', formatted);
    }
  };

  // Format height input to auto-add cm or in
  const formatHeightInput = (value) => {
    // Remove existing unit suffixes
    let cleanValue = value.replace(/\s*(cm|in|inches?)$/i, '').trim();
    
    if (!cleanValue) return '';
    
    const unit = units === 'metric' ? ' cm' : ' in';
    return `${cleanValue}${unit}`;
  };

  const handleHeightInput = (value) => {
    updateProfile('height', value);
  };

  const handleHeightBlur = () => {
    if (profile.height) {
      const formatted = formatHeightInput(profile.height);
      updateProfile('height', formatted);
    }
  };

  // Format weight input to auto-add kg or lbs
  const formatWeightInput = (value) => {
    // Remove existing unit suffixes
    let cleanValue = value.replace(/\s*(kg|lbs?|pounds?)$/i, '').trim();
    
    if (!cleanValue) return '';
    
    const unit = units === 'metric' ? ' kg' : ' lbs';
    return `${cleanValue}${unit}`;
  };

  const handleWeightInput = (value) => {
    updateProfile('weight', value);
  };

  const handleWeightBlur = () => {
    if (profile.weight) {
      const formatted = formatWeightInput(profile.weight);
      updateProfile('weight', formatted);
    }
  };
  // Step Components
  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i + 1 <= currentStep && styles.stepDotActive,
            i + 1 === currentStep && styles.stepDotCurrent
          ]}
        />
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View>
      <Text style={styles.stepTitle}>Basic Information</Text>
      <Text style={styles.stepSubtitle}>Tell us about yourself</Text>

      {/* Units Toggle */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Units</Text>
        <View style={styles.unitsToggle}>
          <TouchableOpacity
            style={[styles.unitButton, units === 'metric' && styles.unitButtonActive]}
            onPress={() => setUnits('metric')}
          >
            <Text style={[styles.unitButtonText, units === 'metric' && styles.unitButtonTextActive]}>
              Metric (cm/kg)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitButton, units === 'imperial' && styles.unitButtonActive]}
            onPress={() => setUnits('imperial')}
          >
            <Text style={[styles.unitButtonText, units === 'imperial' && styles.unitButtonTextActive]}>
              Imperial (in/lbs)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Age */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Age (years) *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 30"
          value={profile.age}
          onChangeText={(value) => updateProfile('age', value)}
          keyboardType="numeric"
        />
      </View>

      {/* Gender */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Gender</Text>
        <View style={styles.optionGrid}>
          {genderOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.optionButton,
                profile.gender === option.key && styles.optionButtonActive
              ]}
              onPress={() => updateProfile('gender', option.key)}
            >
              <Text style={[
                styles.optionButtonText,
                profile.gender === option.key && styles.optionButtonTextActive
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Height */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Height *</Text>
        <TextInput
          style={styles.input}
          placeholder={units === 'metric' ? 'e.g., 175' : 'e.g., 69'}
          value={profile.height}
          onChangeText={handleHeightInput}
          onBlur={handleHeightBlur}
          keyboardType="numeric"
        />
        <Text style={styles.inputHint}>
          Just type the number - we'll add {units === 'metric' ? 'cm' : 'inches'} automatically
        </Text>
      </View>

      {/* Weight */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Weight *</Text>
        <TextInput
          style={styles.input}
          placeholder={units === 'metric' ? 'e.g., 70' : 'e.g., 154'}
          value={profile.weight}
          onChangeText={handleWeightInput}
          onBlur={handleWeightBlur}
          keyboardType="numeric"
        />
        <Text style={styles.inputHint}>
          Just type the number - we'll add {units === 'metric' ? 'kg' : 'lbs'} automatically
        </Text>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View>
      <Text style={styles.stepTitle}>Running Experience</Text>
      <Text style={styles.stepSubtitle}>Help us understand your running background</Text>

      {/* Experience Level */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Experience Level</Text>
        <View style={styles.experienceGrid}>
          {experienceLevels.map((level) => (
            <TouchableOpacity
              key={level.key}
              style={[
                styles.experienceCard,
                profile.experience === level.key && styles.experienceCardActive
              ]}
              onPress={() => updateProfile('experience', level.key)}
            >
              <Text style={[
                styles.experienceLabel,
                profile.experience === level.key && styles.experienceLabelActive
              ]}>
                {level.label}
              </Text>
              <Text style={[
                styles.experienceDesc,
                profile.experience === level.key && styles.experienceDescActive
              ]}>
                {level.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Years Running */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Years Running</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 2.5"
          value={profile.yearsRunning}
          onChangeText={(value) => updateProfile('yearsRunning', value)}
          keyboardType="numeric"
        />
      </View>

      {/* Weekly Mileage */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Current Weekly Mileage</Text>
        <View style={styles.optionGrid}>
          {weeklyMileageOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.optionButton,
                profile.weeklyMileage === option.key && styles.optionButtonActive
              ]}
              onPress={() => updateProfile('weeklyMileage', option.key)}
            >
              <Text style={[
                styles.optionButtonText,
                profile.weeklyMileage === option.key && styles.optionButtonTextActive
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Typical Distance */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Most Common Race Distance</Text>
        <View style={styles.optionGrid}>
          {distanceOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.optionButton,
                profile.typicalDistance === option.key && styles.optionButtonActive
              ]}
              onPress={() => updateProfile('typicalDistance', option.key)}
            >
              <Text style={[
                styles.optionButtonText,
                profile.typicalDistance === option.key && styles.optionButtonTextActive
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
  const renderStep3 = () => (
    <View>
      <Text style={styles.stepTitle}>Current Performance</Text>
      <Text style={styles.stepSubtitle}>Share your recent times and paces (optional)</Text>

      {/* Recent Race Times */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Recent Race Times (just type numbers)</Text>
        
        <View style={styles.raceTimeRow}>
          <Text style={styles.raceLabel}>5K:</Text>
          <TextInput
            style={styles.timeInput}
            placeholder="2530 → 25:30"
            value={profile.recentRaceTimes['5k']}
            onChangeText={(value) => handleTimeInput('5k', value)}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.raceTimeRow}>
          <Text style={styles.raceLabel}>10K:</Text>
          <TextInput
            style={styles.timeInput}
            placeholder="5215 → 52:15"
            value={profile.recentRaceTimes['10k']}
            onChangeText={(value) => handleTimeInput('10k', value)}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.raceTimeRow}>
          <Text style={styles.raceLabel}>Half Marathon:</Text>
          <TextInput
            style={styles.timeInput}
            placeholder="15530 → 1:55:30"
            value={profile.recentRaceTimes['half_marathon']}
            onChangeText={(value) => handleTimeInput('half_marathon', value)}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.raceTimeRow}>
          <Text style={styles.raceLabel}>Marathon:</Text>
          <TextInput
            style={styles.timeInput}
            placeholder="41500 → 4:15:00"
            value={profile.recentRaceTimes['marathon']}
            onChangeText={(value) => handleTimeInput('marathon', value)}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Comfortable Pace */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Comfortable Easy Pace</Text>
        <TextInput
          style={styles.input}
          placeholder={units === 'metric' ? '600 → 6:00 /km' : '930 → 9:30 /mile'}
          value={profile.comfortablePace}
          onChangeText={handlePaceInput}
          onBlur={handlePaceBlur}
          keyboardType="numeric"
        />
        <Text style={styles.inputHint}>
          Just type numbers - we'll add colons and {units === 'metric' ? '/km' : '/mile'} automatically
        </Text>
      </View>

      {/* Current Cadence */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Current Cadence (if known)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 165 SPM"
          value={profile.currentCadence}
          onChangeText={(value) => updateProfile('currentCadence', value)}
          keyboardType="numeric"
        />
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View>
      <Text style={styles.stepTitle}>Goals & Training</Text>
      <Text style={styles.stepSubtitle}>What are you working towards?</Text>

      {/* Primary Goals */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Primary Goals (select all that apply)</Text>
        <View style={styles.goalGrid}>
          {goalOptions.map((goal) => (
            <TouchableOpacity
              key={goal.key}
              style={[
                styles.goalCard,
                profile.primaryGoals.includes(goal.key) && styles.goalCardActive
              ]}
              onPress={() => toggleArrayValue('primaryGoals', goal.key)}
            >
              <Text style={styles.goalIcon}>{goal.icon}</Text>
              <Text style={[
                styles.goalLabel,
                profile.primaryGoals.includes(goal.key) && styles.goalLabelActive
              ]}>
                {goal.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Target Races */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Target Race Distances</Text>
        <View style={styles.optionGrid}>
          {distanceOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.optionButton,
                profile.targetRaces.includes(option.key) && styles.optionButtonActive
              ]}
              onPress={() => toggleArrayValue('targetRaces', option.key)}
            >
              <Text style={[
                styles.optionButtonText,
                profile.targetRaces.includes(option.key) && styles.optionButtonTextActive
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Training Intensity */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Preferred Training Intensity</Text>
        <View style={styles.experienceGrid}>
          {intensityOptions.map((intensity) => (
            <TouchableOpacity
              key={intensity.key}
              style={[
                styles.experienceCard,
                profile.preferredIntensity === intensity.key && styles.experienceCardActive
              ]}
              onPress={() => updateProfile('preferredIntensity', intensity.key)}
            >
              <Text style={[
                styles.experienceLabel,
                profile.preferredIntensity === intensity.key && styles.experienceLabelActive
              ]}>
                {intensity.label}
              </Text>
              <Text style={[
                styles.experienceDesc,
                profile.preferredIntensity === intensity.key && styles.experienceDescActive
              ]}>
                {intensity.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
  const renderStep5 = () => (
    <View>
      <Text style={styles.stepTitle}>Running Form & Health</Text>
      <Text style={styles.stepSubtitle}>Help us understand your physical characteristics</Text>

      {/* Injury History */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Injury History</Text>
        <View style={styles.optionGrid}>
          {injuryOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.optionButton,
                profile.injuryHistory === option.key && styles.optionButtonActive
              ]}
              onPress={() => updateProfile('injuryHistory', option.key)}
            >
              <Text style={[
                styles.optionButtonText,
                profile.injuryHistory === option.key && styles.optionButtonTextActive
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Foot Strike */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Foot Strike Pattern</Text>
        <View style={styles.experienceGrid}>
          {footStrikeOptions.map((strike) => (
            <TouchableOpacity
              key={strike.key}
              style={[
                styles.experienceCard,
                profile.footStrike === strike.key && styles.experienceCardActive
              ]}
              onPress={() => updateProfile('footStrike', strike.key)}
            >
              <Text style={[
                styles.experienceLabel,
                profile.footStrike === strike.key && styles.experienceLabelActive
              ]}>
                {strike.label}
              </Text>
              <Text style={[
                styles.experienceDesc,
                profile.footStrike === strike.key && styles.experienceDescActive
              ]}>
                {strike.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Running Surfaces */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Preferred Running Surfaces</Text>
        <View style={styles.goalGrid}>
          {surfaceOptions.map((surface) => (
            <TouchableOpacity
              key={surface.key}
              style={[
                styles.goalCard,
                profile.runningSurfaces.includes(surface.key) && styles.goalCardActive
              ]}
              onPress={() => toggleArrayValue('runningSurfaces', surface.key)}
            >
              <Text style={styles.goalIcon}>{surface.icon}</Text>
              <Text style={[
                styles.goalLabel,
                profile.runningSurfaces.includes(surface.key) && styles.goalLabelActive
              ]}>
                {surface.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep6 = () => (
    <View>
      <Text style={styles.stepTitle}>Training Schedule</Text>
      <Text style={styles.stepSubtitle}>Final details about your training</Text>

      {/* Training Days */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Training Days per Week</Text>
        <View style={styles.optionGrid}>
          {['1-2', '3-4', '5-6', '7+'].map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.optionButton,
                profile.trainingDays === days && styles.optionButtonActive
              ]}
              onPress={() => updateProfile('trainingDays', days)}
            >
              <Text style={[
                styles.optionButtonText,
                profile.trainingDays === days && styles.optionButtonTextActive
              ]}>
                {days} days
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Longest Run */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Longest Run Distance</Text>
        <TextInput
          style={styles.input}
          placeholder={units === 'metric' ? 'e.g., 15 km' : 'e.g., 10 miles'}
          value={profile.longestRun}
          onChangeText={(value) => updateProfile('longestRun', value)}
        />
      </View>

      {/* Profile Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Profile Summary</Text>
        <Text style={styles.summaryText}>
          {profile.age ? `${profile.age} year old ` : ''}
          {profile.experience} runner
          {profile.weeklyMileage ? ` running ${profile.weeklyMileage}` : ''}
          {profile.primaryGoals.length > 0 ? ` focused on ${profile.primaryGoals.join(', ')}` : ''}
        </Text>
        <Text style={styles.summaryNote}>
          This information will be used to personalize your cadence recommendations and training advice.
        </Text>
      </View>
    </View>
  );
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Runner Profile Setup</Text>
        <Text style={styles.subtitle}>
          Step {currentStep} of {totalSteps}
        </Text>
        {renderStepIndicator()}
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}
        {currentStep === 6 && renderStep6()}
      </ScrollView>

      <View style={styles.navigation}>
        {currentStep > 1 && (
          <TouchableOpacity style={styles.navButton} onPress={prevStep}>
            <Text style={styles.navButtonText}>← Previous</Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.navSpacer} />
        
        {currentStep < totalSteps ? (
          <TouchableOpacity style={styles.navButtonPrimary} onPress={nextStep}>
            <Text style={styles.navButtonPrimaryText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navButtonPrimary, loading && styles.navButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.navButtonPrimaryText}>
              {loading ? 'Creating...' : 'Complete 🎉'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#F4F4F4',
    padding: 28,
    paddingTop: 50,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    color: '#0A0A0A',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 18,
    color: '#6B6B6B',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 0,
    backgroundColor: '#B0B0B0',
  },
  stepDotActive: {
    backgroundColor: '#6B6B6B',
  },
  stepDotCurrent: {
    backgroundColor: '#0A0A0A',
    width: 16,
    height: 16,
    borderRadius: 0,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100, // Add padding so content doesn't get hidden behind fixed buttons
  },
  stepTitle: {
    fontSize: 22,
    fontFamily: 'Archivo_700Bold',
    fontWeight: 'bold',
    color: '#0A0A0A',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#6B6B6B',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#0A0A0A',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
  },
  unitsToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 0,
    padding: 4,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 0,
    alignItems: 'center',
  },
  unitButtonActive: {
    backgroundColor: '#0A0A0A',
  },
  unitButtonText: {
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#6B6B6B',
  },
  unitButtonTextActive: {
    color: '#fff',
  },
  optionGrid: {
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 0,
    padding: 16,
    alignItems: 'center',
  },
  optionButtonActive: {
    borderColor: '#0A0A0A',
    backgroundColor: '#F4F4F4',
  },
  optionButtonText: {
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#0A0A0A',
  },
  optionButtonTextActive: {
    color: '#0A0A0A',
  },
  experienceGrid: {
    gap: 12,
  },
  experienceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 0,
    padding: 16,
  },
  experienceCardActive: {
    borderColor: '#0A0A0A',
    backgroundColor: 'rgba(0, 255, 157, 0.1)',
  },
  experienceLabel: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    marginBottom: 4,
    color: '#0A0A0A',
  },
  experienceLabelActive: {
    color: '#0A0A0A',
  },
  experienceDesc: {
    fontSize: 13,
    color: '#6B6B6B',
    lineHeight: 18,
  },
  experienceDescActive: {
    color: '#1976D2',
  },
  raceTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  raceLabel: {
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#0A0A0A',
    width: 100,
  },
  timeInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 0,
    padding: 12,
    fontSize: 14,
    marginLeft: 12,
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  goalCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 0,
    padding: 16,
    alignItems: 'center',
    minWidth: '45%',
  },
  goalCardActive: {
    borderColor: '#0A0A0A',
    backgroundColor: '#F4F4F4',
  },
  goalIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  goalLabel: {
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#0A0A0A',
    textAlign: 'center',
  },
  goalLabelActive: {
    color: '#0A0A0A',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 0,
    padding: 20,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    fontWeight: 'bold',
    color: '#0A0A0A',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 16,
    color: '#0A0A0A',
    lineHeight: 22,
    marginBottom: 12,
  },
  summaryNote: {
    fontSize: 13,
    color: '#6B6B6B',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  navigation: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  navButton: {
    backgroundColor: '#F4F4F4',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  navButtonText: {
    fontSize: 14,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: 0.3,
  },
  navSpacer: {
    flex: 1,
  },
  navButtonPrimary: {
    backgroundColor: '#0A0A0A',
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  navButtonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  navButtonPrimaryText: {
    fontSize: 14,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  footer: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  footerText: {
    fontSize: 12,
    color: '#6B6B6B',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});