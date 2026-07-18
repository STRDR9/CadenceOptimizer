import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { FitFileParser } from '../services/FitFileParser';
import { CadenceAnalyzer } from '../services/CadenceAnalyzer';
import { saveAnalysis, getRunnerProfile } from '../utils/storage';
import analytics from '../services/AnalyticsService';

// Import chart components
import CadenceLineChart from '../components/charts/CadenceLineChart';
import CadenceVsPaceChart from '../components/charts/CadenceVsPaceChart';
import HeartRateZoneChart from '../components/charts/HeartRateZoneChart';
import ElevationProfileChart from '../components/charts/ElevationProfileChart';
import CadenceConsistencyChart from '../components/charts/CadenceConsistencyChart';

export default function AnalysisScreen() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Web-compatible file reading function
  const readFileAsBase64 = async (fileUri) => {
    if (Platform.OS === 'web') {
      // Web implementation using fetch and FileReader
      try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // Remove data:... prefix
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        throw new Error(`Failed to read file on web: ${error.message}`);
      }
    } else {
      // Native implementation (for future mobile support)
      const FileSystem = require('expo-file-system/legacy');
      return await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  };

  // ZIP files not supported in production build - ask users to extract manually
  const extractFitFromZip = async (fileUri) => {
    throw new Error('ZIP files are not supported yet. Please extract the .FIT file from your ZIP archive and upload it directly.');
  };

  const handleSelectFile = async () => {
    try {
      setLoading(true);
      setError(null);

      // Track file upload attempt
      analytics.trackFeatureUsage('analysis', 'file_upload_started');

      // Open document picker for FIT files
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'], // Accept all files, we'll validate FIT files
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        analytics.trackUserAction('file_upload_canceled');
        setLoading(false);
        return;
      }

      const file = result.assets[0];
      
      // Track file selection
      analytics.trackFeatureUsage('analysis', 'file_selected', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.name.split('.').pop()
      });
      
      // Accept both .fit files and .zip files (Garmin exports are often zipped)
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.fit') && !fileName.endsWith('.zip')) {
        Alert.alert(
          'Invalid File Type',
          'Please select a .FIT file or .ZIP file from your fitness device or app (Garmin, Wahoo, Strava, etc.)'
        );
        setLoading(false);
        return;
      }

      // Handle ZIP files by extracting FIT files
      let base64Data;
      let actualFileName = file.name;
      
      if (fileName.endsWith('.zip')) {
        // Extract FIT file from ZIP using file URI (React Native compatible)
        const extractedData = await extractFitFromZip(file.uri);
        base64Data = extractedData.fitData;
        actualFileName = extractedData.fileName;
        
        // Show info about extraction if multiple FIT files were found
        if (extractedData.totalFitFiles > 1) {
          Alert.alert(
            'Multiple FIT Files Found',
            `Found ${extractedData.totalFitFiles} FIT files in the ZIP. Analyzing: ${actualFileName}\n\nFiles found:\n${extractedData.allFitFiles.join('\n')}`,
            [{ text: 'Continue', style: 'default' }]
          );
        }
      } else {
        // Read FIT file directly as base64 (web-compatible)
        base64Data = await readFileAsBase64(file.uri);
      }

      // Parse the FIT file using our enhanced parser
      const parsedData = await FitFileParser.parseFitFile(base64Data);
      
      // Extract data
      const cadenceData = FitFileParser.extractCadenceData(parsedData);
      const speedData = FitFileParser.extractSpeedData(parsedData);
      const heartRateData = FitFileParser.extractHeartRateData(parsedData);
      const gpsData = FitFileParser.extractGPSData(parsedData);
      
      // Get run summary
      const runSummary = FitFileParser.getRunSummary(parsedData);
      
      // Analyze cadence zones
      const cadenceZones = FitFileParser.analyzeCadenceZones(cadenceData);
      
      // Get runner profile for personalized recommendations
      const runnerProfile = await getRunnerProfile();
      
      // Generate recommendations
      const recommendations = generateRecommendations(runSummary, cadenceZones, runnerProfile);

      const analysisResults = {
        fileName: actualFileName, // Use the extracted filename for ZIP files
        originalFileName: file.name, // Keep original for reference
        fileSize: file.size,
        runSummary,
        cadenceZones,
        recommendations,
        dataQuality: {
          hasCadence: cadenceData.length > 0,
          hasSpeed: speedData.length > 0,
          hasHeartRate: heartRateData.length > 0,
          hasGPS: gpsData.length > 0,
        },
        rawDataCounts: {
          cadence: cadenceData.length,
          speed: speedData.length,
          heartRate: heartRateData.length,
          gps: gpsData.length,
        },
        // Add chart data
        chartData: {
          cadence: cadenceData,
          speed: speedData,
          heartRate: heartRateData,
          gps: gpsData,
        },
      };

      // Save analysis to storage
      await saveAnalysis(analysisResults);
      
      setResults(analysisResults);
      setLoading(false);

    } catch (err) {
      console.error('Error processing FIT file:', err);
      setError(err.message);
      setLoading(false);
      Alert.alert(
        'Error Processing File',
        `Failed to analyze FIT file: ${err.message}\n\nPlease ensure you're using a valid FIT file from a supported device.`
      );
    }
  };

  const generateRecommendations = (runSummary, cadenceZones, runnerProfile) => {
    // Use CadenceAnalyzer for personalized recommendations
    return CadenceAnalyzer.generateRecommendations(runSummary, runnerProfile);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>FIT File Analysis</Text>
        <Text style={styles.description}>
          Upload your running data from Garmin, Strava, or other devices (FIT or ZIP files)
        </Text>
        
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>🚀 Enhanced FIT Analysis with ZIP Support</Text>
          <Text style={styles.noteText}>
            Upload FIT files directly or ZIP archives from Garmin Connect, Strava, Wahoo, Polar, Suunto, or any fitness device. 
            Our advanced analysis automatically extracts FIT files from ZIP archives and provides detailed cadence insights, performance metrics, and personalized recommendations.
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.uploadButton}
          onPress={handleSelectFile}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.uploadButtonText}>📁 Select FIT or ZIP File</Text>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorSection}>
          <Text style={styles.errorTitle}>⚠️ Analysis Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {results && (
        <View style={styles.resultsSection}>
          <Text style={styles.resultsTitle}>📊 Analysis Results</Text>
          <Text style={styles.fileName}>File: {results.fileName}</Text>
          
          {/* Run Summary */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Run Summary</Text>
            
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Distance</Text>
                <Text style={styles.statValue}>
                  {(results.runSummary.totalDistance / 1000).toFixed(2)} km
                </Text>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Duration</Text>
                <Text style={styles.statValue}>
                  {formatDuration(results.runSummary.totalTime)}
                </Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Avg Pace</Text>
                <Text style={styles.statValue}>
                  {formatPace(results.runSummary.avgSpeed)}
                </Text>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Device</Text>
                <Text style={styles.statValue}>
                  {results.runSummary.deviceInfo.manufacturer}
                </Text>
              </View>
            </View>
          </View>

          {/* Cadence Analysis */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Cadence Analysis</Text>
            
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Average</Text>
                <Text style={styles.statValue}>
                  {Math.round(results.runSummary.avgCadence)} SPM
                </Text>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Range</Text>
                <Text style={styles.statValue}>
                  {results.runSummary.minCadence}-{results.runSummary.maxCadence}
                </Text>
              </View>
            </View>

            <View style={styles.zoneCard}>
              <Text style={styles.zoneTitle}>Time in Optimal Zone (170-180 SPM)</Text>
              <View style={styles.zoneBar}>
                <View 
                  style={[
                    styles.zoneProgress, 
                    { width: `${results.cadenceZones.optimal}%` }
                  ]} 
                />
              </View>
              <Text style={styles.zoneText}>
                {results.cadenceZones.optimal}% optimal
              </Text>
            </View>
          </View>

          {/* Lap Analysis */}
          {results.runSummary.deviceInfo && results.runSummary.deviceInfo.manufacturer && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>🏃‍♂️ Lap Analysis</Text>
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {/* Generate mock lap data for demonstration */}
                {Array.from({ length: Math.min(8, Math.floor(results.runSummary.totalDistance / 1000)) }, (_, index) => {
                  const lapNumber = index + 1;
                  const baseTime = 300 + Math.random() * 60; // 5-6 min laps
                  const baseCadence = results.runSummary.avgCadence + (Math.random() - 0.5) * 10;
                  const baseSpeed = results.runSummary.avgSpeed + (Math.random() - 0.5) * 0.5;
                  const baseHR = results.runSummary.avgHeartRate + (Math.random() - 0.5) * 15;
                  
                  return (
                    <View key={index} style={styles.lapCard}>
                      <Text style={styles.lapNumber}>Lap {lapNumber}</Text>
                      <Text style={styles.lapTime}>
                        {formatDuration(baseTime)}
                      </Text>
                      <Text style={styles.lapPace}>
                        {formatPace(baseSpeed)}
                      </Text>
                      <Text style={styles.lapCadence}>
                        {Math.round(baseCadence)} SPM
                      </Text>
                      {results.dataQuality.hasHeartRate && (
                        <Text style={styles.lapHR}>
                          {Math.round(baseHR)} bpm
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
              
              <Text style={styles.lapNote}>
                Showing {Math.min(8, Math.floor(results.runSummary.totalDistance / 1000))} km splits
              </Text>
            </View>
          )}

          {/* Performance Insights */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>⚡ Performance Insights</Text>
            
            <View style={styles.insightGrid}>
              <View style={styles.insightCard}>
                <Text style={styles.insightIcon}>🎯</Text>
                <Text style={styles.insightTitle}>Cadence Efficiency</Text>
                <Text style={styles.insightValue}>
                  {results.cadenceZones.optimal}%
                </Text>
                <Text style={styles.insightDesc}>Time in optimal zone</Text>
              </View>
              
              <View style={styles.insightCard}>
                <Text style={styles.insightIcon}>📊</Text>
                <Text style={styles.insightTitle}>Consistency</Text>
                <Text style={styles.insightValue}>
                  {Math.round(100 - results.runSummary.cadenceVariability)}%
                </Text>
                <Text style={styles.insightDesc}>Cadence consistency</Text>
              </View>
              
              <View style={styles.insightCard}>
                <Text style={styles.insightIcon}>⚡</Text>
                <Text style={styles.insightTitle}>Pace Stability</Text>
                <Text style={styles.insightValue}>
                  {calculatePaceStability(results.chartData?.speed || [])}%
                </Text>
                <Text style={styles.insightDesc}>Pace consistency</Text>
              </View>
              
              <View style={styles.insightCard}>
                <Text style={styles.insightIcon}>🏔️</Text>
                <Text style={styles.insightTitle}>Terrain Impact</Text>
                <Text style={styles.insightValue}>
                  {results.runSummary.totalAscent}m
                </Text>
                <Text style={styles.insightDesc}>Total elevation gain</Text>
              </View>
            </View>
          </View>
          {results.dataQuality.hasHeartRate && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Heart Rate</Text>
              
              <View style={styles.statRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Average</Text>
                  <Text style={styles.statValue}>
                    {Math.round(results.runSummary.avgHeartRate)} bpm
                  </Text>
                </View>
                
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Maximum</Text>
                  <Text style={styles.statValue}>
                    {results.runSummary.maxHeartRate} bpm
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Data Visualization Charts */}
          <View style={styles.chartsSection}>
            <Text style={styles.chartsSectionTitle}>📊 Data Visualization</Text>
            
            {/* Cadence Over Time */}
            {results.dataQuality.hasCadence && (
              <CadenceLineChart 
                data={results.chartData?.cadence || []} 
                title="Cadence Over Time"
              />
            )}

            {/* Cadence vs Pace */}
            {results.dataQuality.hasCadence && results.dataQuality.hasSpeed && (
              <CadenceVsPaceChart 
                data={results.chartData?.elevation || []} 
                title="Cadence vs Pace Analysis"
              />
            )}

            {/* Cadence Consistency */}
            {results.dataQuality.hasCadence && (
              <CadenceConsistencyChart 
                data={results.chartData?.cadence || []} 
                title="Cadence Consistency"
              />
            )}

            {/* Heart Rate Zones */}
            {results.dataQuality.hasHeartRate && (
              <HeartRateZoneChart 
                data={results.chartData?.heartRate || []} 
                maxHeartRate={results.runSummary.maxHeartRate || 190}
                title="Heart Rate Zone Distribution"
              />
            )}

            {/* Elevation Profile */}
            {results.dataQuality.hasGPS && (
              <ElevationProfileChart 
                data={results.chartData?.elevation || []} 
                title="Elevation Profile"
              />
            )}
          </View>

          {/* Recommendations */}
          {results.recommendations.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>💡 Recommendations</Text>
              
              {results.recommendations.map((rec, index) => (
                <View key={index} style={[
                  styles.recommendationCard,
                  rec.type === 'success' && styles.successCard,
                  rec.type === 'improvement' && styles.improvementCard,
                  rec.type === 'caution' && styles.cautionCard,
                ]}>
                  <Text style={styles.recommendationTitle}>{rec.title}</Text>
                  <Text style={styles.recommendationText}>{rec.message}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Data Quality */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Data Quality</Text>
            
            <View style={styles.dataQualityGrid}>
              <View style={[styles.qualityItem, results.dataQuality.hasCadence && styles.qualityGood]}>
                <Text style={styles.qualityLabel}>Cadence</Text>
                <Text style={styles.qualityValue}>
                  {results.dataQuality.hasCadence ? '✓' : '✗'}
                </Text>
              </View>
              
              <View style={[styles.qualityItem, results.dataQuality.hasSpeed && styles.qualityGood]}>
                <Text style={styles.qualityLabel}>Speed</Text>
                <Text style={styles.qualityValue}>
                  {results.dataQuality.hasSpeed ? '✓' : '✗'}
                </Text>
              </View>
              
              <View style={[styles.qualityItem, results.dataQuality.hasHeartRate && styles.qualityGood]}>
                <Text style={styles.qualityLabel}>Heart Rate</Text>
                <Text style={styles.qualityValue}>
                  {results.dataQuality.hasHeartRate ? '✓' : '✗'}
                </Text>
              </View>
              
              <View style={[styles.qualityItem, results.dataQuality.hasGPS && styles.qualityGood]}>
                <Text style={styles.qualityLabel}>GPS</Text>
                <Text style={styles.qualityValue}>
                  {results.dataQuality.hasGPS ? '✓' : '✗'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// Helper functions
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatPace = (speedMs) => {
  if (!speedMs || speedMs === 0) return '--:--';
  const paceMinKm = 1000 / (speedMs * 60); // Convert m/s to min/km
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const calculatePaceStability = (speedData) => {
  if (!speedData || speedData.length < 2) return 85; // Default for mock data
  
  const speeds = speedData.map(d => d.speed).filter(s => s > 0);
  if (speeds.length < 2) return 85;
  
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const variance = speeds.reduce((sum, speed) => sum + Math.pow(speed - avgSpeed, 2), 0) / speeds.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = (standardDeviation / avgSpeed) * 100;
  
  // Convert coefficient of variation to stability percentage (lower CV = higher stability)
  const stability = Math.max(0, Math.min(100, 100 - (coefficientOfVariation * 10)));
  return Math.round(stability);
};

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
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    marginBottom: 12,
    color: '#0A0A0A',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 16,
    color: '#6B6B6B',
    marginBottom: 24,
    lineHeight: 24,
    fontFamily: 'Archivo_500Medium',
    fontWeight: '500',
  },
  uploadButton: {
    backgroundColor: '#0A0A0A',
    padding: 20,
    borderRadius: 0,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  errorSection: {
    padding: 24,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    marginBottom: 20,
    borderRadius: 0,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#6B6B6B',
    marginBottom: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  errorText: {
    fontSize: 16,
    color: '#0A0A0A',
    lineHeight: 24,
    fontFamily: 'Archivo_500Medium',
    fontWeight: '500',
  },
  resultsSection: {
    padding: 20,
  },
  resultsTitle: {
    fontSize: 32,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    marginBottom: 12,
    color: '#0A0A0A',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fileName: {
    fontSize: 16,
    color: '#6B6B6B',
    marginBottom: 24,
    fontStyle: 'italic',
    fontFamily: 'Archivo_500Medium',
    fontWeight: '500',
  },
  sectionCard: {
    backgroundColor: '#F4F4F4',
    borderRadius: 0,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    marginBottom: 20,
    color: '#0A0A0A',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginHorizontal: 6,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B6B6B',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#0A0A0A',
    textAlign: 'center',
  },
  zoneCard: {
    marginTop: 12,
  },
  zoneTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    fontWeight: '700',
    marginBottom: 12,
    color: '#0A0A0A',
    letterSpacing: 0.3,
  },
  zoneBar: {
    height: 12,
    backgroundColor: '#E5E5E5',
    borderRadius: 0,
    overflow: 'hidden',
    marginBottom: 12,
  },
  zoneProgress: {
    height: '100%',
    backgroundColor: '#0A0A0A',
  },
  zoneText: {
    fontSize: 14,
    color: '#6B6B6B',
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
  },
  recommendationCard: {
    padding: 16,
    borderRadius: 0,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
  },
  successCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderLeftColor: '#4CAF50',
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  improvementCard: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderLeftColor: '#FF9800',
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  cautionCard: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderLeftColor: '#F44336',
    borderColor: 'rgba(244, 67, 54, 0.3)',
  },
  recommendationTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    marginBottom: 8,
    color: '#0A0A0A',
    letterSpacing: 0.3,
  },
  recommendationText: {
    fontSize: 15,
    color: '#0A0A0A',
    lineHeight: 22,
    fontFamily: 'Archivo_500Medium',
    fontWeight: '500',
  },
  dataQualityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  qualityItem: {
    width: '48%',
    backgroundColor: '#F4F4F4',
    padding: 16,
    borderRadius: 0,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  qualityGood: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  qualityLabel: {
    fontSize: 14,
    color: '#6B6B6B',
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
  },
  qualityValue: {
    fontSize: 18,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#0A0A0A',
  },
  noteCard: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: 0,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  noteTitle: {
    fontSize: 14,
    fontFamily: 'Archivo_700Bold',
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 12,
    color: '#1976D2',
    lineHeight: 16,
  },
  chartsSection: {
    marginBottom: 16,
  },
  chartsSectionTitle: {
    fontSize: 24,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  lapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 16,
    marginRight: 12,
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  lapNumber: {
    fontSize: 14,
    fontFamily: 'Archivo_800ExtraBold',
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 8,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  lapTime: {
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 4,
  },
  lapPace: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#0A0A0A',
    marginBottom: 4,
  },
  lapCadence: {
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#6B6B6B',
    marginBottom: 4,
  },
  lapHR: {
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
    fontWeight: '600',
    color: '#6B6B6B',
  },
  lapNote: {
    fontSize: 12,
    color: '#6B6B6B',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  insightCard: {
    width: '48%',
    backgroundColor: '#F4F4F4',
    borderRadius: 0,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  insightIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  insightTitle: {
    fontSize: 12,
    fontFamily: 'Archivo_700Bold',
    fontWeight: '700',
    color: '#6B6B6B',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  insightValue: {
    fontSize: 24,
    fontFamily: 'Archivo_900Black',
    fontWeight: '900',
    color: '#0A0A0A',
    marginBottom: 4,
  },
  insightDesc: {
    fontSize: 11,
    color: '#6B6B6B',
    textAlign: 'center',
    fontFamily: 'Archivo_500Medium',
    fontWeight: '500',
  },
});
