import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';

const FEELING_OPTIONS = [
  {
    key: 'great',
    label: 'Feeling Great',
    desc: 'Well rested, ready to push',
    intensityMultiplier: 1.05,
    cadenceOffset: 3,
  },
  {
    key: 'good',
    label: 'Good to Go',
    desc: 'Normal energy, solid day',
    intensityMultiplier: 1.0,
    cadenceOffset: 0,
  },
  {
    key: 'tired',
    label: 'A Bit Tired',
    desc: 'Low energy, take it easy',
    intensityMultiplier: 0.92,
    cadenceOffset: -5,
  },
  {
    key: 'recovering',
    label: 'Recovering',
    desc: 'Post-race, sick, or injured',
    intensityMultiplier: 0.85,
    cadenceOffset: -10,
  },
];

export default function PreWorkoutCheckIn({ visible, onSelect, onSkip }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onSkip}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>How are you feeling?</Text>
          <Text style={styles.subtitle}>We'll adjust your workout accordingly</Text>

          {FEELING_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={styles.optionButton}
              onPress={() => onSelect(option)}
              accessibilityLabel={`${option.label}: ${option.desc}`}
              accessibilityRole="button"
            >
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDesc}>{option.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export { FEELING_OPTIONS };


const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  title: {
    color: '#0A0A0A',
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: '#6B6B6B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    color: '#0A0A0A',
    fontFamily: 'Archivo_700Bold',
    fontSize: 16,
  },
  optionDesc: {
    color: '#6B6B6B',
    fontSize: 13,
    marginTop: 2,
  },
  skipButton: {
    marginTop: 10,
    alignItems: 'center',
    padding: 12,
  },
  skipText: {
    color: '#6B6B6B',
    fontSize: 14,
  },
});
