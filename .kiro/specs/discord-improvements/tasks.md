# Implementation Plan: Discord Clone Improvements

## Overview

This implementation plan breaks down the Discord Clone improvements into discrete, manageable tasks. The plan follows an incremental approach where each task builds on previous work, with testing integrated throughout to catch errors early.

The implementation is organized into phases:
1. Core infrastructure (sound system, network retry)
2. UI components (speaking indicator, infinite wheel, resizable panels, context menus)
3. Avatar system with Firebase Storage
4. Integration and wiring
5. Testing and polish

## Tasks

- [x] 1. Set up core infrastructure and dependencies
  - Install fast-check for property-based testing
  - Add sound effect files to project (voice-join.mp3, voice-leave.mp3, mic-toggle.mp3, incoming-call.mp3, message-send.mp3, mention.mp3)
  - Create directory structure for new services and components
  - Set up Jest configuration for property-based tests
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Implement Sound Manager service
  - [x] 2.1 Create SoundManager class with sound preloading
    - Implement constructor that loads all sound files
    - Implement play() method that respects settings
    - Implement updateSettings() method
    - Add volume control based on outputVolume setting
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [x]* 2.2 Write property test for sound settings
    - **Property 1: Sound settings are respected**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
  
  - [x]* 2.3 Write property test for sound volume
    - **Property 2: Sound volume is applied**
    - **Validates: Requirements 1.6**
  
  - [x]* 2.4 Write unit tests for SoundManager edge cases
    - Test missing sound files
    - Test invalid volume values
    - Test browser autoplay blocking
    - _Requirements: 1.6_

- [ ] 3. Implement Network Retry service
  - [ ] 3.1 Create NetworkRetryService class
    - Implement retryWithBackoff() method with exponential backoff
    - Implement isNetworkError() method to detect network errors
    - Add configurable max retries and base delay
    - _Requirements: 8.4_
  
  - [ ] 3.2 Create Firebase connection wrapper with retry logic
    - Implement connectToFirebase() with retry
    - Implement withRetry() helper function
    - _Requirements: 8.2, 8.4_
  
  - [ ]* 3.3 Write property test for exponential backoff
    - **Property 27: Exponential backoff retry**
    - **Validates: Requirements 8.4**
  
  - [ ]* 3.4 Write unit tests for network retry edge cases
    - Test max retries exceeded
    - Test non-network errors (should not retry)
    - Test successful retry after failures
    - _Requirements: 8.4_

- [x] 4. Implement Speaking Indicator component
  - [x] 4.1 Create SpeakingIndicator component with animation
    - Implement component with pulsing ring animation
    - Add intensity scaling based on volume
    - Add CSS animations for pulse and fade out
    - _Requirements: 2.1, 2.2, 2.5_
  
  - [x] 4.2 Integrate with Agora volume indicator
    - Subscribe to volume-indicator event in agoraService
    - Track speaking state per user (threshold: volume > 5)
    - Update component state on volume changes
    - _Requirements: 2.4_
  
  - [ ]* 4.3 Write property test for speaking state detection
    - **Property 3: Speaking state detection**
    - **Validates: Requirements 2.1, 2.4**
  
  - [ ]* 4.4 Write property test for animation intensity
    - **Property 4: Speaking animation intensity**
    - **Validates: Requirements 2.5**
  
  - [ ]* 4.5 Write unit tests for speaking animation
    - Test fade out behavior
    - Test volume threshold edge cases
    - _Requirements: 2.2_

- [ ] 5. Checkpoint - Ensure core services work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Infinite Wheel component
  - [x] 6.1 Create InfiniteWheel component
    - Implement circular layout calculation
    - Implement wheel scroll handler with modulo arithmetic
    - Add smooth CSS transitions for rotation
    - Support mouse wheel events
    - _Requirements: 3.1, 3.2_
  
  - [x] 6.2 Add touch gesture support
    - Implement touch event handlers
    - Add gesture recognition for swipe
    - _Requirements: 3.4_
  
  - [ ]* 6.3 Write property test for infinite scroll wrapping
    - **Property 6: Infinite scroll wrapping**
    - **Validates: Requirements 3.1, 3.2**
  
  - [ ]* 6.4 Write property test for multi-input support
    - **Property 7: Multi-input scroll support**
    - **Validates: Requirements 3.4**
  
  - [ ]* 6.5 Write unit tests for infinite wheel edge cases
    - Test with empty list
    - Test with 1-2 items (below threshold)
    - Test scroll position normalization
    - _Requirements: 3.1, 3.2_

- [ ] 7. Implement Resizable Panel component
  - [ ] 7.1 Create ResizablePanel component
    - Implement drag handlers for resize
    - Add min/max width constraints
    - Implement localStorage persistence
    - Add resize handle with hover cursor
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [ ]* 7.2 Write property test for resize with constraints
    - **Property 11: Panel resize with constraints**
    - **Validates: Requirements 5.2, 5.3**
  
  - [ ]* 7.3 Write property test for size persistence
    - **Property 12: Panel size persistence round-trip**
    - **Validates: Requirements 5.4**
  
  - [ ]* 7.4 Write property test for layout adjustment
    - **Property 13: Layout adjustment on resize**
    - **Validates: Requirements 5.5**
  
  - [ ]* 7.5 Write unit tests for resizable panel edge cases
    - Test drag beyond constraints
    - Test localStorage quota exceeded
    - Test invalid drag coordinates
    - _Requirements: 5.2, 5.3, 5.4_

- [x] 8. Implement Context Menu system
  - [x] 8.1 Create reusable ContextMenu component
    - Implement menu positioning logic
    - Add click-outside detection to close menu
    - Add Escape key handler to close menu
    - Handle off-screen positioning
    - _Requirements: 9.5_
  
  - [x] 8.2 Create context menu for voice channel users
    - Add right-click handler to voice user component
    - Implement menu items: adjust volume, open DM, add friend
    - Wire up action handlers
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 8.3 Write property test for voice user context menu
    - **Property 14: Voice user context menu appears**
    - **Property 15: Voice user context menu contains required options**
    - **Validates: Requirements 6.1, 6.2**
  
  - [ ]* 8.4 Write property test for context menu actions
    - **Property 16: Context menu actions execute**
    - **Validates: Requirements 6.3, 6.4, 6.5**
  
  - [ ]* 8.5 Write property test for context menu dismissal
    - **Property 21: Context menu dismissal**
    - **Validates: Requirements 9.5**

- [ ] 9. Checkpoint - Ensure UI components work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Avatar service with Firebase Storage
  - [x] 10.1 Create avatar service functions
    - Implement uploadAvatar() with file validation
    - Implement getAvatarUrl() to fetch from Storage
    - Add file type validation (PNG, JPG, GIF)
    - Add file size validation (max 5MB)
    - Update user profile in Firestore with avatar URL
    - _Requirements: 7.1, 7.5_
  
  - [ ]* 10.2 Write property test for avatar upload
    - **Property 22: Avatar upload to Firebase Storage**
    - **Validates: Requirements 7.1, 7.5**
  
  - [ ]* 10.3 Write unit tests for avatar validation
    - Test invalid file types
    - Test files over 5MB
    - Test upload failure handling
    - _Requirements: 7.5_

- [x] 11. Implement Avatar display components
  - [x] 11.1 Create Avatar component
    - Implement avatar loading with URL
    - Add loading skeleton state
    - Add error handling with initials fallback
    - Add status indicator support
    - _Requirements: 7.2, 7.3, 7.4_
  
  - [x] 11.2 Create AvatarUploader component
    - Implement file input with drag-and-drop
    - Add upload progress indicator
    - Add error display
    - Wire up to avatar service
    - _Requirements: 7.1_
  
  - [ ]* 11.3 Write property test for avatar display
    - **Property 23: Avatar display preference**
    - **Validates: Requirements 7.2, 7.4**
  
  - [ ]* 11.4 Write property test for avatar fallback
    - **Property 24: Avatar fallback on error**
    - **Validates: Requirements 7.3**
  
  - [ ]* 11.5 Write unit tests for avatar components
    - Test loading states
    - Test error states
    - Test initials generation
    - _Requirements: 7.3_

- [x] 12. Fix audio threshold slider
  - [x] 12.1 Update AudioThresholdSlider component
    - Fix slider to accept full 0-100 range
    - Add value clamping to ensure valid range
    - Update Agora integration to apply threshold correctly
    - Add localStorage persistence for threshold
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ]* 12.2 Write property test for threshold range
    - **Property 8: Threshold range acceptance**
    - **Validates: Requirements 4.1, 4.2**
  
  - [ ]* 12.3 Write property test for threshold activation
    - **Property 9: Threshold activation behavior**
    - **Validates: Requirements 4.3**
  
  - [ ]* 12.4 Write property test for threshold persistence
    - **Property 10: Threshold persistence round-trip**
    - **Validates: Requirements 4.4**

- [ ] 13. Implement additional context menus
  - [ ] 13.1 Add context menu for messages
    - Add right-click handler to message component
    - Implement menu items: edit, delete, reply
    - Wire up action handlers
    - _Requirements: 9.1_
  
  - [ ] 13.2 Add context menu for channels
    - Add right-click handler to channel component
    - Implement channel management menu items
    - Wire up action handlers
    - _Requirements: 9.2_
  
  - [ ] 13.3 Add context menu for servers
    - Add right-click handler to server component
    - Implement server settings menu items
    - Wire up action handlers
    - _Requirements: 9.3_
  
  - [ ] 13.4 Add context menu for friends
    - Add right-click handler to friend component
    - Implement friend management menu items
    - Wire up action handlers
    - _Requirements: 9.4_
  
  - [ ]* 13.5 Write property tests for all context menus
    - **Property 17: Message context menu contains required options**
    - **Property 18: Channel context menu contains management options**
    - **Property 19: Server context menu contains settings options**
    - **Property 20: Friend context menu contains management options**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [ ] 14. Checkpoint - Ensure all new features work
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Integrate Sound Manager with application events
  - [ ] 15.1 Add sound effects to voice channel events
    - Play voice-join sound when joining voice channel
    - Play voice-leave sound when leaving voice channel
    - Update App.jsx to use SoundManager
    - _Requirements: 1.1_
  
  - [ ] 15.2 Add sound effects to microphone toggle
    - Play mic-toggle sound when toggling microphone
    - Update ChannelSidebar.jsx to use SoundManager
    - _Requirements: 1.3_
  
  - [ ] 15.3 Add sound effects to call events
    - Play incoming-call sound for incoming calls
    - Update call handling in App.jsx
    - _Requirements: 1.2_
  
  - [ ] 15.4 Add sound effects to message events
    - Play message-send sound when sending messages
    - Play mention sound when receiving mentions
    - Update ChatArea.jsx to use SoundManager
    - _Requirements: 1.4, 1.5_
  
  - [ ] 15.5 Add sound settings to AppSettings
    - Add toggles for each sound type
    - Add volume slider for sound effects
    - Wire up to SoundManager
    - _Requirements: 1.6_

- [ ] 16. Integrate Speaking Indicator with voice channels
  - [ ] 16.1 Add SpeakingIndicator to voice user display
    - Update ChannelSidebar voice user list
    - Pass speaking state from Agora volume events
    - Add CSS for speaking animation
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  
  - [ ] 16.2 Update agoraService to track speaking state
    - Store speaking state per user
    - Emit speaking state changes
    - Apply volume threshold (> 5)
    - _Requirements: 2.4_

- [ ] 17. Replace server/friend wheels with InfiniteWheel
  - [ ] 17.1 Update ServerList to use InfiniteWheel
    - Replace current wheel implementation
    - Pass servers as items
    - Wire up click handlers
    - _Requirements: 3.1, 3.2, 3.4_
  
  - [ ] 17.2 Update FriendsPage to use InfiniteWheel for recent contacts
    - Replace current wheel implementation
    - Pass contacts as items
    - Wire up click handlers
    - _Requirements: 3.1, 3.2, 3.4_

- [ ] 18. Add ResizablePanel to sidebars
  - [ ] 18.1 Wrap ChannelSidebar with ResizablePanel
    - Set min/max width constraints (200-600px)
    - Set storage key for persistence
    - Update layout to accommodate resize
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ] 18.2 Wrap ServerList with ResizablePanel
    - Set min/max width constraints (60-200px)
    - Set storage key for persistence
    - Update layout to accommodate resize
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [-] 19. Integrate Avatar system throughout application
  - [ ] 19.1 Replace initials with Avatar component in all locations
    - Update ServerList to show avatars
    - Update ChannelSidebar voice users to show avatars
    - Update ChatArea messages to show avatars
    - Update FriendsPage to show avatars
    - _Requirements: 7.2, 7.3, 7.4_
  
  - [x] 19.2 Add AvatarUploader to AccountSettings
    - Add upload button and preview
    - Wire up to avatar service
    - Update user state on successful upload
    - _Requirements: 7.1_

- [ ] 20. Implement VPN compatibility improvements
  - [ ] 20.1 Create NetworkErrorBanner component
    - Display connection errors
    - Show troubleshooting guidance for VPN issues
    - Add manual retry button
    - _Requirements: 8.2, 8.3_
  
  - [ ] 20.2 Wrap Firebase operations with retry logic
    - Update serverService to use withRetry()
    - Update messageService to use withRetry()
    - Update friendsService to use withRetry()
    - _Requirements: 8.4_
  
  - [ ] 20.3 Add NetworkErrorBanner to App.jsx
    - Show banner on connection errors
    - Implement retry handler
    - _Requirements: 8.2, 8.3_
  
  - [ ]* 20.4 Write property test for connection error messages
    - **Property 25: Connection error messages**
    - **Validates: Requirements 8.2**
  
  - [ ]* 20.5 Write property test for VPN troubleshooting
    - **Property 26: VPN troubleshooting guidance**
    - **Validates: Requirements 8.3**

- [ ] 21. Implement performance optimizations
  - [ ] 21.1 Add virtual scrolling to ChatArea
    - Implement virtual scroll for message list
    - Only render visible messages plus buffer
    - Test with 100+ messages
    - _Requirements: 10.1_
  
  - [ ] 21.2 Add pagination to FriendsPage
    - Implement paginated friend list loading
    - Load 50 friends per page
    - Add "Load More" button
    - _Requirements: 10.2_
  
  - [ ] 21.3 Add data caching to services
    - Implement cache for frequently accessed data
    - Add cache invalidation logic
    - Use in serverService and friendsService
    - _Requirements: 10.3_
  
  - [ ] 21.4 Optimize React components with memo
    - Wrap expensive components with React.memo
    - Use useMemo for expensive computations
    - Use useCallback for event handlers
    - _Requirements: 10.4_
  
  - [ ]* 21.5 Write property tests for performance features
    - **Property 28: Virtual scrolling for large lists**
    - **Property 29: Friend list pagination**
    - **Property 30: Data caching reduces requests**
    - **Property 31: React optimization prevents unnecessary renders**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

- [ ] 22. Final checkpoint - Integration testing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 23. Manual testing and bug fixes
  - [ ] 23.1 Test all features on Windows
    - Test sound effects
    - Test speaking animation
    - Test infinite scroll
    - Test resizable panels
    - Test context menus
    - Test avatar system
    - Test VPN compatibility
    - _Requirements: All_
  
  - [ ] 23.2 Test all features on macOS
    - Test sound effects
    - Test speaking animation
    - Test infinite scroll
    - Test resizable panels
    - Test context menus
    - Test avatar system
    - Test VPN compatibility
    - _Requirements: All_
  
  - [ ] 23.3 Test all features on Linux
    - Test sound effects
    - Test speaking animation
    - Test infinite scroll
    - Test resizable panels
    - Test context menus
    - Test avatar system
    - Test VPN compatibility
    - _Requirements: All_
  
  - [ ] 23.4 Fix any bugs found during manual testing
    - Document bugs
    - Prioritize fixes
    - Implement fixes
    - Re-test
    - _Requirements: All_

- [ ] 24. Documentation and cleanup
  - [ ] 24.1 Update README with new features
    - Document sound effects system
    - Document speaking animation
    - Document infinite scroll
    - Document resizable panels
    - Document context menus
    - Document avatar system
    - Document VPN compatibility
    - _Requirements: All_
  
  - [ ] 24.2 Add inline code comments
    - Comment complex algorithms
    - Document public APIs
    - Add JSDoc comments
    - _Requirements: All_
  
  - [ ] 24.3 Clean up console logs and debug code
    - Remove debug console.logs
    - Remove commented-out code
    - Format code consistently
    - _Requirements: All_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Manual testing ensures cross-platform compatibility
- All features are independent and can be disabled via feature flags if issues arise
