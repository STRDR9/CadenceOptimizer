// STRDR Analytics Service
// User-behavior + performance tracking. Events are stored locally AND
// transmitted to PostHog via plain fetch (no SDK / no native module).
//
// SETUP (one time): create a free PostHog project and paste the Project API
// key into POSTHOG_KEY below. Until a key is set, transmission is a silent
// no-op and events still buffer locally (getAnalyticsSummary()).

import AsyncStorage from '@react-native-async-storage/async-storage';

const POSTHOG_KEY = 'phc_knowFcyv6pGN8zWwk3GVBPWFEASfCje6oTS7WXmcxyE5';
const POSTHOG_HOST = 'https://us.i.posthog.com';
const USER_ID_KEY = '@analytics_user_id';
const OPTOUT_KEY = '@analytics_optout';

class AnalyticsService {
  constructor() {
    this.events = [];
    this.sessionStart = Date.now();
    this.userId = this.generateUserId(); // temp until initialize() loads persisted id
    this.optedOut = false;
  }

  // Load (or create) a STABLE per-install id + opt-out pref. Call once at startup.
  async initialize() {
    try {
      let id = await AsyncStorage.getItem(USER_ID_KEY);
      if (!id) {
        id = this.generateUserId();
        await AsyncStorage.setItem(USER_ID_KEY, id);
      }
      this.userId = id;
      this.optedOut = (await AsyncStorage.getItem(OPTOUT_KEY)) === '1';
    } catch {
      // keep temporary id; fail open (not opted out)
    }
  }

  async setOptOut(value) {
    this.optedOut = !!value;
    try {
      await AsyncStorage.setItem(OPTOUT_KEY, value ? '1' : '0');
    } catch {
      // ignore
    }
  }

  generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
  }

  // Track user events
  track(eventName, properties = {}) {
    const event = {
      event: eventName,
      properties: {
        ...properties,
        userId: this.userId,
        timestamp: Date.now(),
        sessionId: this.sessionStart
      }
    };

    this.events.push(event);

    // Buffer locally (getAnalyticsSummary) AND transmit to PostHog.
    this.storeEvent(event);
    this.send(event);
  }

  // Transmit to PostHog (fire-and-forget). Never throws, never blocks the UI.
  send(event) {
    if (!POSTHOG_KEY || this.optedOut) return;
    (async () => {
      try {
        await fetch(`${POSTHOG_HOST}/capture/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: POSTHOG_KEY,
            event: event.event,
            distinct_id: event.properties?.userId || this.userId,
            properties: { ...event.properties, $lib: 'strdr-fetch' },
            timestamp: new Date().toISOString(),
          }),
        });
      } catch {
        // Analytics must never break the app.
      }
    })();
  }

  // Store events locally
  async storeEvent(event) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const existingEvents = await AsyncStorage.getItem('analytics_events');
      const events = existingEvents ? JSON.parse(existingEvents) : [];
      events.push(event);
      
      // Keep only last 100 events to avoid storage bloat
      if (events.length > 100) {
        events.splice(0, events.length - 100);
      }
      
      await AsyncStorage.setItem('analytics_events', JSON.stringify(events));
    } catch (error) {
      // Storage error - silently ignore
    }
  }

  // Screen tracking
  trackScreen(screenName) {
    this.track('screen_view', { screen: screenName });
  }

  // Feature usage tracking
  trackFeatureUsage(feature, action, metadata = {}) {
    this.track('feature_usage', {
      feature,
      action,
      ...metadata
    });
  }

  // Performance tracking
  trackPerformance(operation, duration, success = true) {
    this.track('performance', {
      operation,
      duration,
      success
    });
  }

  // Error tracking
  trackError(error, context = '') {
    this.track('error', {
      error: error.message || error,
      stack: error.stack,
      context
    });
  }

  // User actions
  trackUserAction(action, details = {}) {
    this.track('user_action', {
      action,
      ...details
    });
  }

  // Get analytics summary
  async getAnalyticsSummary() {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const events = await AsyncStorage.getItem('analytics_events');
      return events ? JSON.parse(events) : [];
    } catch (error) {
      return [];
    }
  }
}

// Create singleton instance
const analytics = new AnalyticsService();

export default analytics;