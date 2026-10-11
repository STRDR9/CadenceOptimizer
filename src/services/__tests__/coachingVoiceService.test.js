// Tests for CoachingVoiceService voice selection (FORGE-014): the pure
// quality-tier ranking (Premium > Enhanced > compact), the en-US / natural-name
// preferences, the expo-speech "Premium reported as Default" trap, and the
// service wiring that exposes the selection for workout_started analytics.

import CoachingVoiceServiceSingleton, {
  CoachingVoiceService,
  voiceQualityTier,
  scoreVoice,
  pickBestVoice,
  PREFERRED_VOICE_NAMES,
} from '../CoachingVoiceService';

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(),
}));

const { getAvailableVoicesAsync } = require('expo-speech');

const voice = (identifier, name, quality, language = 'en-US') => ({
  identifier,
  name,
  quality,
  language,
});

// Realistic iOS voice list entries
const COMPACT_SAMANTHA = voice('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'Default');
const COMPACT_FRED = voice('com.apple.voice.compact.en-US.Fred', 'Fred', 'Default');
const ENHANCED_AVA = voice('com.apple.voice.enhanced.en-US.Ava', 'Ava', 'Enhanced');
const ENHANCED_DANIEL_GB = voice('com.apple.voice.enhanced.en-GB.Daniel', 'Daniel', 'Enhanced', 'en-GB');
// The expo-speech trap: Premium exists on-device but the enum only models
// Default/Enhanced, so quality can come back 'Default' for a Premium voice.
const PREMIUM_ZOE_MISLABELED = voice('com.apple.voice.premium.en-US.Zoe', 'Zoe', 'Default');
const ELOQUENCE_EDDY = voice('com.apple.eloquence.en-US.Eddy', 'Eddy', 'Default');
const NOVELTY_BELLS = voice('com.apple.speech.synthesis.voice.Bells', 'Bells', 'Default');
const FRENCH_AMELIE = voice('com.apple.voice.compact.fr-CA.Amelie', 'Amélie', 'Default', 'fr-CA');

describe('voiceQualityTier (pure)', () => {
  test('detects premium from the identifier even when quality says Default', () => {
    expect(voiceQualityTier(PREMIUM_ZOE_MISLABELED)).toBe('premium');
  });

  test('detects enhanced from quality field or identifier', () => {
    expect(voiceQualityTier(ENHANCED_AVA)).toBe('enhanced');
    expect(voiceQualityTier(voice('com.apple.voice.enhanced.en-US.Allison', 'Allison', 'Default'))).toBe('enhanced');
  });

  test('compact voices are default tier; null is safe', () => {
    expect(voiceQualityTier(COMPACT_SAMANTHA)).toBe('default');
    expect(voiceQualityTier(null)).toBe('default');
  });
});

describe('scoreVoice (pure)', () => {
  test('non-English voices are never pickable', () => {
    expect(scoreVoice(FRENCH_AMELIE)).toBe(-Infinity);
    expect(scoreVoice(voice('x', 'x', 'Default', ''))).toBe(-Infinity);
    expect(scoreVoice(null)).toBe(-Infinity);
  });

  test('quality tier dominates language and name preferences', () => {
    // en-GB Enhanced must still beat the preferred-name en-US compact
    expect(scoreVoice(ENHANCED_DANIEL_GB)).toBeGreaterThan(scoreVoice(COMPACT_SAMANTHA));
    expect(scoreVoice(PREMIUM_ZOE_MISLABELED)).toBeGreaterThan(scoreVoice(ENHANCED_AVA));
  });

  test('within a tier: en-US beats other English, preferred name beats unlisted', () => {
    expect(scoreVoice(COMPACT_SAMANTHA)).toBeGreaterThan(
      scoreVoice(voice('com.apple.voice.compact.en-GB.Kate', 'Kate', 'Default', 'en-GB'))
    );
    expect(scoreVoice(COMPACT_SAMANTHA)).toBeGreaterThan(scoreVoice(COMPACT_FRED));
  });

  test('name bonus can never jump a quality band', () => {
    const bestNameBonus = PREFERRED_VOICE_NAMES.length;
    expect(bestNameBonus).toBeLessThan(100);
  });

  test('known-robotic families rank below every normal voice', () => {
    expect(scoreVoice(ELOQUENCE_EDDY)).toBeLessThan(scoreVoice(COMPACT_FRED));
    expect(scoreVoice(NOVELTY_BELLS)).toBeLessThan(scoreVoice(COMPACT_FRED));
    // ...but stay finite: pickable when literally nothing else is English
    expect(scoreVoice(ELOQUENCE_EDDY)).toBeGreaterThan(-Infinity);
  });
});

describe('pickBestVoice (pure)', () => {
  test('Premium > Enhanced > compact, regardless of listing order', () => {
    expect(
      pickBestVoice([COMPACT_SAMANTHA, PREMIUM_ZOE_MISLABELED, ENHANCED_AVA])
    ).toBe(PREMIUM_ZOE_MISLABELED);
    expect(pickBestVoice([COMPACT_SAMANTHA, ENHANCED_AVA])).toBe(ENHANCED_AVA);
  });

  test('the old-bug scenario: compact Samantha listed first no longer wins over Enhanced', () => {
    // Pre-FORGE-014 the hardcoded preferred list picked compact Samantha here.
    expect(pickBestVoice([COMPACT_SAMANTHA, ENHANCED_AVA])).toBe(ENHANCED_AVA);
  });

  test('all-compact device: preferred natural name wins', () => {
    expect(pickBestVoice([COMPACT_FRED, COMPACT_SAMANTHA, NOVELTY_BELLS, ELOQUENCE_EDDY])).toBe(
      COMPACT_SAMANTHA
    );
  });

  test('no usable voice → null (system default)', () => {
    expect(pickBestVoice([])).toBeNull();
    expect(pickBestVoice([FRENCH_AMELIE])).toBeNull();
    expect(pickBestVoice(undefined)).toBeNull();
  });

  test('ties keep the first listed voice (stable)', () => {
    const twinA = voice('com.apple.voice.compact.en-US.Fred', 'Fred', 'Default');
    const twinB = voice('com.apple.voice.compact.en-US.Grandpa', 'Grandpa', 'Default');
    expect(pickBestVoice([twinA, twinB])).toBe(twinA);
  });
});

describe('CoachingVoiceService selection wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('selectBestVoice stores identifier + quality + name for analytics', async () => {
    getAvailableVoicesAsync.mockResolvedValue([COMPACT_SAMANTHA, PREMIUM_ZOE_MISLABELED]);
    const service = new CoachingVoiceService();
    await service.selectBestVoice();

    expect(service.getSelectedVoiceInfo()).toEqual({
      identifier: 'com.apple.voice.premium.en-US.Zoe',
      quality: 'premium',
      name: 'Zoe',
    });
    expect(service.getStatus().voice).toBe('com.apple.voice.premium.en-US.Zoe');
    expect(service.getStatus().voiceQuality).toBe('premium');
  });

  test('voice listing unavailable → nulls (iOS system default), never throws', async () => {
    getAvailableVoicesAsync.mockRejectedValue(new Error('no voices'));
    const service = new CoachingVoiceService();
    await service.selectBestVoice();

    expect(service.getSelectedVoiceInfo()).toEqual({ identifier: null, quality: null, name: null });
    expect(service.getStatus().voice).toBe('Default');
    expect(service.getStatus().voiceQuality).toBeNull();
  });

  test('no English voice installed → system default, not a bad pick', async () => {
    getAvailableVoicesAsync.mockResolvedValue([FRENCH_AMELIE]);
    const service = new CoachingVoiceService();
    await service.selectBestVoice();
    expect(service.getSelectedVoiceInfo().identifier).toBeNull();
  });

  test('singleton exports the service with selection defaults unset', () => {
    expect(CoachingVoiceServiceSingleton.getSelectedVoiceInfo()).toEqual({
      identifier: null,
      quality: null,
      name: null,
    });
  });
});
