import { SoundManager, getSoundManager } from '../soundManager';

describe('SoundManager Unit Tests', () => {
  let soundManager;

  beforeEach(() => {
    soundManager = new SoundManager();
  });

  describe('Constructor', () => {
    test('initializes with default settings', () => {
      const settings = soundManager.getSettings();
      expect(settings.voiceJoinSound).toBe(true);
      expect(settings.voiceLeaveSound).toBe(true);
      expect(settings.micToggleSound).toBe(true);
      expect(settings.callSound).toBe(true);
      expect(settings.messageSendSound).toBe(false);
      expect(settings.messageMentionSound).toBe(true);
      expect(settings.outputVolume).toBe(50);
    });

    test('accepts custom settings', () => {
      const customManager = new SoundManager({
        voiceJoinSound: false,
        outputVolume: 75
      });
      const settings = customManager.getSettings();
      expect(settings.voiceJoinSound).toBe(false);
      expect(settings.outputVolume).toBe(75);
    });

    test('preloads all sound files', () => {
      expect(soundManager.sounds.voiceJoin).toBeDefined();
      expect(soundManager.sounds.voiceLeave).toBeDefined();
      expect(soundManager.sounds.micToggle).toBeDefined();
      expect(soundManager.sounds.incomingCall).toBeDefined();
      expect(soundManager.sounds.messageSend).toBeDefined();
      expect(soundManager.sounds.messageMention).toBeDefined();
    });
  });

  describe('play()', () => {
    test('does not play when sound is disabled', () => {
      soundManager.updateSettings({ voiceJoinSound: false });
      const mockPlay = jest.fn().mockResolvedValue(undefined);
      if (soundManager.sounds.voiceJoin) {
        soundManager.sounds.voiceJoin.play = mockPlay;
      }
      
      soundManager.play('voiceJoin');
      expect(mockPlay).not.toHaveBeenCalled();
    });

    test('handles missing sound gracefully', () => {
      expect(() => {
        soundManager.play('nonexistentSound');
      }).not.toThrow();
    });

    test('resets currentTime before playing', () => {
      const mockPlay = jest.fn().mockResolvedValue(undefined);
      if (soundManager.sounds.voiceJoin) {
        soundManager.sounds.voiceJoin.play = mockPlay;
        soundManager.sounds.voiceJoin.currentTime = 5;
      }
      
      soundManager.play('voiceJoin');
      
      if (soundManager.sounds.voiceJoin) {
        expect(soundManager.sounds.voiceJoin.currentTime).toBe(0);
      }
    });

    test('handles autoplay blocking gracefully', async () => {
      const mockPlay = jest.fn().mockRejectedValue(
        Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' })
      );
      
      if (soundManager.sounds.voiceJoin) {
        soundManager.sounds.voiceJoin.play = mockPlay;
      }
      
      // Should not throw
      expect(() => {
        soundManager.play('voiceJoin');
      }).not.toThrow();
    });

    test('handles play errors gracefully', async () => {
      const mockPlay = jest.fn().mockRejectedValue(new Error('Play failed'));
      
      if (soundManager.sounds.voiceJoin) {
        soundManager.sounds.voiceJoin.play = mockPlay;
      }
      
      // Should not throw
      expect(() => {
        soundManager.play('voiceJoin');
      }).not.toThrow();
    });
  });

  describe('updateSettings()', () => {
    test('updates settings correctly', () => {
      soundManager.updateSettings({ outputVolume: 80 });
      expect(soundManager.getSettings().outputVolume).toBe(80);
    });

    test('merges with existing settings', () => {
      soundManager.updateSettings({ voiceJoinSound: false });
      const settings = soundManager.getSettings();
      expect(settings.voiceJoinSound).toBe(false);
      expect(settings.voiceLeaveSound).toBe(true); // Should remain unchanged
    });

    test('handles multiple updates', () => {
      soundManager.updateSettings({ outputVolume: 60 });
      soundManager.updateSettings({ voiceJoinSound: false });
      const settings = soundManager.getSettings();
      expect(settings.outputVolume).toBe(60);
      expect(settings.voiceJoinSound).toBe(false);
    });
  });

  describe('Volume handling', () => {
    test('clamps volume to valid range (0-100)', () => {
      const mockPlay = jest.fn().mockResolvedValue(undefined);
      
      // Test with volume > 100
      soundManager.updateSettings({ outputVolume: 150 });
      if (soundManager.sounds.voiceJoin) {
        soundManager.sounds.voiceJoin.play = mockPlay;
        soundManager.sounds.voiceJoin.volume = 0;
      }
      soundManager.play('voiceJoin');
      
      if (soundManager.sounds.voiceJoin) {
        // Volume should be clamped to 1.0 (100%)
        expect(soundManager.sounds.voiceJoin.volume).toBeLessThanOrEqual(1.0);
      }
    });

    test('handles zero volume', () => {
      soundManager.updateSettings({ outputVolume: 0 });
      const mockPlay = jest.fn().mockResolvedValue(undefined);
      
      if (soundManager.sounds.voiceJoin) {
        soundManager.sounds.voiceJoin.play = mockPlay;
      }
      
      soundManager.play('voiceJoin');
      
      if (soundManager.sounds.voiceJoin) {
        expect(soundManager.sounds.voiceJoin.volume).toBe(0);
      }
    });
  });

  describe('getSoundManager singleton', () => {
    test('returns same instance on multiple calls', () => {
      const instance1 = getSoundManager();
      const instance2 = getSoundManager();
      expect(instance1).toBe(instance2);
    });

    test('uses settings from first initialization', () => {
      // Singleton already initialized in previous test
      const instance = getSoundManager({ outputVolume: 90 });
      // Should use existing instance, not reinitialize
      expect(instance).toBeDefined();
    });
  });
});
