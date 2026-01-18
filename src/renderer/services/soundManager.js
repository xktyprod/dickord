/**
 * Sound Manager Service
 */
export class SoundManager {
  constructor() {
    this.sounds = {};
    this.volume = 1;
    this.settings = {};
    this.outputDevice = 'default';
    
    // Preload sounds - use relative paths for Electron build compatibility
    this.preloadSound('voiceJoin', './sounds/voice-join.mp3');
    this.preloadSound('voiceLeave', './sounds/voice-leave.mp3');
    this.preloadSound('micMute', './sounds/mic_off.mp3');
    this.preloadSound('micUnmute', './sounds/mic_on.mp3');
    this.preloadSound('soundMute', './sounds/sound_off.mp3');
    this.preloadSound('soundUnmute', './sounds/sound_on.mp3');
    this.preloadSound('incomingCall', './sounds/incoming-call.mp3');
    this.preloadSound('message', './sounds/message.mp3');
    this.preloadSound('screenShareStart', './sounds/demo_on.mp3');
    this.preloadSound('screenShareEnd', './sounds/demo_off.mp3');
  }
  
  preloadSound(name, src, fallbackSrc = null) {
    try {
      const audio = new Audio();
      audio.src = src;
      audio.preload = 'auto';
      audio.volume = this.volume;
      
      // If main source fails, try fallback
      if (fallbackSrc) {
        audio.onerror = () => {
          console.log(`Sound ${name} not found at ${src}, trying fallback`);
          audio.src = fallbackSrc;
        };
      }
      
      this.sounds[name] = audio;
    } catch (err) {
      console.warn(`Failed to preload ${name}:`, err);
    }
  }
  
  play(soundType) {
    // Check settings for specific sound types
    if (soundType === 'message' && !this.settings.messageSound) {
      return;
    }
    if (soundType === 'incomingCall' && !this.settings.callSound) {
      return;
    }
    
    const sound = this.sounds[soundType];
    if (!sound) {
      console.warn('Sound ' + soundType + ' not found');
      return;
    }
    
    try {
      // Clone audio to allow overlapping plays
      const clone = sound.cloneNode();
      clone.volume = this.volume;
      
      // Apply output device
      if (clone.setSinkId && this.outputDevice && this.outputDevice !== 'default') {
        clone.setSinkId(this.outputDevice).catch(err => {
          console.warn('Failed to set output device for sound:', err);
        });
      }
      
      clone.play().catch(() => {
        // Ignore autoplay errors
      });
    } catch (err) {
      console.warn('Error playing ' + soundType + ':', err);
    }
  }
  
  // Play incoming call sound in a loop
  playIncomingCall() {
    if (!this.settings.callSound) {
      return null;
    }
    
    const sound = this.sounds['incomingCall'];
    if (!sound) {
      console.warn('Incoming call sound not found');
      return null;
    }
    
    try {
      const clone = sound.cloneNode();
      clone.volume = this.volume;
      clone.loop = true;
      
      // Apply output device
      if (clone.setSinkId && this.outputDevice && this.outputDevice !== 'default') {
        clone.setSinkId(this.outputDevice).catch(err => {
          console.warn('Failed to set output device for incoming call:', err);
        });
      }
      
      clone.play().catch(() => {});
      return clone; // Return so caller can stop it
    } catch (err) {
      console.warn('Error playing incoming call:', err);
      return null;
    }
  }
  
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol / 100));
  }
  
  updateSettings(settings) {
    this.settings = settings || {};
    if (settings?.outputVolume !== undefined) {
      this.setVolume(settings.outputVolume);
    }
    if (settings?.outputDevice !== undefined) {
      this.outputDevice = settings.outputDevice;
    }
  }
}

let instance = null;

export const getSoundManager = () => {
  if (!instance) {
    instance = new SoundManager();
  }
  return instance;
};

export default SoundManager;
