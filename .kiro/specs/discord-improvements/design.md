# Design Document: Discord Clone Improvements

## Overview

This design document outlines the architecture and implementation approach for comprehensive improvements to the Discord Clone application. The improvements focus on eight key areas:

1. **Sound Effects System** - Audio feedback for user actions
2. **Speaking Animation System** - Visual indicators for active speakers
3. **Infinite Scroll Wheel Fix** - Seamless navigation for servers/friends
4. **Audio Settings Improvements** - Proper threshold handling (0-100%)
5. **Resizable Panels** - Customizable UI layout
6. **Voice Channel Context Menu** - User-specific actions
7. **Avatar Display System** - Profile pictures with Firebase Storage
8. **VPN Compatibility** - Improved network resilience

The application is built using Electron with React for the renderer process, Firebase for backend services (Firestore + Storage), and Agora RTC SDK for voice/video communication.

## Architecture

### Current Architecture

The application follows a layered architecture:

- **Main Process (Electron)**: Window management, IPC handlers, native OS integration
- **Renderer Process (React)**: UI components, state management, user interactions
- **Services Layer**: Firebase services (auth, firestore), Agora services (voice/video)
- **Backend**: Firebase (Firestore for data, Storage for files, Auth for users)
- **Voice Infrastructure**: Agora RTC SDK for real-time audio/video

### New Components

The improvements will add these new components:

1. **SoundManager** - Centralized audio playback service
2. **SpeakingIndicator** - Component for voice activity visualization
3. **InfiniteWheel** - Enhanced scrolling component
4. **ResizablePanel** - Draggable panel borders with size persistence
5. **ContextMenu** - Reusable right-click menu system
6. **AvatarUploader** - Firebase Storage integration for profile pictures
7. **NetworkRetry** - Connection resilience layer

## Components and Interfaces

### 1. Sound Effects System

**SoundManager Service**

```javascript
class SoundManager {
  constructor(settings) {
    this.settings = settings;
    this.sounds = {
      voiceJoin: new Audio('/sounds/voice-join.mp3'),
      voiceLeave: new Audio('/sounds/voice-leave.mp3'),
      micToggle: new Audio('/sounds/mic-toggle.mp3'),
      incomingCall: new Audio('/sounds/incoming-call.mp3'),
      messageSend: new Audio('/sounds/message-send.mp3'),
      messageMention: new Audio('/sounds/mention.mp3')
    };
  }
  
  play(soundType) {
    if (!this.settings[`${soundType}Sound`]) return;
    const sound = this.sounds[soundType];
    if (sound) {
      sound.currentTime = 0;
      sound.volume = this.settings.outputVolume / 100;
      sound.play().catch(err => console.error('Sound play error:', err));
    }
  }
  
  updateSettings(newSettings) {
    this.settings = newSettings;
  }
}
```

**Integration Points**:
- Voice channel join/leave events
- Microphone toggle actions
- Incoming call notifications
- Message send/receive events
- Settings panel for sound preferences

### 2. Speaking Animation System

**SpeakingIndicator Component**

```javascript
const SpeakingIndicator = ({ userId, isSpeaking, volume }) => {
  const intensity = Math.min(volume / 50, 1); // Normalize to 0-1
  
  return (
    <div className="speaking-indicator">
      <div 
        className={`avatar-ring ${isSpeaking ? 'speaking' : ''}`}
        style={{
          '--intensity': intensity,
          '--ring-color': `rgba(88, 101, 242, ${0.5 + intensity * 0.5})`
        }}
      />
    </div>
  );
};
```

**CSS Animation**:
```css
.avatar-ring.speaking {
  animation: pulse 1s ease-in-out infinite;
  box-shadow: 0 0 0 4px var(--ring-color);
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
}
```

**Agora Integration**:
- Use `volume-indicator` event from Agora client
- Track speaking state per user (threshold: volume > 5)
- Update component state on volume changes

### 3. Infinite Scroll Wheel Fix

**InfiniteWheel Component**

```javascript
const InfiniteWheel = ({ items, activeIndex, onItemClick, renderItem }) => {
  const [rotation, setRotation] = useState(0);
  const wheelRef = useRef(null);
  
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY;
    const itemAngle = 360 / items.length;
    
    setRotation(prev => {
      const newRotation = prev + (delta > 0 ? itemAngle : -itemAngle);
      // Normalize to 0-360 for infinite scrolling
      return ((newRotation % 360) + 360) % 360;
    });
  };
  
  const visibleItems = getVisibleItems(items, rotation);
  
  return (
    <div className="infinite-wheel" ref={wheelRef} onWheel={handleWheel}>
      {visibleItems.map((item, index) => (
        <div 
          key={item.id}
          className="wheel-item"
          style={{ transform: `rotate(${index * itemAngle}deg) translateY(-100px)` }}
          onClick={() => onItemClick(item)}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
};
```

**Algorithm**:
- Calculate item positions in circular layout
- Use modulo arithmetic for infinite wrapping
- Smooth CSS transitions for rotation
- Support both mouse wheel and touch gestures

### 4. Audio Settings Improvements

**Threshold Validation Fix**

Current issue: Audio threshold slider doesn't work properly above 50%.

**Solution**:
```javascript
const AudioThresholdSlider = ({ value, onChange }) => {
  const handleChange = (e) => {
    const newValue = parseInt(e.target.value, 10);
    // Ensure value is clamped to 0-100
    const clampedValue = Math.max(0, Math.min(100, newValue));
    onChange(clampedValue);
  };
  
  return (
    <div className="threshold-slider">
      <input 
        type="range" 
        min="0" 
        max="100" 
        value={value}
        onChange={handleChange}
      />
      <span>{value}%</span>
    </div>
  );
};
```

**Agora Integration**:
```javascript
// Apply threshold to Agora audio track
const applyAudioThreshold = async (threshold) => {
  if (!localAudioTrack) return;
  
  // Convert percentage to Agora volume level (0-100)
  const agoraThreshold = threshold;
  
  // Use Agora's setVolume method
  await localAudioTrack.setVolume(agoraThreshold);
};
```

**Persistence**:
- Save threshold to localStorage
- Restore on app startup
- Apply immediately on change

### 5. Resizable Panels

**ResizablePanel Component**

```javascript
const ResizablePanel = ({ 
  children, 
  minWidth = 200, 
  maxWidth = 600, 
  defaultWidth = 300,
  storageKey 
}) => {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  
  const handleMouseDown = (e) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };
  
  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
      setWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(storageKey, width.toString());
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, width, minWidth, maxWidth, storageKey]);
  
  return (
    <div className="resizable-panel" style={{ width: `${width}px` }}>
      {children}
      <div 
        className="resize-handle"
        onMouseDown={handleMouseDown}
        style={{ cursor: isResizing ? 'col-resize' : 'ew-resize' }}
      />
    </div>
  );
};
```

**CSS**:
```css
.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: transparent;
  cursor: ew-resize;
  transition: background 0.2s;
}

.resize-handle:hover {
  background: var(--accent);
}
```

### 6. Voice Channel Context Menu

**ContextMenu Component**

```javascript
const ContextMenu = ({ x, y, items, onClose }) => {
  const menuRef = useRef(null);
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);
  
  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {items.map((item, index) => (
        <div 
          key={index}
          className="context-menu-item"
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon && <span className="icon">{item.icon}</span>}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
};
```

**Voice Channel User Context Menu**:
```javascript
const VoiceChannelUser = ({ user, onContextMenu }) => {
  const handleRightClick = (e) => {
    e.preventDefault();
    
    const menuItems = [
      {
        label: 'Adjust Volume',
        icon: '🔊',
        onClick: () => showVolumeSlider(user.id)
      },
      {
        label: 'Open Direct Message',
        icon: '💬',
        onClick: () => openDM(user.id)
      },
      {
        label: 'Add Friend',
        icon: '👤',
        onClick: () => sendFriendRequest(user.id)
      }
    ];
    
    onContextMenu(e.clientX, e.clientY, menuItems);
  };
  
  return (
    <div className="voice-user" onContextMenu={handleRightClick}>
      {/* User display */}
    </div>
  );
};
```

### 7. Avatar Display System

**Firebase Storage Integration**

```javascript
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();

export const uploadAvatar = async (userId, file) => {
  // Validate file type
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Use PNG, JPG, or GIF.');
  }
  
  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 5MB.');
  }
  
  // Upload to Firebase Storage
  const storageRef = ref(storage, `avatars/${userId}`);
  await uploadBytes(storageRef, file);
  
  // Get download URL
  const url = await getDownloadURL(storageRef);
  
  // Update user profile in Firestore
  await updateDoc(doc(db, 'users', userId), {
    avatar: url
  });
  
  return url;
};

export const getAvatarUrl = async (userId) => {
  try {
    const storageRef = ref(storage, `avatars/${userId}`);
    return await getDownloadURL(storageRef);
  } catch (err) {
    return null; // Avatar doesn't exist
  }
};
```

**Avatar Component**

```javascript
const Avatar = ({ userId, userName, size = 40, showStatus = false }) => {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const url = await getAvatarUrl(userId);
        setAvatarUrl(url);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    
    loadAvatar();
  }, [userId]);
  
  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };
  
  if (loading) {
    return <div className="avatar-skeleton" style={{ width: size, height: size }} />;
  }
  
  if (error || !avatarUrl) {
    return (
      <div 
        className="avatar-initials" 
        style={{ width: size, height: size, fontSize: size / 2.5 }}
      >
        {getInitials(userName)}
      </div>
    );
  }
  
  return (
    <div className="avatar-container" style={{ width: size, height: size }}>
      <img 
        src={avatarUrl} 
        alt={userName}
        className="avatar-image"
        onError={() => setError(true)}
      />
      {showStatus && <div className="avatar-status online" />}
    </div>
  );
};
```

**AvatarUploader Component**

```javascript
const AvatarUploader = ({ userId, currentAvatar, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    setError(null);
    
    try {
      const url = await uploadAvatar(userId, file);
      onUploadComplete(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="avatar-uploader">
      <input 
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading...' : 'Change Avatar'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
};
```

### 8. VPN Compatibility

**Network Retry Service**

```javascript
class NetworkRetryService {
  constructor() {
    this.maxRetries = 5;
    this.baseDelay = 1000; // 1 second
  }
  
  async retryWithBackoff(fn, context = 'operation') {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        
        // Check if error is network-related
        if (!this.isNetworkError(err)) {
          throw err; // Don't retry non-network errors
        }
        
        if (attempt < this.maxRetries - 1) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          console.log(`${context} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw new Error(`${context} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }
  
  isNetworkError(err) {
    const networkErrors = [
      'network',
      'timeout',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'Failed to fetch'
    ];
    
    return networkErrors.some(keyword => 
      err.message?.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const networkRetry = new NetworkRetryService();
```

**Firebase Connection Wrapper**

```javascript
import { networkRetry } from './networkRetryService';

export const connectToFirebase = async () => {
  return await networkRetry.retryWithBackoff(
    async () => {
      // Test Firebase connection
      const testDoc = await getDoc(doc(db, 'test', 'connection'));
      return true;
    },
    'Firebase connection'
  );
};

export const withRetry = async (operation, context) => {
  return await networkRetry.retryWithBackoff(operation, context);
};
```

**Error Display Component**

```javascript
const NetworkErrorBanner = ({ error, onRetry }) => {
  if (!error) return null;
  
  return (
    <div className="network-error-banner">
      <div className="error-content">
        <svg className="error-icon" width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <div>
          <h4>Connection Error</h4>
          <p>{error.message}</p>
          <p className="troubleshooting">
            If using a VPN, try:
            • Disabling VPN temporarily
            • Using localhost (127.0.0.1) instead of domain names
            • Checking firewall settings
          </p>
        </div>
      </div>
      <button onClick={onRetry}>Retry Connection</button>
    </div>
  );
};
```

## Data Models

### Sound Settings

```typescript
interface SoundSettings {
  voiceJoinSound: boolean;
  voiceLeaveSound: boolean;
  micToggleSound: boolean;
  callSound: boolean;
  messageSendSound: boolean;
  messageMentionSound: boolean;
  outputVolume: number; // 0-100
}
```

### Speaking State

```typescript
interface SpeakingState {
  userId: string;
  isSpeaking: boolean;
  volume: number; // 0-100
  lastUpdate: number; // timestamp
}
```

### Panel Size

```typescript
interface PanelSize {
  panelId: string;
  width: number; // pixels
  minWidth: number;
  maxWidth: number;
}
```

### Avatar Data

```typescript
interface AvatarData {
  userId: string;
  url: string;
  uploadedAt: number; // timestamp
  fileSize: number; // bytes
  mimeType: string;
}
```

### Context Menu Item

```typescript
interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Sound Effects Properties

**Property 1: Sound settings are respected**
*For any* sound event type (voice join, voice leave, mic toggle, incoming call, message send, message mention), when that event occurs, the system should play the corresponding sound if and only if that sound type is enabled in settings.
**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

**Property 2: Sound volume is applied**
*For any* sound playback, the sound volume should match the outputVolume setting (0-100%).
**Validates: Requirements 1.6**

### Speaking Animation Properties

**Property 3: Speaking state detection**
*For any* user in a voice channel, when their volume level from Agora exceeds the speaking threshold (volume > 5), the system should mark them as speaking and display the animation.
**Validates: Requirements 2.1, 2.4**

**Property 4: Speaking animation intensity**
*For any* speaking user, the animation intensity should scale proportionally with their volume level (normalized to 0-1 range).
**Validates: Requirements 2.5**

**Property 5: Speaking animation fade out**
*For any* user who stops speaking, the animation should transition from visible to hidden state.
**Validates: Requirements 2.2**

### Infinite Scroll Properties

**Property 6: Infinite scroll wrapping**
*For any* wheel with 3 or more items, scrolling past the last item should wrap to the first item, and scrolling before the first item should wrap to the last item, creating seamless infinite scrolling.
**Validates: Requirements 3.1, 3.2**

**Property 7: Multi-input scroll support**
*For any* wheel component, both mouse wheel events and touch gesture events should trigger scrolling behavior.
**Validates: Requirements 3.4**

### Audio Threshold Properties

**Property 8: Threshold range acceptance**
*For any* threshold value in the range 0-100 (inclusive), the system should accept and apply that value without error.
**Validates: Requirements 4.1, 4.2**

**Property 9: Threshold activation behavior**
*For any* audio input level and threshold setting, the microphone should activate if and only if the input level exceeds the threshold.
**Validates: Requirements 4.3**

**Property 10: Threshold persistence round-trip**
*For any* threshold value, saving it to localStorage then retrieving it should return the same value.
**Validates: Requirements 4.4**

### Resizable Panel Properties

**Property 11: Panel resize with constraints**
*For any* panel resize operation, the resulting width should be clamped between minWidth and maxWidth (inclusive).
**Validates: Requirements 5.2, 5.3**

**Property 12: Panel size persistence round-trip**
*For any* panel size, saving it to localStorage then retrieving it should return the same size value.
**Validates: Requirements 5.4**

**Property 13: Layout adjustment on resize**
*For any* panel resize operation, the adjacent chat area width should adjust inversely (when panel grows, chat area shrinks by the same amount).
**Validates: Requirements 5.5**

### Context Menu Properties

**Property 14: Voice user context menu appears**
*For any* right-click event on a voice channel user, a context menu should appear at the click coordinates.
**Validates: Requirements 6.1**

**Property 15: Voice user context menu contains required options**
*For any* voice user context menu, it should contain all three required options: adjust volume, open direct message, and add friend.
**Validates: Requirements 6.2**

**Property 16: Context menu actions execute**
*For any* context menu option selection, the corresponding action (volume adjustment, DM navigation, friend request) should execute immediately.
**Validates: Requirements 6.3, 6.4, 6.5**

**Property 17: Message context menu contains required options**
*For any* message context menu, it should contain edit, delete, and reply options.
**Validates: Requirements 9.1**

**Property 18: Channel context menu contains management options**
*For any* channel context menu, it should contain channel management options.
**Validates: Requirements 9.2**

**Property 19: Server context menu contains settings options**
*For any* server context menu, it should contain server settings options.
**Validates: Requirements 9.3**

**Property 20: Friend context menu contains management options**
*For any* friend context menu, it should contain friend management options.
**Validates: Requirements 9.4**

**Property 21: Context menu dismissal**
*For any* open context menu, clicking outside the menu or pressing Escape should close the menu.
**Validates: Requirements 9.5**

### Avatar System Properties

**Property 22: Avatar upload to Firebase Storage**
*For any* valid image file (PNG, JPG, GIF under 5MB), uploading it as an avatar should save it to Firebase Storage and return a download URL.
**Validates: Requirements 7.1, 7.5**

**Property 23: Avatar display preference**
*For any* user with an uploaded avatar, the system should display the avatar image instead of initials in all locations (server lists, voice channels, chat messages, friend lists).
**Validates: Requirements 7.2, 7.4**

**Property 24: Avatar fallback on error**
*For any* avatar that fails to load (invalid URL, network error, missing file), the system should display user initials as fallback.
**Validates: Requirements 7.3**

### VPN Compatibility Properties

**Property 25: Connection error messages**
*For any* Firebase connection failure, the system should display a clear error message to the user.
**Validates: Requirements 8.2**

**Property 26: VPN troubleshooting guidance**
*For any* VPN-related connection error, the error message should include troubleshooting guidance (disable VPN, use localhost, check firewall).
**Validates: Requirements 8.3**

**Property 27: Exponential backoff retry**
*For any* connection retry sequence, the delay between retries should follow exponential backoff pattern (delay = baseDelay * 2^attempt).
**Validates: Requirements 8.4**

### Performance Properties

**Property 28: Virtual scrolling for large lists**
*For any* message list with more than 50 messages, only the visible messages plus a buffer should be rendered in the DOM.
**Validates: Requirements 10.1**

**Property 29: Friend list pagination**
*For any* friend list with more than 50 friends, the results should be loaded in pages rather than all at once.
**Validates: Requirements 10.2**

**Property 30: Data caching reduces requests**
*For any* data that is accessed multiple times within a short period, subsequent accesses should use cached data instead of making new network requests.
**Validates: Requirements 10.3**

**Property 31: React optimization prevents unnecessary renders**
*For any* component that receives the same props, it should not re-render if wrapped with React.memo or using useMemo for expensive computations.
**Validates: Requirements 10.4**

## Error Handling

### Sound System Errors

- **Audio file not found**: Log error, continue without sound
- **Audio playback blocked**: Show notification to user about browser autoplay policy
- **Invalid volume value**: Clamp to 0-100 range

### Speaking Animation Errors

- **Agora volume event missing**: Fallback to basic on/off indicator
- **Animation performance issues**: Reduce animation complexity or disable for low-end devices

### Infinite Scroll Errors

- **Empty item list**: Show empty state message
- **Invalid scroll delta**: Ignore invalid input, maintain current position

### Audio Threshold Errors

- **Invalid threshold value**: Clamp to 0-100 range
- **Agora API error**: Log error, use previous threshold value

### Resizable Panel Errors

- **Invalid drag coordinates**: Ignore invalid input
- **localStorage quota exceeded**: Use in-memory storage, warn user
- **Constraint violation**: Enforce min/max limits

### Context Menu Errors

- **Menu position off-screen**: Adjust position to keep menu visible
- **Action execution failure**: Show error toast, log error

### Avatar System Errors

- **Invalid file type**: Show error message "Invalid file type. Use PNG, JPG, or GIF."
- **File too large**: Show error message "File too large. Maximum size is 5MB."
- **Upload failure**: Show error message, allow retry
- **Download failure**: Show initials fallback
- **Storage quota exceeded**: Show error message about storage limits

### VPN Compatibility Errors

- **Connection timeout**: Retry with exponential backoff
- **Network unreachable**: Show error banner with troubleshooting steps
- **Max retries exceeded**: Show persistent error state with manual retry button
- **DNS resolution failure**: Suggest using IP addresses instead of domain names

### Performance Errors

- **Virtual scroll calculation error**: Fallback to rendering all items
- **Pagination failure**: Load all items, log warning
- **Cache corruption**: Clear cache, reload data
- **Memory pressure**: Reduce cache size, garbage collect

## Testing Strategy

### Dual Testing Approach

This feature will use both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Both testing approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across a wide range of inputs.

### Property-Based Testing Configuration

We will use **fast-check** (JavaScript property-based testing library) for all property tests.

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each property test must reference its design document property
- Tag format: `// Feature: discord-improvements, Property {number}: {property_text}`

**Example Property Test**:
```javascript
import fc from 'fast-check';

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
        const soundManager = new SoundManager({
          [`${config.soundType}Sound`]: config.enabled,
          outputVolume: config.outputVolume
        });
        
        const playSpy = jest.spyOn(soundManager.sounds[config.soundType], 'play');
        soundManager.play(config.soundType);
        
        if (config.enabled) {
          expect(playSpy).toHaveBeenCalled();
        } else {
          expect(playSpy).not.toHaveBeenCalled();
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing Focus

Unit tests should focus on:
- Specific examples that demonstrate correct behavior
- Edge cases (empty lists, boundary values, null/undefined)
- Error conditions (network failures, invalid input, permission errors)
- Integration points between components

**Example Unit Test**:
```javascript
test('avatar upload rejects files over 5MB', async () => {
  const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.png', { type: 'image/png' });
  
  await expect(uploadAvatar('user123', largeFile))
    .rejects
    .toThrow('File too large. Maximum size is 5MB.');
});
```

### Test Coverage Goals

- **Sound System**: 100% coverage of SoundManager class
- **Speaking Animation**: 90% coverage (excluding CSS animations)
- **Infinite Scroll**: 95% coverage of scroll logic
- **Audio Threshold**: 100% coverage of validation and persistence
- **Resizable Panels**: 90% coverage of resize logic
- **Context Menus**: 95% coverage of menu logic
- **Avatar System**: 100% coverage of upload/download logic
- **VPN Compatibility**: 90% coverage of retry logic
- **Performance**: 80% coverage (focus on critical paths)

### Testing Tools

- **Jest**: Test runner and assertion library
- **fast-check**: Property-based testing library
- **React Testing Library**: Component testing
- **MSW (Mock Service Worker)**: API mocking for Firebase/Agora
- **jest-localstorage-mock**: localStorage mocking

### Integration Testing

Integration tests will verify:
- Sound plays when voice channel is joined
- Speaking animation appears when Agora reports volume
- Panel sizes persist across app restarts
- Avatar uploads to Firebase and displays correctly
- Context menus trigger correct actions
- Network retry logic works with Firebase

### Manual Testing Checklist

- [ ] Sound effects play for all event types
- [ ] Speaking animation appears and scales with volume
- [ ] Infinite scroll works smoothly with mouse and touch
- [ ] Audio threshold slider works from 0-100%
- [ ] Panels can be resized and sizes persist
- [ ] Context menus appear and execute actions
- [ ] Avatars upload, display, and fallback correctly
- [ ] App works with VPN enabled
- [ ] Performance is smooth with 50+ users in voice channel
- [ ] All features work on Windows, macOS, and Linux

## Implementation Notes

### Dependencies

New dependencies to add:
```json
{
  "dependencies": {
    "fast-check": "^3.15.0"
  }
}
```

### File Structure

```
src/
├── renderer/
│   ├── services/
│   │   ├── soundManager.js          (new)
│   │   ├── networkRetryService.js   (new)
│   │   └── avatarService.js         (new)
│   ├── components/
│   │   ├── SpeakingIndicator.jsx    (new)
│   │   ├── InfiniteWheel.jsx        (new)
│   │   ├── ResizablePanel.jsx       (new)
│   │   ├── ContextMenu.jsx          (new)
│   │   ├── Avatar.jsx               (new)
│   │   ├── AvatarUploader.jsx       (new)
│   │   └── NetworkErrorBanner.jsx   (new)
│   └── sounds/                      (new)
│       ├── voice-join.mp3
│       ├── voice-leave.mp3
│       ├── mic-toggle.mp3
│       ├── incoming-call.mp3
│       ├── message-send.mp3
│       └── mention.mp3
└── __tests__/
    ├── soundManager.test.js         (new)
    ├── speakingIndicator.test.js    (new)
    ├── infiniteWheel.test.js        (new)
    ├── resizablePanel.test.js       (new)
    ├── contextMenu.test.js          (new)
    ├── avatarService.test.js        (new)
    └── networkRetry.test.js         (new)
```

### Sound Files

Sound effects should be:
- Short duration (< 1 second)
- Small file size (< 50KB each)
- MP3 format for compatibility
- Normalized volume levels

Recommended sources:
- freesound.org (CC0 licensed sounds)
- zapsplat.com (free sound effects)
- Custom recordings

### Performance Considerations

- **Sound Manager**: Preload all sounds on app startup
- **Speaking Animation**: Use CSS transforms for better performance
- **Infinite Scroll**: Use `transform: translateY()` instead of `top` for smooth scrolling
- **Resizable Panels**: Throttle resize events to 60fps
- **Context Menus**: Use React Portal for better rendering performance
- **Avatar System**: Implement image caching with service worker
- **Network Retry**: Use AbortController to cancel pending requests

### Browser Compatibility

- **Sound playback**: Requires user interaction before first sound (autoplay policy)
- **Avatar upload**: FileReader API supported in all modern browsers
- **Resize observer**: Use ResizeObserver API with polyfill for older browsers
- **Context menu**: Prevent default browser context menu

### Accessibility

- **Sound effects**: Provide visual alternatives for deaf users
- **Speaking animation**: Ensure sufficient color contrast
- **Resizable panels**: Support keyboard navigation for resize
- **Context menus**: Support keyboard navigation (arrow keys, Enter, Escape)
- **Avatar upload**: Provide alt text for all images

## Migration Plan

### Phase 1: Core Infrastructure (Week 1)
- Implement SoundManager service
- Add sound files to project
- Implement NetworkRetryService
- Add Firebase Storage integration

### Phase 2: UI Components (Week 2)
- Implement SpeakingIndicator component
- Implement InfiniteWheel component
- Implement ResizablePanel component
- Implement ContextMenu component

### Phase 3: Avatar System (Week 3)
- Implement Avatar component
- Implement AvatarUploader component
- Integrate with existing user displays
- Add avatar upload to account settings

### Phase 4: Integration (Week 4)
- Integrate SoundManager with voice/message events
- Integrate SpeakingIndicator with Agora
- Replace existing wheels with InfiniteWheel
- Add ResizablePanel to sidebars
- Add context menus to all relevant components

### Phase 5: Testing & Polish (Week 5)
- Write all property-based tests
- Write all unit tests
- Manual testing on all platforms
- Performance optimization
- Bug fixes

### Rollback Plan

Each feature is independent and can be disabled via feature flags:
```javascript
const FEATURES = {
  soundEffects: true,
  speakingAnimation: true,
  infiniteScroll: true,
  resizablePanels: true,
  contextMenus: true,
  avatarSystem: true,
  networkRetry: true
};
```

If issues arise, individual features can be disabled without affecting others.
