// Spotify Playlist Builder
// Search by BPM, preview tracks, build and save playlists

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import SpotifyService from '../services/SpotifyService';

function formatDuration(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SpotifyPlaylistBuilder({ visible, onClose, targetCadence = 170 }) {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [playlist, setPlaylist] = useState([]);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (visible) {
      checkConnection();
    }
  }, [visible]);

  const checkConnection = async () => {
    await SpotifyService.initialize();
    const connected = SpotifyService.isAuthenticated();
    setIsConnected(connected);
    if (connected && SpotifyService.userProfile) {
      setUserName(SpotifyService.userProfile.display_name || '');
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const success = await SpotifyService.authenticate();
      setIsConnected(success);
      if (success && SpotifyService.userProfile) {
        setUserName(SpotifyService.userProfile.display_name || '');
      }
    } catch (error) {
      Alert.alert('Connection Failed', 'Could not connect to Spotify. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      const results = await SpotifyService.searchByBPM(targetCadence, 3, 30);
      setSearchResults(results);
    } catch (error) {
      Alert.alert('Search Error', 'Could not search Spotify. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleTrack = (track) => {
    const exists = playlist.find(t => t.id === track.id);
    if (exists) {
      setPlaylist(playlist.filter(t => t.id !== track.id));
    } else {
      setPlaylist([...playlist, track]);
    }
  };

  const isInPlaylist = (trackId) => playlist.some(t => t.id === trackId);

  const handleSave = async () => {
    if (playlist.length === 0) {
      Alert.alert('Empty Playlist', 'Add some tracks first.');
      return;
    }

    setSaving(true);
    try {
      const name = `STRDR ${targetCadence} BPM`;
      const uris = playlist.map(t => t.uri);
      const created = await SpotifyService.createPlaylist(name, uris);
      Alert.alert(
        'Playlist Saved!',
        `"${name}" with ${playlist.length} tracks has been saved to your Spotify.`,
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (error) {
      Alert.alert('Save Error', 'Could not save playlist. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    await SpotifyService.logout();
    setIsConnected(false);
    setUserName('');
    setSearchResults([]);
    setHasSearched(false);
    setPlaylist([]);
  };

  const totalDuration = playlist.reduce((sum, t) => sum + t.duration, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>MUSIC</Text>
          <View style={styles.closeButton} />
        </View>

        {!isConnected ? (
          // Connect to Spotify
          <View style={styles.connectContainer}>
            <Text style={styles.connectIcon}>🎵</Text>
            <Text style={styles.connectTitle}>Connect Spotify</Text>
            <Text style={styles.connectDesc}>
              Find songs that match your {targetCadence} BPM cadence and build a running playlist.
            </Text>
            <TouchableOpacity
              style={styles.connectButton}
              onPress={handleConnect}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.connectButtonText}>CONNECT TO SPOTIFY</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          // Playlist Builder
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* User Info & Search */}
            <View style={styles.userBar}>
              <Text style={styles.userText}>Connected as {userName}</Text>
              <TouchableOpacity onPress={handleDisconnect}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchSection}>
              <Text style={styles.bpmLabel}>TARGET: {targetCadence} BPM</Text>
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearch}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.searchButtonText}>FIND MATCHING SONGS</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Playlist Summary */}
            {playlist.length > 0 && (
              <View style={styles.playlistSummary}>
                <View style={styles.playlistInfo}>
                  <Text style={styles.playlistCount}>{playlist.length} tracks</Text>
                  <Text style={styles.playlistDuration}>{formatDuration(totalDuration)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>SAVE TO SPOTIFY</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Empty state — only after a search has been attempted */}
            {hasSearched && !loading && searchResults.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No tracks found</Text>
                <Text style={styles.emptyDesc}>
                  None of your top or saved Spotify tracks land near {targetCadence} BPM. Try adjusting your cadence in the metronome and search again, or like more songs on Spotify to widen the pool.
                </Text>
              </View>
            )}

            {/* Search Results */}
            {searchResults.map((track) => (
              <TouchableOpacity
                key={track.id}
                style={[styles.trackRow, isInPlaylist(track.id) && styles.trackRowSelected]}
                onPress={() => toggleTrack(track)}
                activeOpacity={0.7}
              >
                {track.albumArt && (
                  <Image source={{ uri: track.albumArt }} style={styles.albumArt} />
                )}
                <View style={styles.trackInfo}>
                  <Text style={styles.trackName} numberOfLines={1}>{track.name}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
                  {track.matchSource === 'half-tempo' && (
                    <Text style={styles.matchHint}>2 steps per beat</Text>
                  )}
                  {track.matchSource === 'running-curated' && (
                    <Text style={styles.matchHint}>From a running playlist</Text>
                  )}
                </View>
                <View style={styles.trackMeta}>
                  <Text style={styles.trackBPM}>{track.bpm}</Text>
                  <Text style={styles.trackBPMLabel}>BPM</Text>
                </View>
                <View style={[styles.addIndicator, isInPlaylist(track.id) && styles.addIndicatorActive]}>
                  <Text style={styles.addIndicatorText}>
                    {isInPlaylist(track.id) ? '✓' : '+'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
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
  connectContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  connectIcon: {
    fontSize: 48,
    marginBottom: 20,
  },
  connectTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000',
    marginBottom: 12,
  },
  connectDesc: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  connectButton: {
    backgroundColor: '#1DB954',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 30,
    minWidth: 240,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  userBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8F8F8',
  },
  userText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  disconnectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },
  searchSection: {
    padding: 20,
    alignItems: 'center',
  },
  bpmLabel: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#000',
    marginBottom: 16,
  },
  searchButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  playlistSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#000',
    borderRadius: 12,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistCount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  playlistDuration: {
    fontSize: 13,
    color: '#CCC',
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#1DB954',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  trackRowSelected: {
    backgroundColor: '#F0FFF4',
  },
  albumArt: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: '#E5E5E5',
  },
  trackInfo: {
    flex: 1,
    marginRight: 12,
  },
  trackName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  trackArtist: {
    fontSize: 13,
    color: '#666',
  },
  matchHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1DB954',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  emptyState: {
    paddingHorizontal: 32,
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  trackMeta: {
    alignItems: 'center',
    marginRight: 12,
  },
  trackBPM: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000',
  },
  trackBPMLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.5,
  },
  addIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addIndicatorActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  addIndicatorText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#999',
  },
});
