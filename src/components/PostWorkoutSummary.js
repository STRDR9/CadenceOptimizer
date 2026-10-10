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
import Svg, { Polyline as SvgPolyline, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import {
  defaultUnitsFromLocale,
  computeElevationGain,
  computeCadenceDrift,
  estimateSteps,
  pickCadenceMarkers,
  buildRouteSegments,
  cadenceChartModel,
  buildIntervalTable,
  DEVIATION_COLORS,
} from '../utils/summaryStats';

// FORGE-010: route polylines colored by cadence deviation. Falls back to the
// plain black line when points carry no usable data (legacy workouts).
function DeviationPolylines({ route, points, strokeWidth }) {
  const segments = buildRouteSegments(points);
  if (segments.length === 0) {
    return <Polyline coordinates={route} strokeColor="#000000" strokeWidth={strokeWidth} />;
  }
  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={`seg-${i}`}
          coordinates={seg.coordinates}
          strokeColor={DEVIATION_COLORS[seg.bucket]}
          strokeWidth={strokeWidth}
        />
      ))}
    </>
  );
}

const pointsToStr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

// FORGE-010: measured-vs-target cadence over time. Measured = solid black
// (broken where unmeasured), target = grey stepped dashes — deviation COLOR
// lives on the map; the chart stays monochrome like the rest of the brand.
function CadenceChart({ points }) {
  const width = Dimensions.get('window').width - 32;
  const model = cadenceChartModel(points, width, 180);
  if (!model) return null;
  return (
    <View style={styles.chartSection}>
      <Text style={styles.sectionTitle}>CADENCE</Text>
      <Svg width={model.width} height={model.height}>
        {model.yTicks.map((tick) => (
          <React.Fragment key={`t-${tick.value}`}>
            <SvgLine
              x1={model.pad.l}
              x2={model.width - model.pad.r}
              y1={tick.y}
              y2={tick.y}
              stroke="#E5E5E5"
              strokeWidth={1}
            />
            <SvgText x={4} y={tick.y + 4} fontSize={10} fill="#999">
              {tick.value}
            </SvgText>
          </React.Fragment>
        ))}
        <SvgPolyline
          points={pointsToStr(model.targetSteps)}
          fill="none"
          stroke="#999999"
          strokeWidth={2}
          strokeDasharray="6,4"
        />
        {model.measuredSegments.map((seg, i) => (
          <SvgPolyline
            key={`m-${i}`}
            points={pointsToStr(seg)}
            fill="none"
            stroke="#000000"
            strokeWidth={2.5}
          />
        ))}
      </Svg>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={styles.legendSolid} />
          <Text style={styles.legendText}>MEASURED</Text>
        </View>
        <View style={styles.legendItem}>
          <Svg width={18} height={4}>
            <SvgLine x1={0} y1={2} x2={18} y2={2} stroke="#999" strokeWidth={2} strokeDasharray="4,3" />
          </Svg>
          <Text style={styles.legendText}>TARGET</Text>
        </View>
        <Text style={styles.legendText}>{Math.round(model.durationSec / 60)} MIN</Text>
      </View>
      {!model.hasMeasured && (
        <Text style={styles.noMeasuredNote}>
          No step data for this run — check Motion & Fitness permission and keep the
          phone on your body (pocket or armband).
        </Text>
      )}
    </View>
  );
}

export { defaultUnitsFromLocale };

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
  const [mapExpanded, setMapExpanded] = useState(false);
  // Units: profile setting if present, else device region (US -> miles).
  // Tapping distance or pace flips it for this summary.
  const [unitSystem, setUnitSystem] = useState(units || defaultUnitsFromLocale());
  const toggleUnits = () => setUnitSystem((u) => (u === 'metric' ? 'imperial' : 'metric'));

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

  const isMetric = unitSystem === 'metric';
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
            <TouchableOpacity
              style={styles.mapContainer}
              activeOpacity={0.85}
              onPress={() => setMapExpanded(true)}
              accessibilityLabel="Open full-screen route map"
            >
              <MapView
                style={styles.map}
                initialRegion={mapRegion}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                pointerEvents="none"
              >
                <DeviationPolylines
                  route={summary.route}
                  points={summary.points}
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
              <View style={styles.mapHint}>
                <Text style={styles.mapHintText}>TAP TO EXPLORE</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* FORGE-010: what the route colors mean (only when they're shown) */}
          {hasRoute && buildRouteSegments(summary.points).length > 0 && (
            <View style={styles.deviationLegend}>
              {[
                { bucket: 'on', label: 'ON ±2%' },
                { bucket: 'near', label: '2–5%' },
                { bucket: 'off', label: '>5%' },
                { bucket: 'unknown', label: 'NO DATA' },
              ].map((item) => (
                <View key={item.bucket} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: DEVIATION_COLORS[item.bucket] }]} />
                  <Text style={styles.legendText}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* FORGE-010: cadence over time (hidden when no recorded points) */}
          <CadenceChart points={summary.points} />

          {/* Overall Stats */}
          {/* 3 x 3 stat grid (Andy, 10/9): even rows/columns. '--' keeps the
              grid square when a stat is unavailable (no GPS, legacy run). */}
          {(() => {
            const elevM = computeElevationGain(summary.points);
            const elev = elevM == null ? '--' : (isMetric ? `${elevM}` : `${Math.round(elevM * 3.28084)}`);
            const drift = computeCadenceDrift(summary.points);
            const steps = estimateSteps(summary.measuredAvgCadence, summary.duration);
            const legacy = summary.measuredAvgCadence == null && summary.targetAvgCadence == null;
            const cells = [
              { value: distanceValue || '--', label: distanceUnit.toUpperCase(), onPress: toggleUnits },
              { value: formatDuration(summary.duration), label: 'DURATION' },
              { value: distanceValue && avgPaceSeconds > 0 ? formatPace(avgPaceSeconds) : '--', label: `PACE ${paceUnit}`, onPress: toggleUnits },
              { value: legacy ? (summary.avgCadence || '--') : (summary.measuredAvgCadence ?? '--'), label: legacy ? 'AVG SPM' : 'MEASURED SPM' },
              { value: summary.targetAvgCadence ?? '--', label: 'TARGET SPM' },
              { value: summary.cadenceAdherencePct != null ? `${summary.cadenceAdherencePct}%` : '--', label: 'ON TARGET' },
              { value: elev, label: isMetric ? 'ELEV GAIN M' : 'ELEV GAIN FT' },
              { value: steps != null ? steps.toLocaleString() : '--', label: 'STEPS (EST)' },
              { value: drift == null ? '--' : `${drift > 0 ? '+' : ''}${drift}`, label: 'SPM DRIFT' },
            ];
            const rows = [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)];
            return (
              <View style={styles.statsGrid}>
                {rows.map((row, r) => (
                  <View key={r} style={styles.statRow}>
                    {row.map((c) => {
                      const Cell = c.onPress ? TouchableOpacity : View;
                      return (
                        <Cell key={c.label} style={styles.statCard} onPress={c.onPress}>
                          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
                          <Text style={styles.statLabel} numberOfLines={1}>{c.label}</Text>
                        </Cell>
                      );
                    })}
                  </View>
                ))}
                <Text style={styles.unitHint}>Tap distance or pace to switch km / mi</Text>
              </View>
            );
          })()}

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
                        {split.measuredCadence ?? split.avgCadence} SPM
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

          {/* FORGE-010: per-phase table — only when the target actually
              changed (interval/fartlek). Steady runs show nothing here. */}
          {(() => {
            // Workout modes only (ticket): terrain adjustments on a free run
            // change the target too, and must not masquerade as phases.
            if (summary.mode === 'free run') return null;
            const phases = buildIntervalTable(summary.points);
            if (phases.length < 2) return null;
            return (
              <View style={styles.splitsSection}>
                <Text style={styles.sectionTitle}>PHASES</Text>
                <View style={styles.splitsTable}>
                  <View style={styles.splitsHeader}>
                    <Text style={[styles.splitHeaderText, styles.phaseCol1]}>#</Text>
                    <Text style={[styles.splitHeaderText, styles.phaseCol2]}>TARGET</Text>
                    <Text style={[styles.splitHeaderText, styles.phaseCol3]}>ACTUAL</Text>
                    <Text style={[styles.splitHeaderText, styles.phaseCol4]}>ON TGT</Text>
                  </View>
                  {phases.map((ph) => (
                    <View key={ph.phase} style={styles.splitRow}>
                      <Text style={[styles.splitText, styles.phaseCol1]}>{ph.phase}</Text>
                      <Text style={[styles.splitText, styles.phaseCol2]}>{ph.target}</Text>
                      <Text style={[styles.splitText, styles.phaseCol3]}>{ph.avgMeasured ?? '--'}</Text>
                      <Text style={[styles.splitText, styles.phaseCol4]}>
                        {ph.pctOnTarget != null ? `${ph.pctOnTarget}%` : '--'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>DONE</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Full-screen interactive map (Andy, 10/9): pan / zoom / rotate, and
          tap a dot to see measured vs target cadence at that point. */}
      {hasRoute && mapRegion && (
        <Modal visible={mapExpanded} animationType="slide" onRequestClose={() => setMapExpanded(false)}>
          <View style={styles.fullMapContainer}>
            <MapView style={styles.fullMap} initialRegion={mapRegion}>
              <DeviationPolylines route={summary.route} points={summary.points} strokeWidth={5} />
              <Marker coordinate={summary.route[0]} title="Start" pinColor="green" />
              <Marker coordinate={summary.route[summary.route.length - 1]} title="Finish" pinColor="red" />
              {pickCadenceMarkers(summary.points).map((p, i) => (
                <Marker
                  key={`cad-${i}`}
                  coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                  title={p.measuredCadence ? `${p.measuredCadence} spm measured` : 'No step data here'}
                  description={p.targetCadence ? `Target ${p.targetCadence} spm` : undefined}
                  pinColor="#FF9500"
                />
              ))}
            </MapView>
            <TouchableOpacity style={styles.fullMapClose} onPress={() => setMapExpanded(false)}>
              <Text style={styles.fullMapCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
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
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
  },
  statCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#000',
    marginBottom: 8,
  },
  chartSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  deviationLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: -8,
    marginBottom: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendSolid: {
    width: 18,
    height: 3,
    backgroundColor: '#000',
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.5,
  },
  noMeasuredNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    lineHeight: 17,
  },
  phaseCol1: { width: '12%' },
  phaseCol2: { width: '30%' },
  phaseCol3: { width: '30%' },
  phaseCol4: { width: '28%', textAlign: 'right' },
  unitHint: {
    fontSize: 11,
    color: '#BBB',
    textAlign: 'center',
    marginTop: 6,
  },
  mapHint: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  mapHintText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  fullMapContainer: {
    flex: 1,
  },
  fullMap: {
    flex: 1,
  },
  fullMapClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullMapCloseText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  statValue: {
    fontSize: 26,
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
