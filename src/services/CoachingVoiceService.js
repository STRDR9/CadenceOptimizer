// Coaching Voice Service
// Handles text-to-speech for workout coaching

import { speak, stop, getAvailableVoicesAsync } from 'expo-speech';

// ---------------------------------------------------------------------------
// Voice selection (FORGE-014). Pure + exported so jest can cover the ranking.
//
// iOS ships three quality tiers of system voice: compact (the robotic
// default), Enhanced, and Premium (near-human, downloadable). The old
// selection hardcoded compact identifiers FIRST, so devices with better
// voices installed still got the robotic one. Rank quality first instead.
// ---------------------------------------------------------------------------

// Natural-sounding female en-US system voices, best first. Matched by name
// (and identifier) substring, case-insensitive, as a tie-breaker WITHIN a
// quality tier — never across tiers.
export const PREFERRED_VOICE_NAMES = ['zoe', 'ava', 'samantha', 'allison', 'susan', 'nicky'];

/**
 * Classify a voice's quality tier: 'premium' | 'enhanced' | 'default'.
 * Checks the identifier substring FIRST (com.apple.voice.premium.en-US.Zoe)
 * because expo-speech's quality enum only models Default/Enhanced — a
 * Premium voice can come back quality 'Default' and must still outrank.
 */
export function voiceQualityTier(voice) {
  if (!voice) return 'default';
  const id = String(voice.identifier || '').toLowerCase();
  const quality = String(voice.quality || '').toLowerCase();
  if (id.includes('.premium.') || quality === 'premium') return 'premium';
  if (id.includes('.enhanced.') || quality === 'enhanced') return 'enhanced';
  return 'default';
}

const QUALITY_SCORE = { premium: 300, enhanced: 200, default: 100 };

/**
 * Score one voice. Higher wins; -Infinity means "never pick" (non-English).
 * Quality tier dominates (100-point bands), then en-US > other English,
 * then the natural-name preference (max +6, can't cross a band).
 * Known-robotic families (Eloquence, super-compact, the novelty
 * com.apple.speech.synthesis voices like Bells/Bad News) are pushed below
 * every normal voice but stay pickable if literally nothing else is English.
 */
export function scoreVoice(voice) {
  if (!voice || !voice.identifier) return -Infinity;
  const id = String(voice.identifier).toLowerCase();
  const language = String(voice.language || '').replace('_', '-');
  if (!language.toLowerCase().startsWith('en')) return -Infinity;

  let score = QUALITY_SCORE[voiceQualityTier(voice)];
  score += language === 'en-US' ? 40 : 20;

  const name = String(voice.name || '').toLowerCase();
  const nameIndex = PREFERRED_VOICE_NAMES.findIndex(
    (n) => name.includes(n) || id.includes(`.${n}`) || id.endsWith(n)
  );
  if (nameIndex >= 0) score += PREFERRED_VOICE_NAMES.length - nameIndex;

  if (
    id.includes('eloquence') ||
    id.includes('super-compact') ||
    id.includes('speech.synthesis.voice')
  ) {
    score -= 150;
  }

  return score;
}

/**
 * Pick the best installed voice from an expo-speech voice list.
 * Returns the winning voice object, or null (= let iOS use its default).
 * Ties keep the first listed voice (stable).
 */
export function pickBestVoice(voices) {
  if (!Array.isArray(voices)) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const score = scoreVoice(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return bestScore === -Infinity ? null : best;
}

export class CoachingVoiceService {
  constructor() {
    this.isEnabled = true;
    // FORGE-014: 0.9 (was 0.95) — a touch slower reads less synthetic,
    // especially on compact voices. Wording is untouched by ticket rule.
    this.rate = 0.9;
    this.pitch = 1.0;
    this.volume = 0.9; // Slightly louder
    this.isInitialized = false;
    this.speechQueue = [];
    this.isSpeaking = false;
    // F8 ducking lifecycle. onSpeechStart fires once when a speech chain begins,
    // onSpeechEnd once when the whole queue has drained — so a run of cues ducks
    // the metronome once and restores once (no per-cue restore-then-reduck).
    this.onSpeechStart = null;
    this.onSpeechEnd = null;
    this.duckActive = false;
    this.platform = 'mobile'; // Default to mobile since we're using expo-speech
    this.voice = null; // identifier of the best available voice (null = system default)
    this.voiceQuality = null; // 'premium' | 'enhanced' | 'default' for the selected voice
    this.voiceName = null; // human-readable name of the selected voice
  }

  /**
   * Initialize the speech synthesis
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Test if speak function is available
      if (speak && typeof speak === 'function') {
        // Try to get available voices and select the best one
        await this.selectBestVoice();
        this.isInitialized = true;
      } else {
        this.platform = 'fallback';
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('Failed to initialize CoachingVoiceService:', error);
      this.platform = 'fallback';
      this.isInitialized = true;
    }
  }

  /**
   * Select the best available voice
   */
  async selectBestVoice() {
    try {
      if (getAvailableVoicesAsync && typeof getAvailableVoicesAsync === 'function') {
        const voices = await getAvailableVoicesAsync();
        const best = pickBestVoice(voices);
        if (best) {
          this.voice = best.identifier;
          this.voiceQuality = voiceQualityTier(best);
          this.voiceName = best.name || null;
        }
      }
    } catch (_error) {
      // Could not get available voices, using default
    }
  }

  /**
   * What voice this device will actually coach with (FORGE-014) — logged on
   * workout_started so analytics can say which quality tier users really get.
   * identifier null = iOS system default (selection unavailable/failed).
   */
  getSelectedVoiceInfo() {
    return {
      identifier: this.voice || null,
      quality: this.voice ? this.voiceQuality : null,
      name: this.voice ? this.voiceName : null,
    };
  }

  /**
   * Speak a coaching message
   * @param {string} message - Message to speak
   * @param {Object} options - Speech options
   */
  async speak(message, options = {}) {
    if (!this.isEnabled || !message) {
      return;
    }

    await this.initialize();

    const speechOptions = {
      rate: options.rate || this.rate,
      pitch: options.pitch || this.pitch,
      volume: options.volume || this.volume,
      priority: options.priority || 'normal', // low, normal, high, urgent
      interrupt: options.interrupt || false,
    };

    // Handle interruption
    if (speechOptions.interrupt && this.isSpeaking) {
      this.stopSpeaking();
    }

    // Add to queue or speak immediately
    if (speechOptions.priority === 'urgent' || !this.isSpeaking) {
      await this.speakNow(message, speechOptions);
    } else {
      this.speechQueue.push({ message, options: speechOptions });
      this.processQueue();
    }
  }

  /**
   * Speak message immediately
   * @param {string} message - Message to speak
   * @param {Object} options - Speech options
   */
  async speakNow(message, options) {
    // Entering a speech chain (or continuing one) — duck now if not already.
    this._beginDuck();
    this.isSpeaking = true;

    try {
      if (this.platform === 'mobile' && speak && typeof speak === 'function') {
        await this.speakMobile(message, options);
      } else {
        // Fallback - nothing spoken; free this slot and let the queue drain
        // (also ends the duck if the queue is now empty).
        this.isSpeaking = false;
        this.processQueue();
      }
    } catch (error) {
      console.error('[FARTLEK] Error speaking message:', error);
      this.isSpeaking = false;
      this.processQueue();
    }
  }

  /**
   * Speak using Expo Speech
   * @param {string} message - Message to speak
   * @param {Object} options - Speech options
   */
  async speakMobile(message, options) {
    try {
      const speechOptions = {
        language: 'en-US',
        pitch: options.pitch || this.pitch,
        rate: options.rate || this.rate,
        volume: options.volume || this.volume,
        onDone: () => {
          this.isSpeaking = false;
          this.processQueue();
        },
        onError: (error) => {
          console.error('[FARTLEK] Mobile speech error:', error);
          this.isSpeaking = false;
          this.processQueue();
        }
      };
      
      // Add voice if we have one selected
      if (this.voice) {
        speechOptions.voice = this.voice;
      }
      
      speak(message, speechOptions);
    } catch (error) {
      console.error('[FARTLEK] Error with mobile speech:', error);
      this.isSpeaking = false;
      this.processQueue();
    }
  }

  /**
   * Process the speech queue
   */
  processQueue() {
    if (this.isSpeaking) return;
    if (this.speechQueue.length === 0) {
      // Whole chain finished — restore the metronome.
      this._endDuck();
      return;
    }

    const next = this.speechQueue.shift();
    this.speakNow(next.message, next.options);
  }

  /**
   * Register metronome-ducking callbacks (F8). onStart fires when a coaching
   * cue starts speaking; onEnd fires when speech (incl. any queued cues) fully
   * finishes. Kept as injected handlers so this service stays decoupled from
   * the metronome.
   */
  setDuckHandlers({ onStart = null, onEnd = null } = {}) {
    this.onSpeechStart = onStart;
    this.onSpeechEnd = onEnd;
  }

  _beginDuck() {
    if (this.duckActive) return;
    this.duckActive = true;
    try {
      if (this.onSpeechStart) this.onSpeechStart();
    } catch (error) {
      console.error('Duck onStart handler failed:', error);
    }
  }

  _endDuck() {
    if (!this.duckActive) return;
    this.duckActive = false;
    try {
      if (this.onSpeechEnd) this.onSpeechEnd();
    } catch (error) {
      console.error('Duck onEnd handler failed:', error);
    }
  }

  /**
   * Stop current speech
   */
  stopSpeaking() {
    try {
      if (stop && typeof stop === 'function') {
        stop();
      }
      
      this.isSpeaking = false;
      this.speechQueue = [];
      this._endDuck(); // restore metronome if we were ducked
    } catch (error) {
      console.error('Error stopping speech:', error);
      this.isSpeaking = false;
      this.speechQueue = [];
      this._endDuck();
    }
  }

  /**
   * Set voice enabled/disabled
   * @param {boolean} enabled - Whether voice is enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stopSpeaking();
    }
  }

  /**
   * Set voice parameters
   * @param {Object} params - Voice parameters
   */
  setVoiceParameters(params) {
    if (params.rate !== undefined) this.rate = Math.max(0.1, Math.min(2.0, params.rate));
    if (params.pitch !== undefined) this.pitch = Math.max(0.1, Math.min(2.0, params.pitch));
    if (params.volume !== undefined) this.volume = Math.max(0, Math.min(1, params.volume));
  }

  /**
   * Get available voices (not supported on mobile)
   * @returns {Array} Available voices
   */
  getAvailableVoices() {
    return [];
  }

  /**
   * Set specific voice (not supported on mobile)
   * @param {Object} voice - Voice object
   */
  setVoice(voice) {
    // Not supported on mobile
  }

  /**
   * Speak workout-specific messages with appropriate tone
   * @param {Object} cue - Coaching cue object
   */
  async speakCoachingCue(cue) {
    if (!cue || !cue.message) {
      return;
    }

    const options = {
      interrupt: cue.priority === 'urgent',
      priority: cue.priority,
    };

    // Adjust voice parameters based on cue type for more natural delivery
    switch (cue.type) {
      case 'motivation':
        // Energetic and encouraging. FORGE-014: was 1.05/1.05 — pushing a
        // synthetic voice faster AND higher is the single biggest "robot
        // tell"; keep the energy in volume, not speed/pitch.
        options.rate = 1.0;
        options.pitch = 1.02;
        options.volume = 1.0;
        break;
      case 'instruction':
        // Clear and authoritative
        options.rate = 0.9;
        options.pitch = 1.0;
        options.volume = 0.95;
        break;
      case 'guidance':
        // Calm and supportive
        options.rate = 0.85;
        options.pitch = 0.95;
        options.volume = 0.85;
        break;
      case 'technique':
        // Focused and precise
        options.rate = 0.88;
        options.pitch = 1.0;
        options.volume = 0.9;
        break;
      default:
        // Neutral delivery (matches the FORGE-014 base rate)
        options.rate = 0.9;
        options.pitch = 1.0;
        options.volume = 0.9;
    }

    await this.speak(cue.message, options);
  }

  /**
   * Get current status
   * @returns {Object} Current status
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isSpeaking: this.isSpeaking,
      platform: this.platform,
      queueLength: this.speechQueue.length,
      voice: this.voice || 'Default',
      voiceQuality: this.voice ? this.voiceQuality : null,
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
    };
  }
}

// Singleton instance
export default new CoachingVoiceService();