import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { setRemoteUserVolume } from '../services/webrtcService';
import Avatar from './Avatar';
import './VoiceUserContextMenu.css';
import friendAddIcon from '../../../svg/friend_add.svg';
import friendRemoveIcon from '../../../svg/friend_remove.svg';

function VoiceUserContextMenu({ 
  position, 
  user, 
  currentUserId, 
  isFriend, 
  onClose, 
  onOpenDM, 
  onAddFriend, 
  onRemoveFriend,
  onToggleMic,
  onToggleDeafen,
  micMuted: externalMicMuted,
  deafened: externalDeafened,
  hideFriendActions = false
}) {
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('userVolume_' + user.oderId);
    return saved ? parseInt(saved) : 100;
  });
  const [muteMic, setMuteMic] = useState(externalMicMuted !== undefined ? externalMicMuted : false);
  const [muteSound, setMuteSound] = useState(() => {
    if (externalDeafened !== undefined) {
      return externalDeafened;
    }
    if (user.oderId !== currentUserId) {
      return volume === 0;
    }
    return false;
  });
  const menuRef = useRef(null);
  const sliderRef = useRef(null);
  
  const isCurrentUser = user.oderId === currentUserId;

  // Update slider progress CSS variable
  useEffect(() => {
    if (sliderRef.current) {
      const progress = (volume / 500) * 100;
      sliderRef.current.style.setProperty('--slider-progress', progress + '%');
    }
  }, [volume]);

  useEffect(() => {
    if (!isCurrentUser) {
      setMuteSound(volume === 0);
    }
  }, [volume, isCurrentUser]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }
    if (x < 0) x = 10;

    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 10;
    }
    if (y < 0) y = 10;

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }, [position]);

  const handleVolumeChange = (e) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    localStorage.setItem('userVolume_' + user.oderId, newVolume.toString());
    setRemoteUserVolume(user.oderId, newVolume);
  };

  const handleToggleMuteSound = () => {
    if (muteSound) {
      const savedVolume = localStorage.getItem('userVolume_' + user.oderId + '_beforeMute');
      const restoreVolume = savedVolume ? parseInt(savedVolume) : 100;
      setVolume(restoreVolume);
      localStorage.setItem('userVolume_' + user.oderId, restoreVolume.toString());
      setRemoteUserVolume(user.oderId, restoreVolume);
    } else {
      localStorage.setItem('userVolume_' + user.oderId + '_beforeMute', volume.toString());
      setVolume(0);
      localStorage.setItem('userVolume_' + user.oderId, '0');
      setRemoteUserVolume(user.oderId, 0);
    }
    setMuteSound(!muteSound);
  };

  const menuContent = (
    <div className="voice-context-menu-overlay">
      <div 
        ref={menuRef} 
        className="voice-context-menu"
        style={{ left: position.x, top: position.y }}
      >
        <div className="voice-context-header">
          <Avatar 
            src={user.photoURL} 
            name={user.name} 
            size="medium"
          />
          <span className="voice-context-name">{user.name}</span>
          {!isCurrentUser && (
            <svg 
              className="voice-context-header-dm"
              width="18" 
              height="18" 
              viewBox="0 0 20 20" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              onClick={() => {
                onOpenDM && onOpenDM(user);
                onClose();
              }}
            >
              <path d="M6.66667 7.49992H13.3333M6.66667 10.8333H11.6667M15 3.33325C15.663 3.33325 16.2989 3.59664 16.7678 4.06549C17.2366 4.53433 17.5 5.17021 17.5 5.83325V12.4999C17.5 13.163 17.2366 13.7988 16.7678 14.2677C16.2989 14.7365 15.663 14.9999 15 14.9999H10.8333L6.66667 17.4999V14.9999H5C4.33696 14.9999 3.70107 14.7365 3.23223 14.2677C2.76339 13.7988 2.5 13.163 2.5 12.4999V5.83325C2.5 5.17021 2.76339 4.53433 3.23223 4.06549C3.70107 3.59664 4.33696 3.33325 5 3.33325H15Z" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        
        {isCurrentUser ? (
          <div className="voice-context-section">
            <div 
              className="voice-context-item"
              onClick={() => {
                if (onToggleMic) {
                  onToggleMic();
                } else {
                  setMuteMic(!muteMic);
                }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="context-icon">
                <path d="M9.99984 15.8333V18.3333M9.99984 15.8333C11.5469 15.8333 13.0307 15.2187 14.1246 14.1247C15.2186 13.0307 15.8332 11.547 15.8332 9.99992V8.33325M9.99984 15.8333C8.45274 15.8333 6.96901 15.2187 5.87505 14.1247C4.78109 13.0307 4.1665 11.547 4.1665 9.99992V8.33325" stroke="currentColor" strokeOpacity="0.88" strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12.5 4.16675C12.5 2.78604 11.3807 1.66675 10 1.66675C8.61929 1.66675 7.5 2.78604 7.5 4.16675V10.0001C7.5 11.3808 8.61929 12.5001 10 12.5001C11.3807 12.5001 12.5 11.3808 12.5 10.0001V4.16675Z" stroke="currentColor" strokeOpacity="0.88" strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Заглушить микрофон</span>
              <input 
                type="checkbox" 
                checked={externalMicMuted !== undefined ? externalMicMuted : muteMic} 
                onChange={(e) => {
                  e.stopPropagation();
                  if (onToggleMic) {
                    onToggleMic();
                  } else {
                    setMuteMic(!muteMic);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="context-checkbox"
              />
            </div>
            
            <div 
              className="voice-context-item"
              onClick={() => {
                if (onToggleDeafen) {
                  onToggleDeafen();
                } else {
                  handleToggleMuteSound();
                }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="context-icon">
                <path d="M15 11.1667L13.4167 12.75C13.2639 12.9028 13.0694 12.9792 12.8333 12.9792C12.5972 12.9792 12.4028 12.9028 12.25 12.75C12.0972 12.5972 12.0208 12.4028 12.0208 12.1667C12.0208 11.9305 12.0972 11.7361 12.25 11.5833L13.8333 9.99999L12.25 8.41666C12.0972 8.26388 12.0208 8.06943 12.0208 7.83332C12.0208 7.59721 12.0972 7.40277 12.25 7.24999C12.4028 7.09721 12.5972 7.02082 12.8333 7.02082C13.0694 7.02082 13.2639 7.09721 13.4167 7.24999L15 8.83332L16.5833 7.24999C16.7361 7.09721 16.9306 7.02082 17.1667 7.02082C17.4028 7.02082 17.5972 7.09721 17.75 7.24999C17.9028 7.40277 17.9792 7.59721 17.9792 7.83332C17.9792 8.06943 17.9028 8.26388 17.75 8.41666L16.1667 9.99999L17.75 11.5833C17.9028 11.7361 17.9792 11.9305 17.9792 12.1667C17.9792 12.4028 17.9028 12.5972 17.75 12.75C17.5972 12.9028 17.4028 12.9792 17.1667 12.9792C16.9306 12.9792 16.7361 12.9028 16.5833 12.75L15 11.1667ZM5.83333 12.5H3.33333C3.09722 12.5 2.89944 12.42 2.74 12.26C2.58056 12.1 2.50056 11.9022 2.5 11.6667V8.33332C2.5 8.09721 2.58 7.89943 2.74 7.73999C2.9 7.58055 3.09778 7.50055 3.33333 7.49999H5.83333L8.58333 4.74999C8.84722 4.4861 9.14944 4.42693 9.49 4.57249C9.83055 4.71805 10.0006 4.9786 10 5.35416V14.6458C10 15.0208 9.83 15.2814 9.49 15.4275C9.15 15.5736 8.84778 15.5144 8.58333 15.25L5.83333 12.5Z" fill="currentColor" fillOpacity="0.88"/>
              </svg>
              <span>Заглушить звук</span>
              <input 
                type="checkbox" 
                checked={externalDeafened !== undefined ? externalDeafened : muteSound} 
                onChange={(e) => {
                  e.stopPropagation();
                  if (onToggleDeafen) {
                    onToggleDeafen();
                  } else {
                    handleToggleMuteSound();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="context-checkbox"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="voice-context-section">
              {!hideFriendActions && (
                <div 
                  className="voice-context-item"
                  onClick={() => {
                    if (isFriend) {
                      onRemoveFriend && onRemoveFriend(user);
                    } else {
                      onAddFriend && onAddFriend(user);
                    }
                    onClose();
                  }}
                >
                  <img 
                    src={isFriend ? friendRemoveIcon : friendAddIcon} 
                    alt="" 
                    width="16" 
                    height="16" 
                    className="context-icon"
                  />
                  <span>{isFriend ? 'Удалить из друзей' : 'Добавить в друзья'}</span>
                </div>
              )}
              
              <div 
                className="voice-context-item"
                onClick={handleToggleMuteSound}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="context-icon">
                  <path d="M15 11.1667L13.4167 12.75C13.2639 12.9028 13.0694 12.9792 12.8333 12.9792C12.5972 12.9792 12.4028 12.9028 12.25 12.75C12.0972 12.5972 12.0208 12.4028 12.0208 12.1667C12.0208 11.9305 12.0972 11.7361 12.25 11.5833L13.8333 9.99999L12.25 8.41666C12.0972 8.26388 12.0208 8.06943 12.0208 7.83332C12.0208 7.59721 12.0972 7.40277 12.25 7.24999C12.4028 7.09721 12.5972 7.02082 12.8333 7.02082C13.0694 7.02082 13.2639 7.09721 13.4167 7.24999L15 8.83332L16.5833 7.24999C16.7361 7.09721 16.9306 7.02082 17.1667 7.02082C17.4028 7.02082 17.5972 7.09721 17.75 7.24999C17.9028 7.40277 17.9792 7.59721 17.9792 7.83332C17.9792 8.06943 17.9028 8.26388 17.75 8.41666L16.1667 9.99999L17.75 11.5833C17.9028 11.7361 17.9792 11.9305 17.9792 12.1667C17.9792 12.4028 17.9028 12.5972 17.75 12.75C17.5972 12.9028 17.4028 12.9792 17.1667 12.9792C16.9306 12.9792 16.7361 12.9028 16.5833 12.75L15 11.1667ZM5.83333 12.5H3.33333C3.09722 12.5 2.89944 12.42 2.74 12.26C2.58056 12.1 2.50056 11.9022 2.5 11.6667V8.33332C2.5 8.09721 2.58 7.89943 2.74 7.73999C2.9 7.58055 3.09778 7.50055 3.33333 7.49999H5.83333L8.58333 4.74999C8.84722 4.4861 9.14944 4.42693 9.49 4.57249C9.83055 4.71805 10.0006 4.9786 10 5.35416V14.6458C10 15.0208 9.83 15.2814 9.49 15.4275C9.15 15.5736 8.84778 15.5144 8.58333 15.25L5.83333 12.5Z" fill="currentColor" fillOpacity="0.88"/>
                </svg>
                <span>Заглушить звук</span>
                <input 
                  type="checkbox" 
                  checked={muteSound} 
                  onChange={handleToggleMuteSound}
                  onClick={(e) => e.stopPropagation()}
                  className="context-checkbox"
                />
              </div>
            </div>
            
            <div className="voice-context-volume">
              <div className="volume-slider-row">
                <input
                  ref={sliderRef}
                  type="range"
                  min="0"
                  max="500"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
                <span className="volume-value">{volume}%</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
}

export default VoiceUserContextMenu;
