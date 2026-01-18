import { useRef, useEffect, useState } from 'react';
import VoiceUserContextMenu from './VoiceUserContextMenu';
import './DMCallView.css';

function DMCallView({ 
  dmCall,
  currentUser,
  micMuted,
  deafened,
  speakingUsers,
  onToggleMic,
  onToggleDeafen,
  onEndCall,
  onBack,
  appSettings,
  screenShare,
  myScreenShareStream,
  availableScreenShares,
  onShowScreenPicker,
  onStopScreenShare,
  onFullscreenShare,
  dmMessages = [],
  onSendMessage
}) {
  const [focusedScreenShare, setFocusedScreenShare] = useState(null); // userId фокусированной демонстрации
  const videoRefs = useRef({});
  const [contextMenu, setContextMenu] = useState(null); // { user, position: { x, y } }
  const [showChat, setShowChat] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const lastReadMessageIdRef = useRef(null);

  // Инициализация lastReadMessageId при монтировании (все сообщения считаются прочитанными)
  useEffect(() => {
    if (dmMessages.length > 0 && !lastReadMessageIdRef.current) {
      lastReadMessageIdRef.current = dmMessages[dmMessages.length - 1].id;
    }
  }, []);

  const isSpeaking = (userId) => {
    const threshold = appSettings?.micThreshold ?? 15;
    return speakingUsers && speakingUsers[userId] > threshold;
  };

  const hasScreenShare = (userId) => {
    // Проверяем, является ли это демонстрацией текущего пользователя
    if (userId === currentUser.uid) {
      return !!myScreenShareStream;
    }
    
    // Проверяем, является ли это демонстрацией другого пользователя
    return !!availableScreenShares[userId];
  };
  
  // Вычисляем состояние screen share для обоих пользователей
  const currentUserHasScreenShare = !!myScreenShareStream;
  const otherUserHasScreenShare = !!availableScreenShares[dmCall.oderId];

  const handleTileClick = (userId) => {
    // Переключаем фокус только если у пользователя есть демонстрация
    if (hasScreenShare(userId)) {
      setFocusedScreenShare(prev => prev === userId ? null : userId);
    }
  };

  const handleContextMenu = (e, userId, userName, photoURL) => {
    e.preventDefault();
    setContextMenu({
      user: {
        oderId: userId,
        name: userName,
        photoURL: photoURL
      },
      position: { x: e.clientX, y: e.clientY }
    });
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !onSendMessage) return;
    onSendMessage(messageInput.trim());
    setMessageInput('');
  };

  // Отслеживание непрочитанных сообщений
  useEffect(() => {
    if (showChat) {
      // Когда чат открыт - сбрасываем счетчик и запоминаем последнее сообщение
      setUnreadCount(0);
      if (dmMessages.length > 0) {
        lastReadMessageIdRef.current = dmMessages[dmMessages.length - 1].id;
      }
      
      // Пометить сообщения как прочитанные в Firebase
      if (dmCall?.oderId) {
        import('../services/dmService').then(({ markDMsAsRead }) => {
          markDMsAsRead(dmCall.oderId);
        });
      }
    } else {
      // Когда чат закрыт - считаем новые сообщения
      if (dmMessages.length > 0 && lastReadMessageIdRef.current) {
        const lastReadIndex = dmMessages.findIndex(msg => msg.id === lastReadMessageIdRef.current);
        if (lastReadIndex !== -1) {
          // Считаем только сообщения от другого пользователя
          const newMessages = dmMessages.slice(lastReadIndex + 1).filter(msg => !msg.isMe);
          setUnreadCount(newMessages.length);
        } else {
          // Если не нашли последнее прочитанное - считаем все непрочитанные от другого пользователя
          const unreadMessages = dmMessages.filter(msg => !msg.isMe);
          setUnreadCount(unreadMessages.length);
        }
      } else if (dmMessages.length > 0 && !lastReadMessageIdRef.current) {
        // Первый раз - считаем все сообщения от другого пользователя
        const unreadMessages = dmMessages.filter(msg => !msg.isMe);
        setUnreadCount(unreadMessages.length);
      }
    }
  }, [dmMessages, showChat, dmCall?.oderId]);

  // Сбрасываем фокус если у сфокусированного пользователя больше нет демонстрации
  useEffect(() => {
    if (focusedScreenShare && !hasScreenShare(focusedScreenShare)) {
      setFocusedScreenShare(null);
    }
  }, [focusedScreenShare, availableScreenShares, myScreenShareStream]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  // Подключить видео поток демонстрации экрана
  useEffect(() => {
    // Обновляем video элементы для обоих пользователей
    [currentUser.uid, dmCall.oderId].forEach(userId => {
      const videoElement = videoRefs.current[userId];
      if (!videoElement) return;

      let targetStream = null;
      
      // Определяем правильный stream для этого пользователя
      if (userId === currentUser.uid) {
        // Своя демонстрация: используем myScreenShareStream
        targetStream = myScreenShareStream;
      } else {
        // Чужая демонстрация: используем availableScreenShares
        const userScreenShare = availableScreenShares[userId];
        if (userScreenShare?.stream) {
          targetStream = userScreenShare.stream;
        }
      }
      
      // Всегда обновляем srcObject (даже если null, чтобы очистить видео)
      if (videoElement.srcObject !== targetStream) {
        videoElement.srcObject = targetStream;
        if (targetStream) {
          videoElement.play().catch(err => console.error('Video play error:', err));
        }
      }
    });
  }, [availableScreenShares, myScreenShareStream, currentUser.uid, dmCall.oderId]);

  return (
    <div className="dm-call-view">
      <div className="dm-call-header">
        <button className="dm-call-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <div className="dm-call-title">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
          <span>Голосовой звонок с {dmCall.name}</span>
        </div>
        <button 
          className={'dm-call-chat-btn ' + (showChat ? 'active' : '')}
          onClick={() => setShowChat(!showChat)}
          title="Чат"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          {unreadCount > 0 && !showChat && (
            <span className="dm-chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
      </div>

      <div className="dm-call-content">
        {focusedScreenShare ? (
          <div className="dm-call-users">
            {/* Показываем только плитку с фокусированной демонстрацией */}
            {focusedScreenShare === currentUser.uid ? (
              <div 
                className={'dm-call-user-tile has-screen-share ' + (isSpeaking(currentUser.uid) ? 'speaking' : '')}
                onClick={() => handleTileClick(currentUser.uid)}
                onContextMenu={(e) => handleContextMenu(e, currentUser.uid, currentUser.name, currentUser.avatar)}
              >
                <video
                  ref={el => videoRefs.current[currentUser.uid] = el}
                  className="dm-call-video"
                  autoPlay
                  playsInline
                  muted
                />
                {/* Кнопка полноэкранного просмотра */}
                <button
                  className="tile-fullscreen-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFullscreenShare && onFullscreenShare(currentUser.uid, currentUser.name);
                  }}
                  title="Полноэкранный просмотр"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                </button>
                <div className="dm-call-user-info">
                  <span className="dm-call-user-name">{currentUser.name}</span>
                  <div className="dm-call-user-status">
                    {micMuted && !deafened && (
                      <svg key="muted-only" width="16" height="16" viewBox="0 0 24 24" className="status-icon muted">
                        <path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                      </svg>
                    )}
                    {deafened && (
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
                    <svg key="screen-share" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="status-icon screen-share">
                      <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className={'dm-call-user-tile has-screen-share ' + (isSpeaking(dmCall.oderId) ? 'speaking' : '')}
                onClick={() => handleTileClick(dmCall.oderId)}
                onContextMenu={(e) => handleContextMenu(e, dmCall.oderId, dmCall.name, dmCall.photoURL)}
              >
                <video
                  ref={el => videoRefs.current[dmCall.oderId] = el}
                  className="dm-call-video"
                  autoPlay
                  playsInline
                  muted
                />
                {/* Кнопка полноэкранного просмотра */}
                <button
                  className="tile-fullscreen-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFullscreenShare && onFullscreenShare(dmCall.oderId, dmCall.name);
                  }}
                  title="Полноэкранный просмотр"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                </button>
                <div className="dm-call-user-info">
                  <span className="dm-call-user-name">{dmCall.name}</span>
                  <div className="dm-call-user-status">
                    <svg key="screen-share" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="status-icon screen-share">
                      <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="dm-call-users">
            <div 
              key={'current-' + (currentUserHasScreenShare ? 'sharing' : 'not-sharing')}
              className={'dm-call-user-tile ' + (isSpeaking(currentUser.uid) ? 'speaking' : '') + (currentUserHasScreenShare ? ' has-screen-share' : '')}
              onClick={() => handleTileClick(currentUser.uid)}
              onContextMenu={(e) => handleContextMenu(e, currentUser.uid, currentUser.name, currentUser.avatar)}
            >
              {currentUserHasScreenShare ? (
                <>
                  <video
                    ref={el => videoRefs.current[currentUser.uid] = el}
                    className="dm-call-video"
                    autoPlay
                    playsInline
                    muted
                  />
                  {/* Кнопка полноэкранного просмотра */}
                  <button
                    className="tile-fullscreen-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFullscreenShare && onFullscreenShare(currentUser.uid, currentUser.name);
                    }}
                    title="Полноэкранный просмотр"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                    </svg>
                  </button>
                </>
              ) : (
                <div className="dm-call-user-avatar">
                  {currentUser.avatar ? (
                    <img 
                      src={currentUser.avatar} 
                      alt={currentUser.name}
                      onError={(e) => {
                        console.error('Failed to load current user avatar:', currentUser.avatar);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="dm-call-avatar-placeholder">' + (currentUser.name?.[0] || '?') + '</div>';
                      }}
                    />
                  ) : (
                    <div className="dm-call-avatar-placeholder">
                      {currentUser.name?.[0] || '?'}
                    </div>
                  )}
                </div>
              )}
              <div className="dm-call-user-info">
                <span className="dm-call-user-name">{currentUser.name}</span>
                <div className="dm-call-user-status">
                  {micMuted && !deafened && (
                    <svg key="muted-only" width="16" height="16" viewBox="0 0 24 24" className="status-icon muted">
                      <path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                    </svg>
                  )}
                  {deafened && (
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
                  {currentUserHasScreenShare && (
                    <svg key="screen-share" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="status-icon screen-share">
                      <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                    </svg>
                  )}
                </div>
              </div>
            </div>

            <div 
              key={'other-' + (otherUserHasScreenShare ? 'sharing' : 'not-sharing')}
              className={'dm-call-user-tile ' + (isSpeaking(dmCall.oderId) ? 'speaking' : '') + (otherUserHasScreenShare ? ' has-screen-share' : '')}
              onClick={() => handleTileClick(dmCall.oderId)}
              onContextMenu={(e) => handleContextMenu(e, dmCall.oderId, dmCall.name, dmCall.photoURL)}
            >
              {otherUserHasScreenShare ? (
                <>
                  <video
                    ref={el => videoRefs.current[dmCall.oderId] = el}
                    className="dm-call-video"
                    autoPlay
                    playsInline
                    muted
                  />
                  {/* Кнопка полноэкранного просмотра */}
                  <button
                    className="tile-fullscreen-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFullscreenShare && onFullscreenShare(dmCall.oderId, dmCall.name);
                    }}
                    title="Полноэкранный просмотр"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                    </svg>
                  </button>
                </>
              ) : (
                <div className="dm-call-user-avatar">
                  {dmCall.photoURL ? (
                    <img 
                      src={dmCall.photoURL} 
                      alt={dmCall.name}
                      onError={(e) => {
                        console.error('Failed to load other user avatar:', dmCall.photoURL);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="dm-call-avatar-placeholder">' + (dmCall.name?.[0] || '?') + '</div>';
                      }}
                    />
                  ) : (
                    <div className="dm-call-avatar-placeholder">
                      {dmCall.name?.[0] || '?'}
                    </div>
                  )}
                </div>
              )}
              <div className="dm-call-user-info">
                <span className="dm-call-user-name">{dmCall.name}</span>
                <div className="dm-call-user-status">
                  {otherUserHasScreenShare && (
                    <svg key="screen-share" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="status-icon screen-share">
                      <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="dm-call-controls">
        <div className="dm-call-controls-left">
          <button 
            className={'dm-call-control-btn ' + (micMuted ? 'active' : '')}
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
            className={'dm-call-control-btn ' + (deafened ? 'active' : '')}
            onClick={onToggleDeafen}
            title={deafened ? 'Включить звук' : 'Выключить звук'}
          >
            {deafened ? (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h3.5L21 18.5V12a9 9 0 0 0-9-9z"/>
                <path fill="currentColor" d="M2 2L22 22" stroke="currentColor" strokeWidth="2"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/>
              </svg>
            )}
          </button>

          <div className="dm-call-divider" />
          <button 
            className={'dm-call-control-btn ' + (screenShare && !screenShare.isRemote ? 'active' : '')}
            onClick={screenShare && !screenShare.isRemote ? onStopScreenShare : onShowScreenPicker}
            title={screenShare && !screenShare.isRemote ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
          >
            {screenShare && !screenShare.isRemote ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                <rect x="9" y="8.06055" width="1.5" height="7" rx="0.75" transform="rotate(-45 9 8.06055)" fill="currentColor"/>
                <rect x="14" y="7.06055" width="1.5" height="7" rx="0.75" transform="rotate(45 14 7.06055)" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                <rect x="16" y="9.19995" width="1.6" height="8" rx="0.8" transform="rotate(90 16 9.19995)" fill="currentColor"/>
                <path d="M15.7574 9.38583C16.0809 9.70936 16.0809 10.2339 15.7574 10.5574C15.4338 10.8809 14.9093 10.8809 14.5858 10.5574L12.2426 8.21426C11.9191 7.89074 11.9191 7.36621 12.2426 7.04269C12.5662 6.71917 13.0907 6.71917 13.4142 7.04269L15.7574 9.38583Z" fill="currentColor"/>
                <path d="M14.5858 9.44259C14.9093 9.11907 15.4338 9.11907 15.7574 9.44259C16.0809 9.76611 16.0809 10.2906 15.7574 10.6142L13.4142 12.9573C13.0907 13.2808 12.5662 13.2808 12.2426 12.9573C11.9191 12.6338 11.9191 12.1093 12.2426 11.7857L14.5858 9.44259Z" fill="currentColor"/>
              </svg>
            )}
          </button>
          <div className="dm-call-divider" />
        </div>

        <button 
          className="dm-call-control-btn end-call"
          onClick={onEndCall}
          title="Завершить звонок"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
        </button>
      </div>

      {/* Панель чата */}
      <div className={'dm-call-chat-panel ' + (showChat ? 'open' : '')}>
        <div className="dm-chat-header">
          <span>Чат</span>
          <button className="dm-chat-close" onClick={() => setShowChat(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div className="dm-chat-messages">
          {dmMessages.length === 0 ? (
            <div className="dm-chat-empty">
              <p>Начните общаться в чате</p>
            </div>
          ) : (
            dmMessages.map(msg => (
              <div key={msg.id} className={'dm-chat-message ' + (msg.isMe ? 'me' : '')}>
                <div className="dm-chat-msg-avatar">
                  {msg.isMe ? (
                    currentUser.avatar ? (
                      <img src={currentUser.avatar} alt="" />
                    ) : (
                      <div className="dm-chat-avatar-placeholder">{currentUser.name?.[0] || '?'}</div>
                    )
                  ) : (
                    dmCall.photoURL ? (
                      <img src={dmCall.photoURL} alt="" />
                    ) : (
                      <div className="dm-chat-avatar-placeholder">{dmCall.name?.[0] || '?'}</div>
                    )
                  )}
                </div>
                <div className="dm-chat-msg-content">
                  <div className="dm-chat-msg-header">
                    <span className="dm-chat-msg-author">{msg.author}</span>
                    <span className="dm-chat-msg-time">{msg.time}</span>
                  </div>
                  <div className="dm-chat-msg-text">{msg.content}</div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="dm-chat-input">
          <input 
            type="text" 
            placeholder={'Написать ' + dmCall.name}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button className="dm-chat-send" onClick={handleSendMessage}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>

      {contextMenu && (
        <VoiceUserContextMenu
          position={contextMenu.position}
          user={contextMenu.user}
          currentUserId={currentUser.uid}
          isFriend={true}
          onClose={() => setContextMenu(null)}
          onOpenDM={null}
          onAddFriend={null}
          onRemoveFriend={null}
          onToggleMic={contextMenu.user.oderId === currentUser.uid ? onToggleMic : null}
          onToggleDeafen={contextMenu.user.oderId === currentUser.uid ? onToggleDeafen : null}
          micMuted={contextMenu.user.oderId === currentUser.uid ? micMuted : false}
          deafened={contextMenu.user.oderId === currentUser.uid ? deafened : false}
          hideFriendActions={true}
        />
      )}
    </div>
  );
}

export default DMCallView;
