// Metronome Service
// Sample-accurate metronome using react-native-audio-api (Web Audio engine).
// Clicks are SCHEDULED ahead on the audio clock — gapless, drift-free, and keeps
// playing when the screen is locked / backgrounded. Layers over music.

import { AudioContext, AudioManager } from 'react-native-audio-api';

const CLICK_MS = 22;          // click length
const LOOKAHEAD_MS = 25;      // how often the scheduler timer runs
const SCHEDULE_AHEAD = 0.2;   // seconds of clicks queued ahead (covers JS jitter/background)

export class MetronomeService {
  constructor() {
    this.isPlaying = false;
    this.timerId = null;
    this.currentBeat = 0;
    this.bpm = 170;
    this.soundType = 'click';
    this.volume = 0.8;
    this.audioEnabled = true;
    this.isInitialized = false;
    this.ctx = null;
    this.clickBuffer = null;
    this.accentBuffer = null;
    this.nextNoteTime = 0;
    this.onBeat = null;
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      // iOS: playback category + mixWithOthers => background audio AND layers over music.
      try {
        AudioManager.setAudioSessionOptions({
          iosCategory: 'playback',
          iosMode: 'default',
          iosOptions: ['mixWithOthers'],
        });
        AudioManager.setAudioSessionActivity(true);
      } catch (e) {
        // Non-iOS or unavailable — safe to ignore.
      }

      this.ctx = new AudioContext();
      this.clickBuffer = this.makeClick(1000);  // normal beat
      this.accentBuffer = this.makeClick(1400); // accent (reserved; not used by default)
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize MetronomeService:', error);
    }
  }

  // Build a short sine click with a linear attack/decay envelope (no pop).
  makeClick(frequency) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor((sr * CLICK_MS) / 1000);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.min(i, len - i) / (len / 2);
      data[i] = Math.sin((2 * Math.PI * frequency * i) / sr) * 0.6 * env;
    }
    return buffer;
  }

  scheduleClick(time, isAccent) {
    const src = this.ctx.createBufferSource();
    src.buffer = isAccent ? this.accentBuffer : this.clickBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(time);
  }

  // Scheduler: queue every click due within SCHEDULE_AHEAD on the audio clock.
  tick = () => {
    if (!this.isPlaying || !this.ctx) return;
    const secondsPerBeat = 60 / this.bpm; // reads bpm live => gapless tempo changes
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      const beatTime = this.nextNoteTime;
      const beatIndex = ++this.currentBeat;
      if (this.audioEnabled) this.scheduleClick(beatTime, false);
      // Fire the UI callback roughly when the beat is heard.
      if (this.onBeat) {
        const delayMs = Math.max(0, (beatTime - this.ctx.currentTime) * 1000);
        setTimeout(() => {
          if (this.isPlaying && this.onBeat) this.onBeat(beatIndex, false);
        }, delayMs);
      }
      this.nextNoteTime += secondsPerBeat;
    }
  };

  // NOTE: start accepts optional volume + audioEnabled because MetronomeScreen
  // calls start(bpm, onBeat, volume, audioEnabled). Keeping these honored avoids
  // a regression (e.g. starting muted / with the wrong initial volume).
  async start(bpm, onBeat, volume, audioEnabled) {
    if (this.isPlaying) return;
    await this.initialize();
    if (!this.ctx) return;
    this.bpm = bpm;
    this.onBeat = onBeat;
    if (typeof volume === 'number') this.volume = Math.max(0, Math.min(1, volume));
    if (typeof audioEnabled === 'boolean') this.audioEnabled = audioEnabled;
    this.currentBeat = 0;
    this.isPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1; // small lead-in
    this.timerId = setInterval(this.tick, LOOKAHEAD_MS);
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isPlaying = false;
    this.currentBeat = 0;
  }

  // Tempo change is now trivial: scheduler reads this.bpm live, no restart, no gap.
  async updateBpm(newBpm, onBeat) {
    if (newBpm === this.bpm) return;
    this.bpm = newBpm;
    if (onBeat) this.onBeat = onBeat;
  }

  async setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  setAudioEnabled(enabled) {
    this.audioEnabled = enabled;
  }

  setSoundType(type) {
    this.soundType = type; // reserved; single click sound today
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      bpm: this.bpm,
      currentBeat: this.currentBeat,
      soundType: this.soundType,
      volume: this.volume,
      audioEnabled: this.audioEnabled,
    };
  }

  async cleanup() {
    this.stop();
    try {
      if (this.ctx) {
        await this.ctx.close();
        this.ctx = null;
      }
    } catch (e) {
      console.error('Error cleaning up audio:', e);
    }
    this.isInitialized = false;
  }
}

// Singleton instance
export default new MetronomeService();
