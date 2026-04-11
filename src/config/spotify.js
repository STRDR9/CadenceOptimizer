// Spotify Configuration

import { makeRedirectUri } from 'expo-auth-session';

const redirectUri = makeRedirectUri({
  scheme: 'com.strdr.app',
  path: 'spotify-auth',
});

export const SPOTIFY_CONFIG = {
  enabled: true,
  clientId: 'c81959636d4c4351ab016cba56a5d581',
  redirectUri,

  scopes: [
    'user-read-private',
    'user-read-email',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read',
    'user-top-read',
  ],

  endpoints: {
    auth: 'https://accounts.spotify.com/authorize',
    token: 'https://accounts.spotify.com/api/token',
    api: 'https://api.spotify.com/v1',
  },
};
