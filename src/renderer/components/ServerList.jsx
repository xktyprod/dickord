import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ServerList.css';

function ServerList({ servers, activeServer, onServerChange, onAddServer, onJoinServer, onFriendsClick, friendsActive, recentContacts = [], onOpenDM, activeContactId, unreadDMs = {}, unreadNotifications = 0, onOpenNotifications }) {
  const [wheelOffset, setWheelOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [tooltip, setTooltip] = useState(null); // { text, x, y }
  const animationRef = useRef(null);
  const wheelRef = useRef(null); // Ссылка на элемент колеса
  const visibleCount = 7;
  const centerIndex = Math.floor(visibleCount / 2);
  
  // Объединяем серверы и контакты
  const wheelData = useMemo(() => {
    const items = [];
    servers.forEach(server => {
      items.push({ ...server, type: 'server' });
    });
    recentContacts.slice(0, 5).forEach(contact => {
      items.push({ ...contact, type: 'contact', hasUnread: !!unreadDMs[contact.oderId || contact.id] });
    });
    return items;
  }, [servers, recentContacts, unreadDMs]);
  
  // Общее количество непрочитанных DM
  const totalUnreadDMs = useMemo(() => {
    return Object.values(unreadDMs).reduce((sum, count) => sum + count, 0);
  }, [unreadDMs]);
  
  // Включаем колесо только при 3+ элементах
  const useWheel = wheelData.length >= 3;
  
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  
  // Анимация к активному элементу
  useEffect(() => {
    if (!useWheel || wheelData.length === 0) return;
    
    let activeIdx = -1;
    if (activeServer) {
      activeIdx = wheelData.findIndex(item => item.type === 'server' && item.id === activeServer);
    }
    if (activeIdx === -1 && activeContactId) {
      activeIdx = wheelData.findIndex(item => item.type === 'contact' && item.id === activeContactId);
    }
    if (activeIdx === -1) return;
    
    const targetOffset = activeIdx;
    let currentOffset = wheelOffset % wheelData.length;
    if (currentOffset < 0) currentOffset += wheelData.length;
    
    let diff = targetOffset - currentOffset;
    if (Math.abs(diff) > wheelData.length / 2) {
      diff = diff > 0 ? diff - wheelData.length : diff + wheelData.length;
    }
    
    if (Math.abs(diff) < 0.01) return;
    
    setIsAnimating(true);
    const startOffset = wheelOffset;
    const duration = 400;
    const startTime = performance.now();
    
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      
      setWheelOffset(startOffset + diff * easedProgress);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        setWheelOffset(targetOffset);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [activeServer, activeContactId, wheelData, useWheel]);

  // Элементы колеса (только для 3+ элементов)
  const wheelItems = useMemo(() => {
    if (!useWheel || wheelData.length === 0) return [];
    
    const items = [];
    const roundedOffset = Math.round(wheelOffset);
    
    for (let i = 0; i < visibleCount; i++) {
      const offset = i - centerIndex + roundedOffset;
      let itemIdx = offset % wheelData.length;
      if (itemIdx < 0) itemIdx += wheelData.length;
      
      const fractionalOffset = wheelOffset - roundedOffset;
      const distanceFromCenter = Math.abs(i - centerIndex + fractionalOffset);
      
      items.push({
        ...wheelData[itemIdx],
        position: i,
        distanceFromCenter,
      });
    }
    
    return items;
  }, [wheelData, wheelOffset, visibleCount, centerIndex, useWheel]);

  const handleWheel = (e) => {
    if (!useWheel || isAnimating) return;
    e.preventDefault();
    setWheelOffset(prev => prev + (e.deltaY > 0 ? 1 : -1));
  };

  // Регистрируем wheel обработчик с { passive: false } чтобы можно было вызывать preventDefault
  useEffect(() => {
    const wheelElement = wheelRef.current;
    if (!wheelElement) return;

    wheelElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      wheelElement.removeEventListener('wheel', handleWheel);
    };
  }, [useWheel, isAnimating]);

  const getScale = (distanceFromCenter) => {
    return Math.max(0.4, 1 - distanceFromCenter * 0.15);
  };
  
  const handleMouseEnter = (e, text) => {
    if (!text) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text,
      x: rect.right + 12,
      y: rect.top + rect.height / 2
    });
  };
  
  const handleMouseLeave = () => {
    setTooltip(null);
  };

  const renderItem = (item, isActive, scale = 1, opacity = 1) => (
    <div
      className={`server ${isActive ? 'active' : ''} ${item.type === 'contact' ? 'contact-item' : ''}`}
      style={{ transform: `scale(${scale})`, opacity }}
      onClick={() => {
        if (item.type === 'server') {
          onServerChange(item.id);
        } else {
          onOpenDM?.(item);
        }
      }}
      onMouseEnter={(e) => handleMouseEnter(e, item.name)}
      onMouseLeave={handleMouseLeave}
    >
      {item.type === 'contact' ? (
        <>
          {item.avatar ? (
            <img src={item.avatar} alt="" className="wheel-avatar" />
          ) : (
            item.name?.[0] || '?'
          )}
          {item.hasUnread && <span className="contact-unread-dot" />}
        </>
      ) : (
        item.isGlobal ? '🌍' : item.icon
      )}
    </div>
  );

  return (
    <div className="server-list">
      <div className="server-fixed">
        <div 
          className={`server friends ${friendsActive ? 'active' : ''}`}
          onClick={onFriendsClick}
          onMouseEnter={(e) => handleMouseEnter(e, 'Друзья')}
          onMouseLeave={handleMouseLeave}
        >
          <svg width="20" height="17" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7.2 9.60019C9.52125 9.60019 11.4 7.72144 11.4 5.4002C11.4 3.07895 9.52125 1.2002 7.2 1.2002C4.87875 1.2002 3 3.07895 3 5.4002C3 7.72144 4.87875 9.60019 7.2 9.60019ZM10.08 10.8002H9.76875C8.98875 11.1752 8.1225 11.4002 7.2 11.4002C6.2775 11.4002 5.415 11.1752 4.63125 10.8002H4.32C1.935 10.8002 0 12.7352 0 15.1202V16.2002C0 17.1939 0.80625 18.0002 1.8 18.0002H12.6C13.5938 18.0002 14.4 17.1939 14.4 16.2002V15.1202C14.4 12.7352 12.465 10.8002 10.08 10.8002ZM18 9.60019C19.9875 9.60019 21.6 7.98769 21.6 6.0002C21.6 4.0127 19.9875 2.4002 18 2.4002C16.0125 2.4002 14.4 4.0127 14.4 6.0002C14.4 7.98769 16.0125 9.60019 18 9.60019ZM19.8 10.8002H19.6575C19.1363 10.9802 18.585 11.1002 18 11.1002C17.415 11.1002 16.8638 10.9802 16.3425 10.8002H16.2C15.435 10.8002 14.73 11.0214 14.1113 11.3777C15.0263 12.3639 15.6 13.6727 15.6 15.1202V16.5602C15.6 16.6427 15.5813 16.7214 15.5775 16.8002H22.2C23.1938 16.8002 24 15.9939 24 15.0002C24 12.6789 22.1213 10.8002 19.8 10.8002Z" fill="currentColor"/>
          </svg>
          {totalUnreadDMs > 0 && <span className="unread-badge">{totalUnreadDMs > 99 ? '99+' : totalUnreadDMs}</span>}
        </div>
      </div>

      <div className="server-wheel" ref={wheelRef}>
        <div className="wheel-fade wheel-fade-top" />
        <div className="wheel-fade wheel-fade-bottom" />
        {useWheel ? (
          // Колесо для 3+ элементов
          wheelItems.map((item, idx) => {
            const scale = getScale(item.distanceFromCenter);
            const isCenter = item.distanceFromCenter < 0.5;
            const isActive = item.type === 'server' 
              ? item.id === activeServer 
              : item.id === activeContactId;
            
            return (
              <div key={`${item.type}-${item.id}-${idx}`} className={`wheel-item ${isCenter ? 'center' : ''}`}>
                <div className={`pill ${isActive ? 'active' : ''}`} />
                {renderItem(item, isActive, scale, 0.4 + scale * 0.6)}
              </div>
            );
          })
        ) : (
          // Простой список для 1-2 элементов
          wheelData.map((item) => {
            const isActive = item.type === 'server' 
              ? item.id === activeServer 
              : item.id === activeContactId;
            
            return (
              <div key={`${item.type}-${item.id}`} className="wheel-item center">
                <div className={`pill ${isActive ? 'active' : ''}`} />
                {renderItem(item, isActive)}
              </div>
            );
          })
        )}
      </div>

      <div className="server-fixed bottom">
        <div 
          className="server add" 
          onClick={onOpenNotifications}
          onMouseEnter={(e) => handleMouseEnter(e, 'Уведомления')}
          onMouseLeave={handleMouseLeave}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="currentColor"/>
          </svg>
          {unreadNotifications > 0 && <span className="unread-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
        </div>
        <div 
          className="server add" 
          onClick={onJoinServer}
          onMouseEnter={(e) => handleMouseEnter(e, 'Присоединиться к серверу')}
          onMouseLeave={handleMouseLeave}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 12C21 10.22 20.4722 8.47991 19.4832 6.99987C18.4943 5.51983 17.0887 4.36628 15.4442 3.68509C13.7996 3.0039 11.99 2.82567 10.2442 3.17294C8.49836 3.5202 6.89472 4.37737 5.63604 5.63604C4.37737 6.89472 3.5202 8.49836 3.17294 10.2442C2.82567 11.99 3.0039 13.7996 3.68509 15.4442C4.36628 17.0887 5.51983 18.4943 6.99987 19.4832C8.47991 20.4722 10.22 21 12 21M3.6 9H20.4M3.6 15H11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11.5002 3C9.8155 5.69961 8.92236 8.81787 8.92236 12C8.92236 15.1821 9.8155 18.3004 11.5002 21M12.5002 3C14.1166 5.59006 15.0058 8.56766 15.0742 11.62M20.2002 20.2L22.0002 22M15.0002 18C15.0002 18.7956 15.3162 19.5587 15.8788 20.1213C16.4414 20.6839 17.2045 21 18.0002 21C18.7958 21 19.5589 20.6839 20.1215 20.1213C20.6841 19.5587 21.0002 18.7956 21.0002 18C21.0002 17.2044 20.6841 16.4413 20.1215 15.8787C19.5589 15.3161 18.7958 15 18.0002 15C17.2045 15 16.4414 15.3161 15.8788 15.8787C15.3162 16.4413 15.0002 17.2044 15.0002 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div 
          className="server add" 
          onClick={onAddServer}
          onMouseEnter={(e) => handleMouseEnter(e, 'Создать сервер')}
          onMouseLeave={handleMouseLeave}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.9851 12.5181C21.0901 10.6962 20.6388 8.88539 19.6911 7.32587C18.7433 5.76636 17.3438 4.53181 15.6783 3.78597C14.0127 3.04013 12.1598 2.81824 10.3652 3.14973C8.57062 3.48122 6.91923 4.35043 5.63003 5.64207C4.34083 6.93371 3.47475 8.58674 3.14665 10.3819C2.81856 12.1771 3.04395 14.0297 3.79294 15.6938C4.54193 17.3579 5.77912 18.7551 7.34043 19.6999C8.90174 20.6447 10.7134 21.0926 12.5351 20.9841M3.60008 9.00009H20.4001M3.60008 15.0001H15.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11.5002 3C9.8155 5.69961 8.92236 8.81787 8.92236 12C8.92236 15.1821 9.8155 18.3004 11.5002 21M12.5002 3C14.7607 6.62188 15.5757 10.9618 14.7832 15.157M16.0002 19H22.0002M19.0002 16V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      
      {/* Tooltip */}
      {tooltip && createPortal(
        <div 
          className="server-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 10000,
            pointerEvents: 'none'
          }}
        >
          <div className="server-tooltip-arrow" />
          <div className="server-tooltip-content">{tooltip.text}</div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ServerList;
