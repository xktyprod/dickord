import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '../firebase';
import { stopScreenShare } from '../services/webrtcService';
import { subscribeToAllVoiceUsers } from '../services/voiceChannelService';
import { subscribeToChannelConnectionQuality, getQualityColor } from '../services/connectionQualityService';
import { subscribeToFriends } from '../services/friendsService';
import SpeakingIndicator from './SpeakingIndicator';
import VoiceUserContextMenu from './VoiceUserContextMenu';
import Avatar from './Avatar';
import Tooltip from './Tooltip';
import './ChannelSidebar.css';

function ChannelSidebar({ serverName, serverId, channels, activeChannel, setActiveChannel, onOpenSettings, onAddChannel, onDeleteChannel, onRenameChannel, onDeleteServer, onShowInvite, user, voiceChannel, voiceConnected, onJoinVoice, onLeaveVoice, micMuted, onToggleMic, deafened, onToggleDeafen, appSettings, screenShare, setScreenShare, onShowScreenPicker, isGlobalServer, isOwner, speakingUsers, onWatchScreenShare, onStopScreenShare, onOpenDM, onAddFriend }) {
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const [networkStatus, setNetworkStatus] = useState('good');
  const [contextMenu, setContextMenu] = useState(null); // { position: {x, y}, user: {...} }
  const [channelContextMenu, setChannelContextMenu] = useState(null); // { channel, position }
  const [renamingChannel, setRenamingChannel] = useState(null); // { id, name }
  const [friends, setFriends] = useState([]); // Список друзей
  
  const [allVoiceUsers, setAllVoiceUsers] = useState({}); // { channelId: [users] }
  const [connectionQualities, setConnectionQualities] = useState({}); // { userId: quality }
  const [menuPosition, setMenuPosition] = useState(null);
  const unsubAllVoiceRef = useRef(null);
  const channelMenuRef = useRef(null);
  const addChannelBtnRef = useRef(null);
  
  const currentUserId = auth.currentUser?.uid;

  // Вычисляем позицию меню при открытии
  useEffect(() => {
    if (showChannelMenu && addChannelBtnRef.current) {
      const rect = addChannelBtnRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2 - 90 // 90 = половина min-width меню (180/2)
      });
    } else {
      setMenuPosition(null);
    }
  }, [showChannelMenu]);

  // Закрытие меню при клике вне его
  useEffect(() => {
    if (!showChannelMenu) return;
    
    const handleClickOutside = (e) => {
      // Проверяем клик и по wrapper и по самому меню (которое в портале)
      const menuEl = document.querySelector('.channel-menu');
      if (channelMenuRef.current && !channelMenuRef.current.contains(e.target) && 
          (!menuEl || !menuEl.contains(e.target))) {
        setShowChannelMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChannelMenu]);

  // Закрытие контекстного меню канала при клике
  useEffect(() => {
    if (!channelContextMenu) return;
    
    const handleClick = (e) => {
      // Не закрывать если клик по самому меню
      const menuEl = document.querySelector('.channel-context-menu');
      if (menuEl && menuEl.contains(e.target)) return;
      setChannelContextMenu(null);
    };
    // Используем click вместо mousedown чтобы кнопки успели сработать
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [channelContextMenu]);

  // Вычисление статуса сети на основе собственного WebRTC качества
  useEffect(() => {
    if (!voiceConnected || !currentUserId || !connectionQualities[currentUserId]) {
      setNetworkStatus('good');
      return;
    }
    
    const myQuality = connectionQualities[currentUserId];
    const myPing = myQuality.ping;
    
    if (myPing === 0 || myPing < 100) {
      setNetworkStatus('good');
    } else if (myPing < 200) {
      setNetworkStatus('medium');
    } else {
      setNetworkStatus('poor');
    }
  }, [voiceConnected, connectionQualities, currentUserId]);

  // Подписка на всех пользователей во всех голосовых каналах сервера
  useEffect(() => {
    if (!serverId) return;
    
    unsubAllVoiceRef.current?.();
    unsubAllVoiceRef.current = subscribeToAllVoiceUsers(serverId, setAllVoiceUsers);
    
    return () => unsubAllVoiceRef.current?.();
  }, [serverId]);

  // Подписка на качество соединения в текущем голосовом канале
  useEffect(() => {
    if (!voiceChannel || !serverId) return;
    
    const unsub = subscribeToChannelConnectionQuality(
      serverId,
      voiceChannel,
      setConnectionQualities
    );
    
    return () => unsub();
  }, [voiceChannel, serverId]);

  // Подписка на список друзей
  useEffect(() => {
    const unsub = subscribeToFriends(setFriends);
    return () => unsub();
  }, []);

  const toggleMute = () => {
    onToggleMic();
  };

  const toggleDeafen = () => {
    onToggleDeafen();
  };

  // Проверяем, является ли текущая трансляция нашей
  const isMyScreenShare = screenShare && !screenShare.isRemote;

  const toggleScreenShareHandler = async () => {
    if (isMyScreenShare) {
      // Останавливаем только свою трансляцию
      await stopScreenShare();
      setScreenShare(null);
      // Notify parent to update Firebase status
      if (onStopScreenShare) {
        onStopScreenShare();
      }
    } else {
      // Начинаем новую трансляцию (даже если смотрим чужую - просто переключимся на свою)
      onShowScreenPicker();
    }
  };

  const handleAddChannel = (type) => {
    setShowChannelMenu(false);
    onAddChannel(type);
  };

  const voiceChannelName = voiceChannel ? channels.find(c => c.id === voiceChannel)?.name : null;

  return (
    <div className="channel-sidebar">
      <div className="server-header">
        <span>{serverName}</span>
        <div className="header-actions">
          <Tooltip text="Пригласить" position="bottom">
            <button className="header-btn" onClick={onShowInvite}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="currentColor" d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </button>
          </Tooltip>
          <div className="add-channel-wrapper" ref={channelMenuRef}>
            <Tooltip text="Создать канал" position="bottom">
              <button 
                className="header-btn" 
                ref={addChannelBtnRef}
                onClick={() => setShowChannelMenu(!showChannelMenu)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
            </Tooltip>
            {showChannelMenu && menuPosition && createPortal(
              <div 
                className="channel-menu"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                <button onClick={() => handleAddChannel('text')}>
                  <span>#</span> Текстовый канал
                </button>
                <button onClick={() => handleAddChannel('voice')}>
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3z"/>
                  </svg>
                  Голосовой канал
                </button>
              </div>,
              document.body
            )}
          </div>
          <Tooltip text={isOwner ? "Удалить сервер" : "Покинуть сервер"} position="bottom">
            <button className="header-btn delete" onClick={onDeleteServer}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="currentColor" d={isOwner ? "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" : "M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"}/>
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="channel-list">
        {channels.map(ch => (
          <div key={ch.id}>
            <div
              className={`channel ${activeChannel === ch.id ? 'active' : ''} ${ch.type === 'voice' ? 'voice' : ''} ${voiceChannel && voiceChannel === ch.id ? 'voice-active' : ''}`}
              onClick={() => {
                if (ch.type === 'text') {
                  setActiveChannel(ch.id);
                } else {
                  // Голосовой канал - установить как активный и присоединиться если еще не в нем
                  setActiveChannel(ch.id);
                  if (voiceChannel !== ch.id) {
                    onJoinVoice(ch.id);
                  }
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setChannelContextMenu({
                  channel: ch,
                  position: { x: e.clientX, y: e.clientY }
                });
              }}
            >
              <span className="icon">
                {ch.type === 'text' ? '#' : (
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3zm3.1 17.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5z"/>
                  </svg>
                )}
              </span>
              <span className="channel-name">{ch.name}</span>
            </div>
            {ch.type === 'voice' && (
              <div className="voice-users">
                {(allVoiceUsers[ch.id] || []).map((vu, index) => {
                  // Проверяем говорит ли конкретно этот пользователь
                  // speakingUsers содержит uid или имя пользователя
                  const isSpeaking = voiceChannel === ch.id && (
                    speakingUsers[vu.oderId] || 
                    speakingUsers[vu.name] ||
                    speakingUsers[vu.oderId?.toString()]
                  );
                  
                  // Получить качество соединения для этого пользователя
                  const quality = voiceChannel === ch.id ? connectionQualities[vu.oderId] : null;
                  
                  return (
                    <div 
                      key={vu.oderId || index} 
                      className="voice-user"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        // Don't open context menu for self
                        if (vu.oderId === currentUserId) return;
                        setContextMenu({
                          position: { x: e.clientX, y: e.clientY },
                          user: vu
                        });
                      }}
                    >
                      {/* Connection quality indicator - moved before avatar */}
                      {quality && (
                        <div 
                          className="quality-indicator"
                          style={{ backgroundColor: getQualityColor(quality.level) }}
                          title={`Ping: ${quality.ping}ms - ${quality.level === 'excellent' ? 'Отлично' : quality.level === 'good' ? 'Хорошо' : quality.level === 'fair' ? 'Средне' : 'Плохо'}`}
                        />
                      )}
                      <SpeakingIndicator isSpeaking={!!isSpeaking}>
                        <Avatar 
                          src={vu.photoURL} 
                          name={vu.name} 
                          size="small"
                        />
                      </SpeakingIndicator>
                      <span>{vu.name}</span>
                      <div className="voice-user-icons">
                        {/* Muted/Deafened icons */}
                        {vu.deafened ? (
                          <svg className="voice-status-icon deafened" width="14" height="14" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M4.34 2.93L2.93 4.34 7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18c-.65.49-1.38.88-2.18 1.11v2.06a8.94 8.94 0 0 0 3.61-1.75l2.05 2.05 1.41-1.41L4.34 2.93zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-7-8l-1.88 1.88L12 7.76zm4.5 8A4.5 4.5 0 0 0 14 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z"/>
                          </svg>
                        ) : vu.muted ? (
                          <svg className="voice-status-icon muted" width="14" height="14" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                          </svg>
                        ) : null}
                        {/* Screen share watch button - show for everyone */}
                        {vu.screenSharing && (
                          <button 
                            className="watch-stream-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWatchScreenShare && onWatchScreenShare(vu.oderId, vu.name, ch.id);
                            }}
                            title={`Смотреть трансляцию ${vu.name}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {voiceChannel && (
        <div className={`voice-connected-bar ${!voiceConnected ? 'connecting' : ''}`}>
          <div className="voice-info">
            <div className={`voice-icon ${!voiceConnected ? 'connecting' : `network-${networkStatus}`}`} title={
              !voiceConnected ? 'Подключение...' :
              networkStatus === 'good' ? 'Отличное соединение' :
              networkStatus === 'medium' ? 'Среднее соединение' :
              networkStatus === 'poor' ? 'Плохое соединение' : 'Нет соединения'
            }>
              {!voiceConnected ? (
                <svg width="16" height="16" viewBox="0 0 24 24" className="connecting-icon">
                  <path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="15" width="4" height="7" rx="2" fill="currentColor"/>
                  <rect x="10" y="9" width="4" height="13" rx="2" fill="currentColor"/>
                  <rect x="18" y="2" width="4" height="20" rx="2" fill="currentColor"/>
                </svg>
              )}
            </div>
            <div className="voice-details">
              <span className={`voice-status ${!voiceConnected ? 'connecting' : ''}`}>
                {!voiceConnected ? 'Подключение...' : serverName}
              </span>
              <span className="voice-channel-name">{voiceChannelName}</span>
            </div>
          </div>
          <div className="voice-actions">
            <Tooltip text={micMuted ? 'Включить микрофон' : 'Выключить микрофон'} position="top">
              <button 
                className={`voice-btn ${micMuted ? 'muted' : ''}`} 
                onClick={toggleMute}
              >
                {micMuted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15a.998.998 0 0 0-.98-.85c-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08a6.993 6.993 0 0 0 5.91-5.78c.1-.6-.39-1.14-1-1.14z"/>
                  </svg>
                )}
              </button>
            </Tooltip>
            <Tooltip text={deafened ? 'Включить звук' : 'Выключить звук'} position="top">
              <button 
                className={`voice-btn ${deafened ? 'muted' : ''}`} 
                onClick={toggleDeafen}
              >
                {deafened ? (
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M4.34 2.93L2.93 4.34 7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18c-.65.49-1.38.88-2.18 1.11v2.06a8.94 8.94 0 0 0 3.61-1.75l2.05 2.05 1.41-1.41L4.34 2.93zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-7-8l-1.88 1.88L12 7.76zm4.5 8A4.5 4.5 0 0 0 14 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                )}
              </button>
            </Tooltip>
            <Tooltip text={isMyScreenShare ? 'Остановить демонстрацию' : 'Демонстрация экрана'} position="top">
              <button 
                className={`voice-btn ${isMyScreenShare ? 'active' : ''}`} 
                onClick={toggleScreenShareHandler}
              >
                {isMyScreenShare ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                    <rect x="9" y="8.06055" width="1.5" height="7" rx="0.75" transform="rotate(-45 9 8.06055)" fill="currentColor"/>
                    <rect x="14" y="7.06055" width="1.5" height="7" rx="0.75" transform="rotate(45 14 7.06055)" fill="currentColor"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                    <rect x="16" y="9.19995" width="1.6" height="8" rx="0.8" transform="rotate(90 16 9.19995)" fill="currentColor"/>
                    <path d="M15.7574 9.38583C16.0809 9.70936 16.0809 10.2339 15.7574 10.5574C15.4338 10.8809 14.9093 10.8809 14.5858 10.5574L12.2426 8.21426C11.9191 7.89074 11.9191 7.36621 12.2426 7.04269C12.5662 6.71917 13.0907 6.71917 13.4142 7.04269L15.7574 9.38583Z" fill="currentColor"/>
                    <path d="M14.5858 9.44259C14.9093 9.11907 15.4338 9.11907 15.7574 9.44259C16.0809 9.76611 16.0809 10.2906 15.7574 10.6142L13.4142 12.9573C13.0907 13.2808 12.5662 13.2808 12.2426 12.9573C11.9191 12.6338 11.9191 12.1093 12.2426 11.7857L14.5858 9.44259Z" fill="currentColor"/>
                  </svg>
                )}
              </button>
            </Tooltip>
            <Tooltip text="Отключиться" position="top">
              <button className="disconnect-btn" onClick={onLeaveVoice}>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>
      )}
      
      <div className="user-panel">
        <div className="user-avatar">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="user-avatar-img" />
          ) : (
            user.name[0]
          )}
          <span className="status" />
        </div>
        <div className="user-info">
          <span className="name">{user.name}</span>
          <span className="status-text">В сети</span>
        </div>
        <Tooltip text="Настройки" position="top">
          <button className="settings-btn" onClick={onOpenSettings}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M10.56 1.1c-.46.05-.7.53-.64.98.18 1.16-.19 2.2-.98 2.53-.8.33-1.79-.15-2.49-1.1-.27-.36-.78-.52-1.14-.24-.77.59-1.45 1.27-2.04 2.04-.28.36-.12.87.24 1.14.96.7 1.43 1.7 1.1 2.49-.33.79-1.37 1.16-2.53.98-.45-.06-.93.18-.99.64a9.94 9.94 0 0 0 0 2.88c.06.46.54.7.99.64 1.16-.18 2.2.19 2.53.98.33.8-.14 1.79-1.10 2.49-.36.27-.52.78-.24 1.14.59.77 1.27 1.45 2.04 2.04.36.28.87.12 1.14-.24.7-.95 1.69-1.43 2.49-1.1.79.33 1.16 1.37.98 2.53-.06.45.18.93.64.99a9.94 9.94 0 0 0 2.88 0c.46-.06.7-.54.64-.99-.18-1.16.19-2.2.98-2.53.8-.33 1.79.14 2.49 1.1.27.36.78.52 1.14.24.77-.59 1.45-1.27 2.04-2.04.28-.36.12-.87-.24-1.14-.96-.7-1.43-1.7-1.1-2.49.33-.79 1.37-1.16 2.53-.98.45.06.93-.18.99-.64a9.94 9.94 0 0 0 0-2.88c-.06-.46-.54-.7-.99-.64-1.16.18-2.2-.19-2.53-.98-.33-.8.14-1.79 1.1-2.49.36-.27.52-.78.24-1.14a10.08 10.08 0 0 0-2.04-2.04c-.36-.28-.87-.12-1.14.24-.7.96-1.7 1.43-2.49 1.1-.79-.33-1.16-1.37-.98-2.53.06-.45-.18-.93-.64-.98a9.94 9.94 0 0 0-2.88 0zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>
            </svg>
          </button>
        </Tooltip>
      </div>
      
      {contextMenu && (
        <VoiceUserContextMenu
          position={contextMenu.position}
          user={contextMenu.user}
          currentUserId={currentUserId}
          isFriend={friends.some(f => f.id === contextMenu.user.oderId)}
          onClose={() => setContextMenu(null)}
          onOpenDM={(u) => {
            onOpenDM?.(u);
          }}
          onAddFriend={(u) => {
            onAddFriend?.(u);
          }}
          onRemoveFriend={async (u) => {
            const { removeFriend } = await import('../services/friendsService');
            try {
              await removeFriend(u.oderId);
            } catch (err) {
              console.error('Error removing friend:', err);
            }
          }}
        />
      )}
      
      {/* Контекстное меню канала */}
      {channelContextMenu && createPortal(
        <div 
          className="channel-context-menu"
          style={{ top: channelContextMenu.position.y, left: channelContextMenu.position.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button onClick={(e) => {
            e.stopPropagation();
            setRenamingChannel({ id: channelContextMenu.channel.id, name: channelContextMenu.channel.name });
            setChannelContextMenu(null);
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
            Переименовать
          </button>
          <button className="delete" onClick={(e) => {
            e.stopPropagation();
            onDeleteChannel(channelContextMenu.channel.id);
            setChannelContextMenu(null);
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            Удалить канал
          </button>
        </div>,
        document.body
      )}
      
      {/* Модалка переименования канала */}
      {renamingChannel && createPortal(
        <div className="modal-overlay" onClick={() => setRenamingChannel(null)}>
          <div className="rename-modal" onClick={e => e.stopPropagation()}>
            <h3>Переименовать канал</h3>
            <input 
              type="text"
              value={renamingChannel.name}
              onChange={e => setRenamingChannel({ ...renamingChannel, name: e.target.value })}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && renamingChannel.name.trim()) {
                  onRenameChannel(renamingChannel.id, renamingChannel.name.trim());
                  setRenamingChannel(null);
                }
                if (e.key === 'Escape') setRenamingChannel(null);
              }}
            />
            <div className="modal-buttons">
              <button onClick={() => setRenamingChannel(null)}>Отмена</button>
              <button 
                className="primary" 
                onClick={() => {
                  if (renamingChannel.name.trim()) {
                    onRenameChannel(renamingChannel.id, renamingChannel.name.trim());
                    setRenamingChannel(null);
                  }
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ChannelSidebar;
