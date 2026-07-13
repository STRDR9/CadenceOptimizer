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

  // Pull a pool of the user's OWN tracks: top tracks (short/medium/long term)
  // plus saved/liked tracks. Uses the user-top-read + user-library-read scopes
  // the app already requests. Deduped by track id, normalized to our shape.
  async gatherUserTracks(maxTracks = 200) {
    const byId = new Map();
    const addTrack = (t) => {
      if (!t || !t.id || byId.has(t.id)) return;
      byId.set(t.id, {
        id: t.id,
        uri: t.uri,
        name: t.name,
        artist: t.artists?.map(a => a.name).join(', ') || 'Unknown',
        album: t.album?.name || '',
        albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url,
        duration: t.duration_ms,
      });
    };

    // Top tracks: items are full track objects.
    const topRanges = ['short_term', 'medium_term', 'long_term'];
    for (const range of topRanges) {
      if (byId.size >= maxTracks) break;
      try {
        const data = await this.apiRequest(
          `${SPOTIFY_CONFIG.endpoints.api}/me/top/tracks?limit=50&time_range=${range}`
        );
        for (const t of data?.items || []) addTrack(t);
      } catch (e) {
        // scope/endpoint may be unavailable; keep going
      }
    }

    // Saved tracks: items are wrapped as { added_at, track }.
    if (byId.size < maxTracks) {
      try {
        const data = await this.apiRequest(
          `${SPOTIFY_CONFIG.endpoints.api}/me/tracks?limit=50`
        );
        for (const item of data?.items || []) addTrack(item?.track);
      } catch (e) {
        // ignore
      }
    }

    return Array.from(byId.values());
  }

  // Look up real tempo (BPM) for Spotify track ids via ReccoBeats — a free,
  // credential-less mirror of the audio-features data Spotify cut off for new
  // apps in Nov 2024. Returns Map<spotifyId, tempo>. ReccoBeats caps a batch
  // at 40 ids and returns results keyed by its own id, so we map back via the
  // Spotify track url in each result's `href`.
  async fetchTempos(ids) {
    const tempoById = new Map();
    const CHUNK = 40;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      try {
        const res = await fetch(
          `https://api.reccobeats.com/v1/audio-features?ids=${batch.join(',')}`,
          { headers: { Accept: 'application/json' } }
        );
        const data = await res.json();
        for (const feat of data?.content || []) {
          const match = /track\/([A-Za-z0-9]+)/.exec(feat?.href || '');
          if (match && typeof feat.tempo === 'number') {
            tempoById.set(match[1], feat.tempo);
          }
        }
      } catch (e) {
        // skip this batch; partial results are still useful
      }
    }
    return tempoById;
  }

  // Find cadence-matched songs from the user's OWN library. Spotify killed
  // /audio-features, /recommendations, and editorial-playlist access for new
  // apps (Nov 2024), so we no longer harvest strangers' BPM-named playlists.
  // Instead: gather the user's top + saved tracks, get each one's real tempo
  // from ReccoBeats, and keep the ones near the target — either directly, or
  // at half tempo (a 170 SPM runner can also run to an 85 BPM track at 2 steps
  // per beat). Returns closest matches first, in the same shape as before.
  async searchByBPM(targetBPM, tolerance = 3, limit = 30) {
    const tracks = await this.gatherUserTracks(200);
    if (tracks.length === 0) return [];

    const tempoById = await this.fetchTempos(tracks.map(t => t.id));
    const half = targetBPM / 2;
    const matches = [];

    for (const t of tracks) {
      const tempo = tempoById.get(t.id);
      if (typeof tempo !== 'number' || tempo <= 0) continue;

      const directDist = Math.abs(tempo - targetBPM);
      const halfDist = Math.abs(tempo - half);

      if (directDist <= tolerance) {
        matches.push({ ...t, bpm: Math.round(tempo), matchSource: 'exact', _dist: directDist });
      } else if (halfDist <= tolerance) {
        matches.push({ ...t, bpm: Math.round(tempo), matchSource: 'half-tempo', _dist: halfDist });
      }
    }

    matches.sort((a, b) => a._dist - b._dist);
    return matches.slice(0, limit).map(({ _dist, ...t }) => t);
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
