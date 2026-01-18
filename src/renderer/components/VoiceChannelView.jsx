import { useState, useEffect, useRef } from 'react';
import { subscribeToVoiceChannelUsers } from '../services/voiceChannelService';
import './VoiceChannelView.css';

function VoiceChannelView({ 
  serverId, 
  channelId, 
  channelName,
  currentUser,
  voiceConnected,
  micMuted,
  onToggleMic,
  onLeaveVoice,
  onShowScreenPicker,
  screenShare,
  onStopScreenShare,
  speakingUsers,
  availableScreenShares,
  myScreenShareStream,
  onFullscreenShare
}) {
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [tileColors, setTileColors] = useState({}); // { userId: color }
  const [focusedScreenShare, setFocusedScreenShare] = useState(null); // userId фокусированной демонстрации
  const videoRefs = useRef({});
  const avatarRefs = useRef({}); // Refs для аватарок

  // Подписка на пользователей в голосовом канале
  useEffect(() => {
    if (!serverId || !channelId) return;

    const unsubscribe = subscribeToVoiceChannelUsers(serverId, channelId, (users) => {
      setVoiceUsers(users);
    });

    return () => unsubscribe();
  }, [serverId, channelId]);

  // Обновление video элементов для демонстраций
  useEffect(() => {
    voiceUsers.forEach(user => {
      const videoElement = videoRefs.current[user.oderId];
      if (!videoElement) return;

      // Проверяем статус screenSharing из Firebase
      const isScreenSharingInDB = user.screenSharing === true;
      
      // Если в Firebase screenSharing = false, очищаем video
      if (!isScreenSharingInDB) {
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
        return;
      }

      // Проверяем есть ли у пользователя демонстрация
      const userScreenShare = availableScreenShares[user.oderId];
      
      let targetStream = null;
      if (userScreenShare?.stream) {
        targetStream = userScreenShare.stream;
      } else if (user.oderId === currentUser.uid && myScreenShareStream) {
        targetStream = myScreenShareStream;
      }
      
      // Обновляем srcObject только если stream изменился (предотвращает мерцание)
      if (videoElement.srcObject !== targetStream) {
        videoElement.srcObject = targetStream;
        if (targetStream) {
          videoElement.play().catch(err => console.error('Video play error:', err));
        }
      }
    });
  }, [voiceUsers, availableScreenShares, myScreenShareStream, currentUser]);

  const isSpeaking = (userId) => {
    return speakingUsers[userId] > 0;
  };

  const hasScreenShare = (userId) => {
    // Находим пользователя в voiceUsers
    const user = voiceUsers.find(u => u.oderId === userId);
    
    // Проверяем статус screenSharing из Firebase
    if (!user || user.screenSharing !== true) {
      return false;
    }
    
    // Дополнительно проверяем наличие stream
    if (userId === currentUser.uid) {
      return !!myScreenShareStream;
    }
    return !!availableScreenShares[userId];
  };

  const isMyScreenSharing = screenShare && !screenShare.isRemote;

  const handleTileClick = (userId) => {
    // Переключаем фокус только если у пользователя есть демонстрация
    if (hasScreenShare(userId)) {
      setFocusedScreenShare(prev => prev === userId ? null : userId);
    }
  };

  // Сбрасываем фокус если у сфокусированного пользователя больше нет демонстрации
  useEffect(() => {
    if (focusedScreenShare && !hasScreenShare(focusedScreenShare)) {
      setFocusedScreenShare(null);
    }
  }, [focusedScreenShare, voiceUsers, availableScreenShares, myScreenShareStream, currentUser]);

  // Определяем какие пользователи показывать
  const displayUsers = focusedScreenShare 
    ? voiceUsers.filter(u => u.oderId === focusedScreenShare)
    : voiceUsers;

  return (
    <div className="voice-channel-view">
      <div className="voice-channel-header">
        <div className="voice-channel-title">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/>
          </svg>
          <span>{channelName}</span>
        </div>
      </div>

      <div className="voice-users-grid">
        {displayUsers.map(user => (
          <div 
            key={user.oderId} 
            className={`voice-user-tile ${isSpeaking(user.oderId) ? 'speaking' : ''} ${hasScreenShare(user.oderId) ? 'has-screen-share' : ''}`}
            style={{ backgroundColor: tileColors[user.oderId] || 'var(--bg-3)' }}
            onClick={() => handleTileClick(user.oderId)}
          >
            {hasScreenShare(user.oderId) ? (
              <>
                <video
                  ref={el => videoRefs.current[user.oderId] = el}
                  className="voice-user-video"
                  autoPlay
                  playsInline
                  muted
                />
                {/* Кнопка полноэкранного просмотра */}
                <button
                  className="tile-fullscreen-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFullscreenShare && onFullscreenShare(user.oderId, user.name);
                  }}
                  title="Полноэкранный просмотр"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                </button>
              </>
            ) : (
              <div className="voice-user-avatar">
                {user.photoURL ? (
                  <img 
                    ref={el => avatarRefs.current[user.oderId] = el}
                    src={user.photoURL} 
                    alt={user.name}
                  />
                ) : (
                  <div className="voice-user-avatar-placeholder">
                    {user.name?.[0] || '?'}
                  </div>
                )}
              </div>
            )}
            
            <div className="voice-user-info">
              <span className="voice-user-name">{user.name}</span>
              <div className="voice-user-status">
                {user.muted && !user.deafened && (
                  <svg key="muted-only" width="16" height="16" viewBox="0 0 24 24" className="status-icon muted">
                    <path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                  </svg>
                )}
                {user.deafened && (
                  <>
                    <svg key="muted-deafened" width="16" height="16" viewBox="0 0 24 24" className="status-icon muted">
                      <path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                    </svg>
                    <svg key="deafened" width="16" height="16" viewBox="0 0 24 24" className="status-icon deafened">
                      <path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h3.5L21 18.5V12a9 9 0 0 0-9-9z"/>
                      <path fill="currentColor" d="M2 2L22 22" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </>
                )}
                {hasScreenShare(user.oderId) && (
                  <svg key="screen-share" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="status-icon screen-share">
                    <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                  </svg>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {voiceConnected && (
        <div className="voice-controls-bar">
          <div className="voice-controls-left">
            <button 
              className={`voice-control-btn ${micMuted ? 'active' : ''}`}
              onClick={onToggleMic}
              title={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {micMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              )}
            </button>

            <button 
              className={`voice-control-btn ${isMyScreenSharing ? 'active' : ''}`}
              onClick={isMyScreenSharing ? onStopScreenShare : onShowScreenPicker}
              title={isMyScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
            >
              {isMyScreenSharing ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                  <rect x="9" y="8.06055" width="1.5" height="7" rx="0.75" transform="rotate(-45 9 8.06055)" fill="currentColor"/>
                  <rect x="14" y="7.06055" width="1.5" height="7" rx="0.75" transform="rotate(45 14 7.06055)" fill="currentColor"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                </svg>
              )}
            </button>
          </div>

          <div className="voice-controls-divider"></div>

          <button 
            className="voice-control-btn disconnect"
            onClick={onLeaveVoice}
            title="Отключиться"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default VoiceChannelView;
