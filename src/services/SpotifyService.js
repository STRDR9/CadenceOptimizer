// Spotify Service
// Handles OAuth, BPM search, and playlist creation via Web API

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPOTIFY_CONFIG } from '../config/spotify';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: SPOTIFY_CONFIG.endpoints.auth,
  tokenEndpoint: SPOTIFY_CONFIG.endpoints.token,
};

function encodeFormData(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

class SpotifyService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.userProfile = null;
  }

  isEnabled() {
    return SPOTIFY_CONFIG.enabled === true;
  }

  isAuthenticated() {
    return !!this.accessToken && Date.now() < (this.tokenExpiry || 0);
  }

  async initialize() {
    try {
      const data = await AsyncStorage.getItem('@strdr_spotify_tokens');
      if (data) {
        const tokens = JSON.parse(data);
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
        this.tokenExpiry = tokens.tokenExpiry;

        if (this.accessToken && Date.now() < this.tokenExpiry) {
          await this.loadProfile();
        } else if (this.refreshToken) {
          await this.refreshAccessToken();
        }
      }
    } catch (error) {
      console.error('Spotify init error:', error);
    }
  }

  async authenticate() {
    try {
      const request = new AuthSession.AuthRequest({
        clientId: SPOTIFY_CONFIG.clientId,
        scopes: SPOTIFY_CONFIG.scopes,
        usePKCE: true,
        redirectUri: SPOTIFY_CONFIG.redirectUri,
        responseType: AuthSession.ResponseType.Code,
      });

      const result = await request.promptAsync(discovery);

      if (result.type === 'success') {
        await this.exchangeCode(result.params.code, request.codeVerifier);
        await this.loadProfile();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Spotify auth error:', error);
      return false;
    }
  }

  async exchangeCode(code, codeVerifier) {
    const response = await fetch(SPOTIFY_CONFIG.endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeFormData({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_CONFIG.redirectUri,
        client_id: SPOTIFY_CONFIG.clientId,
        code_verifier: codeVerifier,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;
      await this.saveTokens();
    }
  }

  async refreshAccessToken() {
    try {
      const response = await fetch(SPOTIFY_CONFIG.endpoints.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormData({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: SPOTIFY_CONFIG.clientId,
        }),
      });

      const data = await response.json();
      if (data.access_token) {
        this.accessToken = data.access_token;
        if (data.refresh_token) this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + data.expires_in * 1000;
        await this.saveTokens();
        await this.loadProfile();
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      this.accessToken = null;
    }
  }

  async apiRequest(url, options = {}) {
    if (!this.isAuthenticated()) {
      if (this.refreshToken) await this.refreshAccessToken();
      if (!this.isAuthenticated()) throw new Error('Not authenticated');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.apiRequest(url, options);
    }

    return response.json();
  }

  async loadProfile() {
    try {
      this.userProfile = await this.apiRequest(`${SPOTIFY_CONFIG.endpoints.api}/me`);
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  }

  // Search tracks by BPM using playlist search
  // (audio-features endpoint is deprecated for new apps since Nov 2024)
  async searchByBPM(targetBPM, tolerance = 3, limit = 30) {
      const allTracks = new Map(); // dedupe by track id

      // Strategy 1: Search for BPM-specific playlists
      const playlistQueries = [
        `${targetBPM} bpm running`,
        `${targetBPM} bpm workout`,
        `${targetBPM} bpm`,
      ];

      for (const query of playlistQueries) {
        try {
          const data = await this.apiRequest(
            `${SPOTIFY_CONFIG.endpoints.api}/search?q=${encodeURIComponent(query)}&type=playlist&limit=5`
          );

          if (data.playlists?.items) {
            for (const playlist of data.playlists.items) {
              if (!playlist?.id) continue;
              try {
                const tracks = await this.apiRequest(
                  `${SPOTIFY_CONFIG.endpoints.api}/playlists/${playlist.id}/tracks?limit=30`
                );
                if (tracks.items) {
                  for (const item of tracks.items) {
                    const track = item.track;
                    if (!track || !track.id || allTracks.has(track.id)) continue;
                    allTracks.set(track.id, {
                      id: track.id,
                      uri: track.uri,
                      name: track.name,
                      artist: track.artists?.map(a => a.name).join(', ') || 'Unknown',
                      album: track.album?.name || '',
                      albumArt: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url,
                      bpm: targetBPM, // assumed from playlist context
                      duration: track.duration_ms,
                    });
                  }
                }
              } catch (e) {
                // Skip this playlist if we can't read it
              }
              if (allTracks.size >= limit) break;
            }
          }
        } catch (e) {
          // Skip this query
        }
        if (allTracks.size >= limit) break;
      }

      // Strategy 2: Direct track search as fallback
      if (allTracks.size < 10) {
        const trackQueries = [
          `${targetBPM} bpm`,
          'running workout energy',
        ];
        for (const query of trackQueries) {
          try {
            const data = await this.apiRequest(
              `${SPOTIFY_CONFIG.endpoints.api}/search?q=${encodeURIComponent(query)}&type=track&limit=20`
            );
            if (data.tracks?.items) {
              for (const track of data.tracks.items) {
                if (!track?.id || allTracks.has(track.id)) continue;
                allTracks.set(track.id, {
                  id: track.id,
                  uri: track.uri,
                  name: track.name,
                  artist: track.artists?.map(a => a.name).join(', ') || 'Unknown',
                  album: track.album?.name || '',
                  albumArt: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url,
                  bpm: targetBPM,
                  duration: track.duration_ms,
                });
              }
            }
          } catch (e) {
            // Skip
          }
          if (allTracks.size >= limit) break;
        }
      }

      return Array.from(allTracks.values()).slice(0, limit);
    }

  // Create a playlist on the user's Spotify account
  async createPlaylist(name, trackUris) {
    if (!this.userProfile?.id) await this.loadProfile();
    if (!this.userProfile?.id) throw new Error('No user profile');

    // Create playlist
    const playlist = await this.apiRequest(
      `${SPOTIFY_CONFIG.endpoints.api}/users/${this.userProfile.id}/playlists`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: `Created by STRDR — cadence-matched running playlist`,
          public: false,
        }),
      }
    );

    // Add tracks
    if (trackUris.length > 0) {
      await this.apiRequest(
        `${SPOTIFY_CONFIG.endpoints.api}/playlists/${playlist.id}/tracks`,
        {
          method: 'POST',
          body: JSON.stringify({ uris: trackUris }),
        }
      );
    }

    return playlist;
  }

  async saveTokens() {
    await AsyncStorage.setItem('@strdr_spotify_tokens', JSON.stringify({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry,
    }));
  }

  async logout() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.userProfile = null;
    await AsyncStorage.removeItem('@strdr_spotify_tokens');
  }
}

export default new SpotifyService();
