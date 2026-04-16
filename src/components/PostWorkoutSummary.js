// Post-Workout Summary Modal
// Shows route map, overall stats, and per-split cadence breakdown

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';

const { width } = Dimensions.get('window');

function formatPace(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '--:--';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PostWorkoutSummary({ visible, onClose, summary, units = 'metric' }) {
  const [showSplits, setShowSplits] = useState(false);

  if (!summary) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>WORKOUT COMPLETE</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No workout data available.</Text>
          </View>
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const hasRoute = summary.route && summary.route.length > 1;

  const isMetric = units === 'metric';
  const distanceValue = summary.totalDistance > 0
    ? (isMetric ? (summary.totalDistance / 1000).toFixed(2) : (summary.totalDistance / 1609.34).toFixed(2))
    : null;
  const distanceUnit = isMetric ? 'km' : 'mi';
  const paceUnit = isMetric ? '/km' : '/mi';
  const splits = isMetric ? (summary.splitsKm || []) : (summary.splitsMi || []);
  const avgPaceSeconds = summary.totalDistance > 0
    ? (summary.duration / summary.totalDistance) * (isMetric ? 1000 : 1609.34)
    : 0;

  // Calculate map region from route
  let mapRegion = null;
  if (hasRoute) {
    const lats = summary.route.map(p => p.latitude);
    const lons = summary.route.map(p => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    mapRegion = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.005),
      longitudeDelta: Math.max((maxLon - minLon) * 1.3, 0.005),
    };
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>WORKOUT COMPLETE</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Route Map — only if GPS data exists */}
          {hasRoute && mapRegion && (
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={mapRegion}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <Polyline
                  coordinates={summary.route}
                  strokeColor="#000000"
                  strokeWidth={4}
                />
                <Marker
                  coordinate={summary.route[0]}
                  title="Start"
                  pinColor="green"
                />
                <Marker
                  coordinate={summary.route[summary.route.length - 1]}
                  title="Finish"
                  pinColor="red"
                />
              </MapView>
            </View>
          )}

          {/* Overall Stats */}
          <View style={styles.statsGrid}>
            {distanceValue && (
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{distanceValue}</Text>
                <Text style={styles.statLabel}>{distanceUnit.toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatDuration(summary.duration)}</Text>
              <Text style={styles.statLabel}>DURATION</Text>
            </View>
            {distanceValue && avgPaceSeconds > 0 && (
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{formatPace(avgPaceSeconds)}</Text>
                <Text style={styles.statLabel}>PACE {paceUnit}</Text>
              </View>
            )}
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{summary.avgCadence || '--'}</Text>
              <Text style={styles.statLabel}>AVG SPM</Text>
            </View>
          </View>

          {/* Splits Toggle */}
          {splits.length > 0 && (
            <View style={styles.splitsSection}>
              <TouchableOpacity
                style={styles.splitsToggle}
                onPress={() => setShowSplits(!showSplits)}
              >
                <Text style={styles.splitsToggleText}>
                  {showSplits ? 'HIDE' : 'SHOW'} {isMetric ? 'KM' : 'MILE'} SPLITS
                </Text>
                <Text style={styles.splitsArrow}>{showSplits ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {showSplits && (
                <View style={styles.splitsTable}>
                  <View style={styles.splitsHeader}>
                    <Text style={[styles.splitHeaderText, styles.splitCol1]}>
                      {isMetric ? 'KM' : 'MILE'}
                    </Text>
                    <Text style={[styles.splitHeaderText, styles.splitCol2]}>PACE</Text>
                    <Text style={[styles.splitHeaderText, styles.splitCol3]}>CADENCE</Text>
                  </View>
                  {splits.map((split) => (
                    <View key={split.number} style={styles.splitRow}>
                      <Text style={[styles.splitText, styles.splitCol1]}>
                        {split.number}{split.partial ? '*' : ''}
                      </Text>
                      <Text style={[styles.splitText, styles.splitCol2]}>
                        {formatPace(split.pace)}
                      </Text>
                      <Text style={[styles.splitText, styles.splitCol3]}>
                        {split.avgCadence} SPM
                      </Text>
                    </View>
                  ))}
                  {splits.some(s => s.partial) && (
                    <Text style={styles.partialNote}>* partial split</Text>
                  )}
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>DONE</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#000',
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
  mapContainer: {
    height: 260,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  map: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '50%',
    padding: 8,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#000',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 4,
  },
  splitsSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  splitsToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  splitsToggleText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#000',
  },
  splitsArrow: {
    fontSize: 14,
    color: '#666',
  },
  splitsTable: {
    marginTop: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
  },
  splitsHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#000',
  },
  splitHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  splitRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  splitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  splitCol1: { width: '25%' },
  splitCol2: { width: '35%' },
  splitCol3: { width: '40%', textAlign: 'right' },
  partialNote: {
    fontSize: 12,
    color: '#999',
    padding: 12,
    fontStyle: 'italic',
  },
  doneButton: {
    backgroundColor: '#000',
    marginHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
