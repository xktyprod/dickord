import fc from 'fast-check';
import { SoundManager } from '../soundManager';

describe('SoundManager Property-Based Tests', () => {
  // Feature: discord-improvements, Property 1: Sound settings are respected
  test('sound settings are respected', () => {
    fc.assert(
      fc.property(
        fc.record({
          soundType: fc.constantFrom('voiceJoin', 'voiceLeave', 'micToggle', 'incomingCall', 'messageSend', 'messageMention'),
          enabled: fc.boolean(),
          outputVolume: fc.integer({ min: 0, max: 100 })
        }),
        (config) => {
          const settings = {
            [`${config.soundType}Sound`]: config.enabled,
            outputVolume: config.outputVolume
          };
          
          const soundManager = new SoundManager(settings);
          
          // Mock the sound's play method
          const mockPlay = jest.fn().mockResolvedValue(undefined);
          if (soundManager.sounds[config.soundType]) {
            soundManager.sounds[config.soundType].play = mockPlay;
          }
          
          soundManager.play(config.soundType);
          
          // Property: Sound should play if and only if enabled
          if (config.enabled && soundManager.sounds[config.soundType]) {
            expect(mockPlay).toHaveBeenCalled();
          } else {
            expect(mockPlay).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: discord-improvements, Property 2: Sound volume is applied
  test('sound volume is applied correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          soundType: fc.constantFrom('voiceJoin', 'voiceLeave', 'micToggle', 'incomingCall', 'messageSend', 'messageMention'),
          outputVolume: fc.integer({ min: 0, max: 100 })
        }),
        (config) => {
          const settings = {
            [`${config.soundType}Sound`]: true,
            outputVolume: config.outputVolume
          };
          
          const soundManager = new SoundManager(settings);
          
          // Mock the sound
          const mockPlay = jest.fn().mockResolvedValue(undefined);
          if (soundManager.sounds[config.soundType]) {
            soundManager.sounds[config.soundType].play = mockPlay;
            soundManager.sounds[config.soundType].volume = 0;
          }
          
          soundManager.play(config.soundType);
          
          // Property: Volume should be set to outputVolume / 100
          if (soundManager.sounds[config.soundType]) {
            const expectedVolume = config.outputVolume / 100;
            expect(soundManager.sounds[config.soundType].volume).toBeCloseTo(expectedVolume, 2);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Additional property: Settings update preserves other settings
  test('updateSettings preserves unmodified settings', () => {
    fc.assert(
      fc.property(
        fc.record({
          initial: fc.record({
            voiceJoinSound: fc.boolean(),
            outputVolume: fc.integer({ min: 0, max: 100 })
          }),
          update: fc.record({
            voiceLeaveSound: fc.boolean()
          })
        }),
        (config) => {
          const soundManager = new SoundManager(config.initial);
          const initialVolume = soundManager.getSettings().outputVolume;
          
          soundManager.updateSettings(config.update);
          
          // Property: Unmodified settings should remain unchanged
          expect(soundManager.getSettings().outputVolume).toBe(initialVolume);
          expect(soundManager.getSettings().voiceLeaveSound).toBe(config.update.voiceLeaveSound);
        }
      ),
      { numRuns: 100 }
    );
  });
});
