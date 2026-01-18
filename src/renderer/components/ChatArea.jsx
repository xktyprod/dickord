import { useState, useRef, useEffect } from 'react';
import { auth } from '../firebase';
import { setTyping, clearTyping, subscribeToTyping } from '../services/typingService';
import VoiceChannelView from './VoiceChannelView';
import './ChatArea.css';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀'];

function ChatArea({ 
  channelName, 
  messages, 
  onSendMessage, 
  onEditMessage, 
  onDeleteMessage, 
  onReactMessage, 
  currentUser, 
  members, 
  highlightMentions = true, 
  voiceChannel, 
  activeServer, 
  // Новые props для голосового канала
  voiceConnected,
  micMuted,
  onToggleMic,
  onShowScreenPicker,
  speakingUsers,
  currentChannelType,
  onLeaveVoice,
  availableScreenShares,
  myScreenShareStream,
  screenShare,
  onStopScreenShare,
  onFullscreenShare
}) {
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const chatAreaRef = useRef(null);

  const defaultMembers = members || ['Alex', 'Maria', 'Denis', 'Kate'];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Подписка на печатающих пользователей
  useEffect(() => {
    if (!activeServer || !channelName) return;
    
    // Используем activeChannel из родителя, но его нет в пропсах
    // Поэтому используем channelName как идентификатор
    const channelId = channelName; // Временное решение
    
    const unsub = subscribeToTyping(activeServer, channelId, setTypingUsers);
    return () => unsub();
  }, [activeServer, channelName]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    
    // Check for @ mentions
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1 && lastAtIndex === value.length - 1) {
      setShowMentions(true);
      setMentionFilter('');
    } else if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(' ')) {
        setShowMentions(true);
        setMentionFilter(afterAt.toLowerCase());
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }

    // Typing indicator
    if (value.length > 0 && activeServer) {
      setTyping(activeServer, channelName);
    } else if (activeServer) {
      clearTyping(activeServer, channelName);
    }
  };

  const insertMention = (name) => {
    const lastAtIndex = input.lastIndexOf('@');
    const newInput = input.slice(0, lastAtIndex) + `@${name} `;
    setInput(newInput);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const send = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Очистить индикатор печати перед отправкой
    if (activeServer) {
      clearTyping(activeServer, channelName);
    }
    
    onSendMessage(input.trim());
    setInput('');
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const saveEdit = () => {
    if (editText.trim() && onEditMessage) {
      onEditMessage(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleReact = (msgId, emoji) => {
    if (onReactMessage) {
      onReactMessage(msgId, emoji);
    }
    setShowEmojiPicker(null);
  };

  const renderContent = (content) => {
    // Highlight @mentions
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const isMentionMe = part.slice(1).toLowerCase() === currentUser?.toLowerCase();
        return (
          <span key={i} className={`mention ${isMentionMe ? 'me' : ''}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const filteredMessages = searchQuery 
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const filteredMembers = defaultMembers.filter(m => 
    m.toLowerCase().includes(mentionFilter)
  );

  return (
    <div className="chat-area" ref={chatAreaRef}>
      {/* Voice Channel View - показывается когда подключен к голосовому каналу И активный канал - голосовой */}
      {voiceChannel && voiceConnected && currentChannelType === 'voice' ? (
        <VoiceChannelView
          serverId={voiceChannel.serverId}
          channelId={voiceChannel.channelId}
          channelName={
            // Найти имя голосового канала
            (() => {
              // Если это текущий канал, использовать его имя
              if (currentChannelType === 'voice') {
                return channelName;
              }
              // Иначе показать "Голосовой канал"
              return 'Голосовой канал';
            })()
          }
          currentUser={{ uid: auth.currentUser?.uid, name: currentUser }}
          voiceConnected={voiceConnected}
          micMuted={micMuted}
          onToggleMic={onToggleMic}
          onLeaveVoice={onLeaveVoice}
          onShowScreenPicker={onShowScreenPicker}
          screenShare={screenShare}
          onStopScreenShare={onStopScreenShare}
          speakingUsers={speakingUsers}
          availableScreenShares={availableScreenShares}
          myScreenShareStream={myScreenShareStream}
          onFullscreenShare={onFullscreenShare}
        />
      ) : (
        <>
          <div className="chat-header">
            <span className="hash">#</span>
            <span className="title">{channelName}</span>
            <button 
              className={`search-toggle ${showSearch ? 'active' : ''}`} 
              onClick={() => setShowSearch(!showSearch)}
              title="Поиск"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
          </div>
      
      {showSearch && (
        <div className="search-bar">
          <input
            type="text"
            placeholder="Поиск сообщений..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <span className="search-count">{filteredMessages.length} найдено</span>
          )}
        </div>
      )}
      
      <div className="messages">
        {filteredMessages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">{searchQuery ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            ) : '#'}</div>
            <h3>{searchQuery ? 'Ничего не найдено' : `Добро пожаловать в #${channelName}!`}</h3>
            <p>{searchQuery ? 'Попробуй другой запрос' : 'Это начало канала. Напиши первое сообщение.'}</p>
          </div>
        ) : (
          filteredMessages.map((m, i) => {
            const author = m.authorName || m.author;
            const showHeader = i === 0 || (filteredMessages[i-1].authorName || filteredMessages[i-1].author) !== author;
            const isOwn = author === currentUser || m.authorId === auth?.currentUser?.uid;
            const isEditing = editingId === m.id;
            const hasMention = highlightMentions && m.content.toLowerCase().includes(`@${currentUser?.toLowerCase()}`);
            
            return (
              <div key={m.id} className={`msg ${showHeader ? 'with-header' : ''} ${hasMention ? 'mentioned' : ''}`}>
                {showHeader && (
                  <div className="avatar" style={{background: m.authorColor || m.color || '#5b8def'}}>
                    {m.authorAvatar ? (
                      <img src={m.authorAvatar} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} />
                    ) : (
                      author[0]
                    )}
                  </div>
                )}
                <div className="content">
                  {showHeader && (
                    <div className="header">
                      <span className="author" style={{color: m.authorColor || m.color || '#5b8def'}}>{author}</span>
                      <span className="time">{m.time}</span>
                      {m.edited && <span className="edited">(ред.)</span>}
                    </div>
                  )}
                  
                  {isEditing ? (
                    <div className="edit-input">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                      />
                      <div className="edit-actions">
                        <button onClick={saveEdit}>Сохранить</button>
                        <button onClick={cancelEdit}>Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <div className="text">{renderContent(m.content)}</div>
                  )}
                  
                  {m.reactions && m.reactions.length > 0 && (
                    <div className="reactions">
                      {m.reactions.map((r, idx) => (
                        <span key={idx} className="reaction" onClick={() => handleReact(m.id, r.emoji)}>
                          {r.emoji} {r.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                {!isEditing && (
                  <div className="msg-actions">
                    <button onClick={() => setShowEmojiPicker(showEmojiPicker === m.id ? null : m.id)} title="Реакция">
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                      </svg>
                    </button>
                    {isOwn && (
                      <>
                        <button onClick={() => startEdit(m)} title="Редактировать">
                          <svg width="16" height="16" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                          </svg>
                        </button>
                        <button onClick={() => onDeleteMessage && onDeleteMessage(m.id)} title="Удалить" className="delete">
                          <svg width="16" height="16" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                          </svg>
                        </button>
                      </>
                    )}
                    
                    {showEmojiPicker === m.id && (
                      <div className="emoji-picker">
                        {EMOJI_LIST.map(emoji => (
                          <button key={emoji} onClick={() => handleReact(m.id, emoji)}>{emoji}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      
      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          {typingUsers.map(u => u.userName).join(', ')} печатает...
        </div>
      )}
      
      <form className="input-form" onSubmit={send}>
        <div className="input-wrapper">
          <button type="button" className="attach-btn" title="Прикрепить файл">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
          </button>
          <input
            ref={inputRef}
            placeholder={`Написать в #${channelName}`}
            value={input}
            onChange={handleInputChange}
          />
          {showMentions && filteredMembers.length > 0 && (
            <div className="mentions-popup">
              {filteredMembers.map(member => (
                <button key={member} type="button" onClick={() => insertMention(member)}>
                  <span className="mention-avatar">{member[0]}</span>
                  {member}
                </button>
              ))}
            </div>
          )}
        </div>
      </form>
        </>
      )}
    </div>
  );
}

export default ChatArea;
