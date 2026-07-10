import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { getRunnerProfile } from '../utils/storage';
import {
  parseTimeToMinutes,
  formatPace,
  calculateStrideLength,
  paceToSpeed
} from '../utils/calculations';
import { getTargetCadence, getDistanceCadenceTable } from '../services/cadenceModel';

export default function TargetsScreen() {
  const [selectedDistance, setSelectedDistance] = useState('10K');
  const [targetTime, setTargetTime] = useState('');
  const [result, setResult] = useState(null);
  const [profile, setProfile] = useState(null);
  const [units, setUnits] = useState('metric');

  const distances = ['5K', '10K', 'Half Marathon', 'Marathon'];

  // F6: display metadata for the auto-derived per-distance cadence table.
  const distanceTableLabels = {
    '5k': '5K',
    '10k': '10K',
    half_marathon: 'Half Marathon',
    marathon: 'Marathon',
  };
  // How the cadence for a row was derived, shown so the number isn't a black box.
  const sourceNotes = {
    race: 'From your entered time',
    estimate: 'Estimated from your race',
    comfortablePace: 'From your comfortable pace',
    base: 'General estimate — add a race time to personalize',
  };

  // F6: cadence for every race distance, derived automatically from the saved
  // profile (entered race times -> goal pace -> cadence). No manual input.
  const distanceTable = profile ? getDistanceCadenceTable(profile) : [];

  // Distance to km mapping
  const distanceToKm = {
    '5K': 5,
    '10K': 10,
    'Half Marathon': 21.0975,
    'Marathon': 42.195
  };

  // Distance display names based on units
  const distanceLabels = units === 'imperial' 
    ? { '5K': '5K (3.1 mi)', '10K': '10K (6.2 mi)', 'Half Marathon': 'Half (13.1 mi)', 'Marathon': 'Marathon (26.2 mi)' }
    : { '5K': '5K', '10K': '10K', 'Half Marathon': 'Half Marathon', 'Marathon': 'Marathon' };

  // Load runner profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const savedProfile = await getRunnerProfile();
      setProfile(savedProfile);
      if (savedProfile?.units) {
        setUnits(savedProfile.units);
      }
    } catch (error) {
      // No profile found, using defaults
    }
  };

  // Clear results when distance changes
  const handleDistanceChange = (distance) => {
    setSelectedDistance(distance);
    setResult(null);
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

  const handleTimeInput = (value) => {
    const formatted = formatTimeInput(value);
    setTargetTime(formatted);
  };

  const calculateTarget = () => {
    if (!targetTime) return;

    const totalMinutes = parseTimeToMinutes(targetTime);
    if (totalMinutes === 0) return;

    const distanceKm = distanceToKm[selectedDistance];
    const paceMinKm = totalMinutes / distanceKm;
    const paceMinMi = paceMinKm * 1.60934;
    
    // F5: use the full profile (height, experience, age, weight, measured
    // cadence) via the single source of truth so this race target matches the
    // recommendations and the workout metronome for the same runner.
    const optimalCadence = getTargetCadence(profile, { paceMinKm });
    const speedKmh = paceToSpeed(paceMinKm);
    const strideLength = calculateStrideLength(optimalCadence, speedKmh);
    
    setResult({
      optimalCadence,
      targetPaceKm: formatPace(paceMinKm),
      targetPaceMi: formatPace(paceMinMi),
      strideLength: strideLength.toFixed(2),
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>Race Target Calculator</Text>
        <Text style={styles.description}>
          Calculate your optimal cadence for race day
        </Text>

        <Text style={styles.label}>Select Distance</Text>
        <View style={styles.distanceButtons}>
          {distances.map((distance) => (
            <TouchableOpacity
              key={distance}
              style={[
                styles.distanceButton,
                selectedDistance === distance && styles.distanceButtonActive
              ]}
              onPress={() => handleDistanceChange(distance)}
            >
              <Text style={[
                styles.distanceButtonText,
                selectedDistance === distance && styles.distanceButtonTextActive
              ]}>
                {distanceLabels[distance] || distance}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Target Time</Text>
        <TextInput
          style={styles.input}
          placeholder="4500 → 45:00"
          value={targetTime}
          onChangeText={handleTimeInput}
          keyboardType="numeric"
        />

        <TouchableOpacity 
          style={styles.calculateButton}
          onPress={calculateTarget}
        >
          <Text style={styles.calculateButtonText}>Calculate</Text>
        </TouchableOpacity>
      </View>

      {distanceTable.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.title}>Your Cadence by Distance</Text>
          <Text style={styles.description}>
            Auto-tuned to your profile — cadence rises for shorter, faster races
          </Text>
          {distanceTable.map((row) => (
            <View key={row.distanceKey} style={styles.distanceRow}>
              <View style={styles.distanceRowLeft}>
                <Text style={styles.distanceRowName}>
                  {distanceTableLabels[row.distanceKey] || row.distanceKey}
                </Text>
                <Text style={styles.distanceRowNote}>
                  {row.paceMinKm != null
                    ? `Goal ~${formatPace(row.paceMinKm)} /km · ${sourceNotes[row.source] || ''}`
                    : sourceNotes[row.source] || ''}
                </Text>
              </View>
              <View style={styles.distanceRowRight}>
                <Text style={styles.distanceRowCadence}>{row.cadence}</Text>
                <Text style={styles.distanceRowUnit}>SPM · {row.low}-{row.high}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {result && (
        <View style={styles.resultsSection}>
          <Text style={styles.resultsTitle}>Recommended Targets</Text>
          
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Optimal Cadence</Text>
            <Text style={styles.resultValue}>{result.optimalCadence} SPM</Text>
          </View>

          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Target Pace</Text>
            <Text style={styles.resultValue}>
              {units === 'metric' ? `${result.targetPaceKm} /km` : `${result.targetPaceMi} /mi`}
            </Text>
          </View>

          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Stride Length</Text>
            <Text style={styles.resultValue}>
              {units === 'metric' 
                ? `${result.strideLength} m` 
                : `${(parseFloat(result.strideLength) * 3.28084).toFixed(1)} ft`}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  section: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    color: '#000000',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 28,
    lineHeight: 24,
    fontWeight: '500',
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: '#000000',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  distanceButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 28,
    gap: 12,
  },
  distanceButton: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  distanceButtonActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  distanceButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.3,
  },
  distanceButtonTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 28,
    color: '#000000',
    fontWeight: '600',
  },
  calculateButton: {
    backgroundColor: '#000000',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  calculateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  distanceRowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  distanceRowName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.3,
  },
  distanceRowNote: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
    fontWeight: '500',
  },
  distanceRowRight: {
    alignItems: 'flex-end',
  },
  distanceRowCadence: {
    fontSize: 26,
    fontWeight: '900',
    color: '#000000',
  },
  distanceRowUnit: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '600',
    marginTop: 2,
  },
  resultsSection: {
    padding: 20,
  },
  resultsTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 20,
    color: '#000000',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  resultCard: {
    backgroundColor: '#F8F8F8',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 18,
    color: '#000000',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  resultValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
  },
});
