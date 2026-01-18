import { useState, useRef, useEffect } from 'react';
import { 
  searchUsers, 
  sendFriendRequest, 
  acceptFriendRequest, 
  declineFriendRequest,
  removeFriend,
  subscribeToFriendRequests,
  subscribeToFriends 
} from '../services/friendsService';
import { sendDM, subscribeToDMs, markDMsAsRead } from '../services/dmService';
import { updateRecentContact } from '../services/recentContactsService';
import { 
  joinVoiceChannel, 
  leaveVoiceChannel, 
  toggleMicrophone,
  stopScreenShare
} from '../services/webrtcService';
import { startCall, endCall, subscribeToCallStatus } from '../services/callService';
import { startActiveCall, endActiveCall, subscribeToUserCall } from '../services/activeCallsService';
import { subscribeToUserActivity, formatActivity } from '../services/userActivityService';
import { auth } from '../firebase';
import Tooltip from './Tooltip';
import DMCallView from './DMCallView';
import './FriendsPage.css';

function FriendsPage({ 
  onBack, 
  user, 
  authUser,
  onOpenSettings, 
  appSettings, 
  onShowScreenPicker,
  onStopScreenShare: parentOnStopScreenShare,
  screenShare, 
  setScreenShare, 
  myScreenShareStream,
  availableScreenShares,
  setAvailableScreenShares,
  onFullscreenShare, 
  voiceChannel, 
  onLeaveVoiceChannel, 
  dmCall, 
  setDmCall, 
  activeDMContact, 
  setActiveDMContact,
  micMuted: parentMicMuted,
  deafened: parentDeafened,
  speakingUsers: parentSpeakingUsers,
  onToggleMic: parentOnToggleMic,
  onToggleDeafen: parentOnToggleDeafen,
  onEndCall: parentOnEndCall
}) {
  const [filter, setFilter] = useState('all');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeDM, setActiveDM] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [inCall, setInCall] = useState(null);
  const [callTime, setCallTime] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [callingUser, setCallingUser] = useState(null); // Кому звоним (ожидание ответа)
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [showRequests, setShowRequests] = useState(false);
  const [friendCalls, setFriendCalls] = useState({}); // { friendId: callData }
  const [friendActivities, setFriendActivities] = useState({}); // { friendId: activity }
  const messagesEndRef = useRef(null);
  const callTimerRef = useRef(null);
  const unsubDMRef = useRef(null);
  const screenShareVideoRef = useRef(null);
  const unsubCallStatusRef = useRef(null);
  
  // Подписка на друзей и запросы
  useEffect(() => {
    const unsubFriends = subscribeToFriends(setFriends);
    const unsubRequests = subscribeToFriendRequests(setFriendRequests);
    
    return () => {
      unsubFriends();
      unsubRequests();
    };
  }, []);

  // Подписка на активные звонки друзей
  useEffect(() => {
    if (friends.length === 0) return;
    
    const unsubscribers = friends.map(friend => {
      const friendId = friend.id || friend.oderId;
      return subscribeToUserCall(friendId, (callData) => {
        setFriendCalls(prev => ({
          ...prev,
          [friendId]: callData
        }));
      });
    });
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [friends]);

  // Подписка на активность друзей
  useEffect(() => {
    if (friends.length === 0) return;
    
    const unsubscribers = friends.map(friend => {
      const friendId = friend.id || friend.oderId;
      return subscribeToUserActivity(friendId, (activity) => {
        setFriendActivities(prev => ({
          ...prev,
          [friendId]: activity
        }));
      });
    });
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [friends]);

  // Подписка на сообщения при смене активного чата или звонка
  useEffect(() => {
    // Определяем с кем сейчас общаемся (в чате или в звонке)
    const currentContact = dmCall || activeDM;
    
    if (!currentContact) {
      setDmMessages([]);
      return;
    }
    
    const oderId = currentContact.oderId || currentContact.id;
    
    if (!oderId) {
      console.error('No oderId found for current contact:', currentContact);
      setDmMessages([]);
      return;
    }
    
    console.log('Subscribing to DMs with oderId:', oderId);
    
    // Пометить сообщения как прочитанные
    markDMsAsRead(oderId);
    
    unsubDMRef.current?.();
    unsubDMRef.current = subscribeToDMs(oderId, setDmMessages);
    
    return () => unsubDMRef.current?.();
  }, [activeDM, dmCall]);

  // Обновить activeDM когда friends обновляется (чтобы получить photoURL)
  useEffect(() => {
    if (!activeDM) return;
    
    const oderId = activeDM.oderId || activeDM.id;
    const friend = friends.find(f => f.id === oderId || f.oderId === oderId);
    
    if (friend) {
      // Обновляем activeDM если photoURL изменился
      if (friend.photoURL !== activeDM.photoURL) {
        setActiveDM(prev => ({ 
          ...prev, 
          photoURL: friend.photoURL,
          name: friend.name,
          status: friend.status
        }));
      }
    }
  }, [friends, activeDM]);

  // Обновить dmCall когда friends обновляется (чтобы получить photoURL)
  useEffect(() => {
    if (!dmCall) return;
    
    const oderId = dmCall.oderId;
    const friend = friends.find(f => f.id === oderId || f.oderId === oderId);
    
    if (friend) {
      // Обновляем dmCall если photoURL изменился
      if (friend.photoURL !== dmCall.photoURL || friend.name !== dmCall.name) {
        console.log('Updating dmCall with friend data:', { 
          oldPhotoURL: dmCall.photoURL, 
          newPhotoURL: friend.photoURL,
          oldName: dmCall.name,
          newName: friend.name
        });
        setDmCall(prev => ({ 
          ...prev, 
          photoURL: friend.photoURL,
          name: friend.name
        }));
      }
    }
  }, [friends, dmCall]);

  const filteredFriends = friends.filter(f => {
    if (filter === 'online') return f.status === 'online' || f.status === 'idle';
    if (filter === 'offline') return f.status === 'offline';
    return true;
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  useEffect(() => {
    if (inCall) {
      callTimerRef.current = setInterval(() => {
        setCallTime(t => t + 1);
      }, 1000);
    } else {
      clearInterval(callTimerRef.current);
      setCallTime(0);
    }
    return () => clearInterval(callTimerRef.current);
  }, [inCall]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      if (inCall) {
        leaveVoiceChannel();
      }
      unsubCallStatusRef.current?.();
    };
  }, []);

  // Обработка входящего звонка (когда dmCall устанавливается из App.jsx)
  useEffect(() => {
    if (dmCall && !inCall && !callingUser) {
      // Найти друга по oderId и открыть чат
      const friend = friends.find(f => f.id === dmCall.oderId || f.oderId === dmCall.oderId);
      if (friend) {
        setActiveDM(friend);
        // Обновить dmCall с правильным photoURL
        if (friend.photoURL && friend.photoURL !== dmCall.photoURL) {
          setDmCall(prev => ({ ...prev, photoURL: friend.photoURL }));
        }
      } else {
        // Если друг не найден, создаём временный объект
        setActiveDM({ id: dmCall.oderId, oderId: dmCall.oderId, name: dmCall.name, photoURL: dmCall.photoURL });
      }
      // Подключение к звонку уже происходит в App.jsx - не вызываем connectToCall здесь
    }
  }, [dmCall, friends]);

  // Открыть DM из бокового меню
  useEffect(() => {
    if (activeDMContact) {
      const friend = friends.find(f => f.id === activeDMContact.oderId || f.oderId === activeDMContact.oderId);
      if (friend) {
        setActiveDM(friend);
        // Обновить недавние контакты с аватаркой
        updateRecentContact(friend.oderId || friend.id, friend.name, friend.photoURL);
      } else {
        const photoURL = activeDMContact.photoURL || activeDMContact.avatar;
        setActiveDM({ 
          id: activeDMContact.oderId, 
          oderId: activeDMContact.oderId, 
          name: activeDMContact.name,
          photoURL: photoURL
        });
        // Обновить недавние контакты с аватаркой
        updateRecentContact(activeDMContact.oderId, activeDMContact.name, photoURL);
      }
      setActiveDMContact?.(null);
    }
  }, [activeDMContact, friends]);

  const formatCallTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const initiateCall = async (type) => {
    if (!activeDM) return;
    
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    // Если в голосовом канале - отключиться
    if (voiceChannel) {
      await onLeaveVoiceChannel();
    }
    
    const oderId = activeDM.oderId || activeDM.id;
    
    // Записать активный звонок в Realtime Database
    await startActiveCall(oderId, type);
    
    // Создать запись о звонке в Firebase
    const callId = await startCall(
      currentUser.uid,
      currentUser.displayName || 'User',
      oderId,
      activeDM.name,
      user.avatar // передаем photoURL звонящего
    );
    
    setCallingUser({ id: oderId, name: activeDM.name, callId });
    
    // Подписаться на статус звонка
    unsubCallStatusRef.current = subscribeToCallStatus(callId, async (callData) => {
      if (!callData) {
        // Звонок отклонён или завершён
        await endActiveCall(oderId);
        setCallingUser(null);
        unsubCallStatusRef.current?.();
      } else if (callData.status === 'accepted') {
        // Звонок принят - подключаемся к голосовому каналу
        setCallingUser(null);
        unsubCallStatusRef.current?.();
        await connectToCall(type, oderId);
      }
    });
  };

  const connectToCall = async (type, oderId) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const oderId1 = currentUser.uid;
    const oderId2 = oderId;
    const channelName = 'dm_' + [oderId1, oderId2].sort().join('_');
    
    // Найти друга чтобы получить его photoURL
    let friend = friends.find(f => f.id === oderId || f.oderId === oderId);
    
    // Если у друга нет photoURL, попробовать загрузить из профиля
    let photoURL = friend?.photoURL || activeDM?.photoURL || null;
    if (!photoURL && oderId) {
      try {
        const { getUserProfile } = await import('../services/friendsService');
        const profile = await getUserProfile(oderId);
        if (profile?.photoURL) {
          photoURL = profile.photoURL;
        }
      } catch (e) {
        console.error('Failed to load friend profile for avatar:', e);
      }
    }
    
    // Установить dmCall state для показа DMCallView
    setDmCall({
      oderId: oderId,
      name: activeDM?.name || friend?.name || 'User',
      photoURL: photoURL
    });
    
    try {
      await joinVoiceChannel(
        channelName,
        currentUser.displayName || 'User',
        // onUserJoined
        (oderId, userName, stream) => {
          // User joined DM call
        },
        // onUserLeft
        (oderId) => {
          // User left - end call
          leaveVoiceChannel();
          setInCall(null);
          setMicMuted(false);
          setDmCall(null);
          setScreenShare(prev => {
            if (prev?.oderId === oderId) return null;
            return prev;
          });
        },
        // onVolumeIndicator
        null,
        appSettings || {},
        // onScreenShare
        (oderId, userName, stream) => {
          // Add to availableScreenShares
          setAvailableScreenShares(prev => ({
            ...prev,
            [oderId]: { userName, stream, oderId }
          }));
          
          // Also set screenShare for backward compatibility
          setScreenShare(prev => {
            // Don't replace our own screen share
            if (prev && !prev.isRemote) {
              return prev;
            }
            return {
              oderId: oderId,
              userName: userName,
              stream: stream,
              isRemote: true
            };
          });
        },
        // onScreenShareEnded
        (oderId, userName) => {
          // Remove from availableScreenShares
          setAvailableScreenShares(prev => {
            const newShares = { ...prev };
            delete newShares[oderId];
            return newShares;
          });
          
          // Also clear screenShare
          setScreenShare(prev => {
            if (prev?.oderId === oderId) return null;
            return prev;
          });
        }
      );
      
      setInCall({ oderId: activeDM?.id, type });
    } catch (err) {
      console.error('Call error:', err);
    }
  };

  const cancelCall = async () => {
    if (callingUser?.callId) {
      await endCall(callingUser.callId);
      const oderId = callingUser.id;
      await endActiveCall(oderId);
    }
    setCallingUser(null);
    unsubCallStatusRef.current?.();
  };

  const endCallHandler = async () => {
    try {
      if (screenShare && !screenShare.isRemote) {
        await stopScreenShare();
        setScreenShare(null);
      }
      await leaveVoiceChannel();
      
      // Завершить звонок в Firebase
      if (dmCall) {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const callId = [currentUser.uid, dmCall.oderId].sort().join('_');
          await endCall(callId);
          // Завершить активный звонок в Realtime Database
          await endActiveCall(dmCall.oderId);
        }
      }
    } catch (err) {
      console.error('End call error:', err);
    }
    setInCall(null);
    setMicMuted(false);
    setDmCall?.(null);
  };

  const toggleMute = async () => {
    const newMuted = !micMuted;
    setMicMuted(newMuted);
    await toggleMicrophone(!newMuted);
  };

  const toggleScreenShare = async () => {
    if (screenShare) {
      await stopScreenShare();
      setScreenShare(null);
    } else {
      // Открываем модальное окно выбора экрана через App.jsx
      onShowScreenPicker();
    }
  };

  // Подключаем видео поток демонстрации экрана
  useEffect(() => {
    if (!screenShareVideoRef.current || !screenShare?.track) return;
    
    screenShare.track.play(screenShareVideoRef.current);
    
    return () => {
      if (screenShare?.track && !screenShare.isRemote) {
        // Не останавливаем трек здесь, это делается в toggleScreenShare
      }
    };
  }, [screenShare]);

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    
    try {
      const results = await searchUsers(searchName.trim());
      
      if (results.length === 0) {
        setSearchResult({ error: 'Пользователь не найден' });
      } else {
        const alreadyFriend = friends.find(f => f.id === results[0].uid);
        if (alreadyFriend) {
          setSearchResult({ error: 'Этот пользователь уже в друзьях' });
        } else {
          setSearchResult({ found: true, user: results[0] });
        }
      }
    } catch (err) {
      console.error(err);
      setSearchResult({ error: 'Ошибка поиска' });
    }
    setSearchLoading(false);
  };

  const handleSendRequest = async () => {
    if (!searchResult?.user) return;
    
    try {
      await sendFriendRequest(searchResult.user.uid);
      setSearchResult({ success: 'Запрос отправлен!' });
      setSearchName('');
      setTimeout(() => setSearchResult(null), 2000);
    } catch (err) {
      console.error(err);
      setSearchResult({ error: 'Не удалось отправить запрос' });
    }
  };

  const handleAcceptRequest = async (request) => {
    try {
      await acceptFriendRequest(request.id, request.from);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineRequest = async (request) => {
    try {
      await declineFriendRequest(request.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFriend = async (friendId) => {
    try {
      await removeFriend(friendId);
    } catch (err) {
      console.error(err);
    }
  };

  const openDM = async (friend) => {
    // Завершаем звонок если был
    if (inCall) {
      endCall();
    }
    setActiveDM(friend);
    setShowAddFriend(false);
    setShowRequests(false);
    
    // Обновить недавние контакты с аватаркой
    const oderId = friend.oderId || friend.id;
    
    // Если у друга нет photoURL, попробовать загрузить из профиля
    let avatarUrl = friend.photoURL;
    if (!avatarUrl) {
      try {
        const { getUserProfile } = await import('../services/friendsService');
        const profile = await getUserProfile(oderId);
        if (profile?.photoURL) {
          avatarUrl = profile.photoURL;
          // Обновить activeDM с аватаркой
          setActiveDM(prev => ({ ...prev, photoURL: avatarUrl }));
        }
      } catch (e) {
        console.error('Failed to load profile for avatar:', e);
      }
    }
    
    updateRecentContact(oderId, friend.name, avatarUrl);
  };

  const sendMessage = async () => {
    if (!messageInput.trim() || !activeDM) return;
    
    const recipientId = activeDM.oderId || activeDM.id;
    await sendDM(recipientId, messageInput.trim(), activeDM.name);
    setMessageInput('');
  };

  return (
    <div className="friends-page">
      <div className="friends-sidebar">
        <div className="sidebar-header">Друзья</div>
        <div className="filter-tabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Все</button>
          <button className={filter === 'online' ? 'active' : ''} onClick={() => setFilter('online')}>В сети</button>
          <button 
            className={`requests-tab ${showRequests ? 'active' : ''}`} 
            onClick={() => { setShowRequests(true); setShowAddFriend(false); setActiveDM(null); }}
          >
            Запросы
            {friendRequests.length > 0 && <span className="request-badge">{friendRequests.length}</span>}
          </button>
        </div>
        
        <div className="friends-list">
          <div className="list-header">Друзья — {filteredFriends.length}</div>
          {filteredFriends.map(friend => {
            const friendId = friend.id || friend.oderId;
            const activity = friendActivities[friendId];
            const inCall = friendCalls[friendId];
            
            // Определяем текст активности
            let activityText = friend.activity || (friend.status === 'offline' ? 'Не в сети' : 'В сети');
            if (inCall) {
              activityText = 'В звонке';
            } else if (activity) {
              activityText = formatActivity(activity);
            }
            
            return (
            <div key={friend.id} className={`friend-item ${activeDM?.id === friend.id ? 'active' : ''}`}>
              <div className="friend-avatar">
                {friend.photoURL ? (
                  <img src={friend.photoURL} alt="" />
                ) : (
                  friend.name?.[0] || '?'
                )}
                <span className={`status-dot ${friend.status}`} />
              </div>
              <div className="friend-info" onClick={() => openDM(friend)}>
                <span className="friend-name">{friend.name}</span>
                <span className="friend-activity">
                  {activityText}
                </span>
              </div>
              <div className="friend-actions">
                <Tooltip text="Сообщение" position="top">
                  <button className="action-btn" onClick={() => openDM(friend)}>
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip text="Удалить" position="top">
                  <button className="action-btn danger" onClick={() => handleRemoveFriend(friend.id)}>
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
          )})}
          {filteredFriends.length === 0 && (
            <div className="no-friends">
              <p>Пока нет друзей</p>
            </div>
          )}
        </div>

        <div className="user-panel">
          <div className="user-avatar">
            {user.avatar ? <img src={user.avatar} alt="" className="user-avatar-img" /> : user.name[0]}
            <span className="status" />
          </div>
          <div className="user-info">
            <span className="name">{user.name}</span>
            <span className="status-text">В сети</span>
          </div>
          <Tooltip text="Настройки" position="top">
            <button className="settings-btn" onClick={onOpenSettings}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="currentColor" d="M10.56 1.1c-.46.05-.7.53-.64.98.18 1.16-.19 2.2-.98 2.53-.8.33-1.79-.15-2.49-1.1-.27-.36-.78-.52-1.14-.24-.77.59-1.45 1.27-2.04 2.04-.28.36-.12.87.24 1.14.96.7 1.43 1.7 1.1 2.49-.33.79-1.37 1.16-2.53.98-.45-.06-.93.18-.99.64a9.94 9.94 0 0 0 0 2.88c.06.46.54.7.99.64 1.16-.18 2.2.19 2.53.98.33.8-.14 1.79-1.1 2.49-.36.27-.52.78-.24 1.14.59.77 1.27 1.45 2.04 2.04.36.28.87.12 1.14-.24.7-.95 1.69-1.43 2.49-1.1.79.33 1.16 1.37.98 2.53-.06.45.18.93.64.99a9.94 9.94 0 0 0 2.88 0c.46-.06.7-.54.64-.99-.18-1.16.19-2.2.98-2.53.8-.33 1.79.14 2.49 1.10.27.36.78.52 1.14.24.77-.59 1.45-1.27 2.04-2.04.28-.36.12-.87-.24-1.14-.96-.7-1.43-1.7-1.1-2.49.33-.79 1.37-1.16 2.53-.98.45.06.93-.18.99-.64a9.94 9.94 0 0 0 0-2.88c-.06-.46-.54-.7-.99-.64-1.16.18-2.2-.19-2.53-.98-.33-.8.14-1.79 1.1-2.49.36-.27.52-.78.24-1.14a10.08 10.08 0 0 0-2.04-2.04c-.36-.28-.87-.12-1.14.24-.7.96-1.7 1.43-2.49 1.1-.79-.33-1.16-1.37-.98-2.53.06-.45-.18-.93-.64-.98a9.94 9.94 0 0 0-2.88 0zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
      
      <div className="friends-content">
        {!dmCall && (
          <div className="content-header">
            <button className="back-btn" onClick={onBack}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
              Назад
            </button>
            <h2>{showRequests ? 'Запросы в друзья' : activeDM ? activeDM.name : 'Друзья'}</h2>
            {!activeDM && !showRequests && (
              <button className="header-add-btn" onClick={() => { setShowAddFriend(true); setShowRequests(false); }}>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                Добавить друга
              </button>
            )}
            {activeDM && (
              <div className="dm-header-actions">
                <Tooltip text="Голосовой звонок" position="bottom">
                  <button className="call-btn" onClick={() => initiateCall('voice')}>
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip text="Видеозвонок" position="bottom">
                  <button className="call-btn" onClick={() => initiateCall('video')}>
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                    </svg>
                  </button>
                </Tooltip>
              </div>
            )}
          </div>
        )}
        
        {showRequests ? (
          <div className="requests-panel">
            {friendRequests.length === 0 ? (
              <div className="no-requests">
                <p>Нет входящих запросов</p>
              </div>
            ) : (
              friendRequests.map(request => (
                <div key={request.id} className="request-item">
                  <div className="request-avatar">
                    {request.fromUser?.photoURL ? (
                      <img src={request.fromUser.photoURL} alt="" />
                    ) : (
                      request.fromName?.[0] || '?'
                    )}
                  </div>
                  <div className="request-info">
                    <span className="request-name">{request.fromName}</span>
                    <span className="request-text">Хочет добавить вас в друзья</span>
                  </div>
                  <div className="request-actions">
                    <Tooltip text="Принять" position="top">
                      <button className="accept-btn" onClick={() => handleAcceptRequest(request)}>
                        <svg width="20" height="20" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      </button>
                    </Tooltip>
                    <Tooltip text="Отклонить" position="top">
                      <button className="decline-btn" onClick={() => handleDeclineRequest(request)}>
                        <svg width="20" height="20" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : showAddFriend ? (
          <div className="add-friend-panel">
            <h3>Добавить друга</h3>
            <p>Введи точное имя пользователя, чтобы найти друга</p>
            <div className="search-input-row">
              <input 
                type="text" 
                placeholder="Имя пользователя" 
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
              />
              <button onClick={handleSearch} disabled={searchLoading}>
                {searchLoading ? '...' : 'Найти'}
              </button>
            </div>
            {searchResult?.error && <div className="search-error">{searchResult.error}</div>}
            {searchResult?.success && <div className="search-success">{searchResult.success}</div>}
            {searchResult?.found && (
              <div className="found-user">
                <div className="found-avatar">
                  {searchResult.user.photoURL ? (
                    <img src={searchResult.user.photoURL} alt="" />
                  ) : (
                    searchResult.user.displayName?.[0] || '?'
                  )}
                </div>
                <span className="found-name">{searchResult.user.displayName}</span>
                <button className="add-btn" onClick={handleSendRequest}>Отправить запрос</button>
              </div>
            )}
            <button className="close-panel-btn" onClick={() => { setShowAddFriend(false); setSearchResult(null); setSearchName(''); }}>
              Закрыть
            </button>
          </div>
        ) : dmCall ? (
          <DMCallView
            key={dmCall.oderId}
            dmCall={dmCall}
            currentUser={{ ...user, uid: authUser?.uid }}
            micMuted={parentMicMuted}
            deafened={parentDeafened}
            speakingUsers={parentSpeakingUsers}
            onToggleMic={parentOnToggleMic}
            onToggleDeafen={parentOnToggleDeafen}
            onEndCall={parentOnEndCall}
            onBack={() => setDmCall(null)}
            appSettings={appSettings}
            screenShare={screenShare}
            myScreenShareStream={myScreenShareStream}
            availableScreenShares={availableScreenShares}
            onShowScreenPicker={onShowScreenPicker}
            onStopScreenShare={parentOnStopScreenShare}
            onFullscreenShare={onFullscreenShare}
            dmMessages={dmMessages}
            onSendMessage={async (message) => {
              const oderId = dmCall.oderId;
              console.log('Sending DM message:', { oderId, message, dmCall });
              if (!oderId) {
                console.error('Cannot send message: no oderId in dmCall', dmCall);
                return;
              }
              await sendDM(oderId, message, dmCall.name);
            }}
          />
        ) : activeDM ? (
          <div className="dm-chat">
            {callingUser && (
              <div className="call-overlay calling">
                <div className="call-content">
                  <div className="call-avatar">{callingUser.name?.[0] || '?'}</div>
                  <h3>{callingUser.name}</h3>
                  <span className="call-status calling">Вызов...</span>
                  <div className="call-controls">
                    <Tooltip text="Отменить" position="top">
                      <button className="control-btn end" onClick={cancelCall}>
                        <svg width="24" height="24" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                        </svg>
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            )}
            <div className="dm-messages">
              {dmMessages.length === 0 ? (
                <div className="dm-empty">
                  <div className="dm-empty-avatar">{activeDM.name?.[0] || '?'}</div>
                  <h3>{activeDM.name}</h3>
                  <p>Это начало вашей переписки с {activeDM.name}</p>
                </div>
              ) : (
                dmMessages.map(msg => {
                  return (
                  <div key={msg.id} className={`dm-message ${msg.isMe ? 'me' : ''}`}>
                    <div className="msg-avatar">
                      {msg.isMe ? (
                        user.avatar ? <img src={user.avatar} alt="" /> : user.name[0]
                      ) : (
                        activeDM.photoURL ? <img src={activeDM.photoURL} alt="" /> : activeDM.name?.[0]
                      )}
                    </div>
                    <div className="msg-content">
                      <div className="msg-header">
                        <span className="msg-author">{msg.author}</span>
                        <span className="msg-time">{msg.time}</span>
                      </div>
                      <div className="msg-text">{msg.content}</div>
                    </div>
                  </div>
                )})
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="dm-input-area">
              <input 
                type="text" 
                placeholder={`Написать ${activeDM.name}`} 
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()} 
              />
              <button className="send-btn" onClick={sendMessage}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="welcome-message">
            <div className="welcome-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3>Добро пожаловать!</h3>
            <p>Выбери друга слева или добавь нового</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default FriendsPage;
