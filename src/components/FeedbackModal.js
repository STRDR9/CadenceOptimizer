// In-App Feedback & Bug Report Modal
// Users can submit feedback or report bugs
// Reports stored locally — review in analytics dashboard or export

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@strdr_feedback';
const MAX_FEEDBACK = 100;

const CATEGORIES = [
  { id: 'bug', label: 'Bug Report', icon: '🐛' },
  { id: 'feature', label: 'Feature Request', icon: '💡' },
  { id: 'general', label: 'General Feedback', icon: '💬' },
  { id: 'workout', label: 'Workout Issue', icon: '🏃' },
];

export default function FeedbackModal({ visible, onClose }) {
  const [category, setCategory] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('Select a Category', 'Pick what kind of feedback this is.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Add Details', 'Tell us what happened or what you\'d like to see.');
      return;
    }

    setSubmitting(true);
    try {
      const feedback = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        category,
        message: message.trim(),
      };

      const existing = await getFeedback();
      const updated = [feedback, ...existing].slice(0, MAX_FEEDBACK);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      setCategory(null);
      setMessage('');
      Alert.alert('Thanks!', 'Your feedback has been saved.');
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Could not save feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>SEND FEEDBACK</Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>WHAT KIND OF FEEDBACK?</Text>
          <View style={styles.categories}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryButton,
                  category === cat.id && styles.categorySelected,
                ]}
                onPress={() => setCategory(cat.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    category === cat.id && styles.categoryLabelSelected,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>DETAILS</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Describe the issue or share your thoughts..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            value={message}
            onChangeText={setMessage}
            maxLength={1000}
          />
          <Text style={styles.charCount}>{message.length}/1000</Text>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>
              {submitting ? 'SENDING...' : 'SUBMIT FEEDBACK'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            Feedback is stored locally on your device.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Helper to read feedback from storage (exported for use elsewhere)
export async function getFeedback() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function clearFeedback() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#000',
  },
  body: {
    flex: 1,
    padding: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#666',
    marginBottom: 12,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
  },
  categorySelected: {
    borderColor: '#000',
    backgroundColor: '#000',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  categoryLabelSelected: {
    color: '#FFF',
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    minHeight: 140,
    backgroundColor: '#FAFAFA',
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    marginBottom: 24,
  },
  submitButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  note: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 40,
  },
});
