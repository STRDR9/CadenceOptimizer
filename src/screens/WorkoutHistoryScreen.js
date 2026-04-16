import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getWorkoutHistory } from '../utils/storage';
import { getRunnerProfile } from '../utils/storage';
import PostWorkoutSummary from '../components/PostWorkoutSummary';

function formatDuration(seconds) {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const month = d.toLocaleString('default', { month: 'short' });
  const day = d.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${month} ${day}, ${time}`;
}

export default function WorkoutHistoryScreen() {
  const [workouts, setWorkouts] = useState([]);
  const [units, setUnits] = useState('metric');
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const history = await getWorkoutHistory();
    setWorkouts(history);
    const profile = await getRunnerProfile();
    if (profile?.units) setUnits(profile.units);
  };

  const isMetric = units === 'metric';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {workouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏃</Text>
            <Text style={styles.emptyTitle}>No Workouts Yet</Text>
            <Text style={styles.emptyDesc}>
              Complete a workout on the Metronome tab and it'll show up here.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {workouts.map((workout, index) => {
              const distance = workout.totalDistance > 0
                ? (isMetric
                    ? (workout.totalDistance / 1000).toFixed(2) + ' km'
                    : (workout.totalDistance / 1609.34).toFixed(2) + ' mi')
                : null;

              return (
                <TouchableOpacity
                  key={workout.id || index}
                  style={styles.card}
                  onPress={() => setSelectedWorkout(workout)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardDate}>
                      {formatDate(workout.date || workout.savedAt)}
                    </Text>
                    <Text style={styles.cardMode}>
                      {(workout.mode || 'free run').toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.cardStats}>
                    <View style={styles.cardStat}>
                      <Text style={styles.cardStatValue}>
                        {formatDuration(workout.duration)}
                      </Text>
                      <Text style={styles.cardStatLabel}>DURATION</Text>
                    </View>
                    {distance && (
                      <View style={styles.cardStat}>
                        <Text style={styles.cardStatValue}>{distance}</Text>
                        <Text style={styles.cardStatLabel}>DISTANCE</Text>
                      </View>
                    )}
                    <View style={styles.cardStat}>
                      <Text style={styles.cardStatValue}>
                        {workout.avgCadence || '--'}
                      </Text>
                      <Text style={styles.cardStatLabel}>AVG SPM</Text>
                    </View>
                  </View>

                  {workout.feeling && (
                    <Text style={styles.cardFeeling}>Feeling: {workout.feeling}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <PostWorkoutSummary
        visible={!!selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        summary={selectedWorkout}
        units={units}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardDate: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  cardMode: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    letterSpacing: 0.5,
    overflow: 'hidden',
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  cardStat: {
    alignItems: 'center',
  },
  cardStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000',
  },
  cardStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  cardFeeling: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
});
