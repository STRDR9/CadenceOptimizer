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

  // Search tracks by BPM range
  async searchByBPM(targetBPM, tolerance = 3, limit = 30) {
    // Search for energetic/running tracks
    const queries = [
      'running workout',
      'high energy',
      'workout motivation',
      'running mix',
      'cardio',
    ];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const data = await this.apiRequest(
      `${SPOTIFY_CONFIG.endpoints.api}/search?q=${encodeURIComponent(query)}&type=track&limit=50`
    );

    if (!data.tracks?.items?.length) return [];

    // Get audio features (BPM) for all tracks
    const trackIds = data.tracks.items.map(t => t.id).join(',');
    const features = await this.apiRequest(
      `${SPOTIFY_CONFIG.endpoints.api}/audio-features?ids=${trackIds}`
    );

    if (!features.audio_features) return [];

    // Match tracks to target BPM
    const minBPM = targetBPM - tolerance;
    const maxBPM = targetBPM + tolerance;
    // Also check half-time (some tracks report double BPM)
    const minHalf = (targetBPM / 2) - tolerance;
    const maxHalf = (targetBPM / 2) + tolerance;

    const matched = [];
    for (let i = 0; i < data.tracks.items.length; i++) {
      const track = data.tracks.items[i];
      const af = features.audio_features[i];
      if (!af) continue;

      const tempo = Math.round(af.tempo);
      const isMatch = (tempo >= minBPM && tempo <= maxBPM);
      const isHalfMatch = (tempo >= minHalf && tempo <= maxHalf);

      if (isMatch || isHalfMatch) {
        matched.push({
          id: track.id,
          uri: track.uri,
          name: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album: track.album.name,
          albumArt: track.album.images?.[1]?.url || track.album.images?.[0]?.url,
          bpm: isHalfMatch ? tempo * 2 : tempo,
          duration: track.duration_ms,
          previewUrl: track.preview_url,
        });
      }
    }

    return matched.sort((a, b) => {
      const diffA = Math.abs(a.bpm - targetBPM);
      const diffB = Math.abs(b.bpm - targetBPM);
      return diffA - diffB;
    }).slice(0, limit);
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
