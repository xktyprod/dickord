import { rtdb, auth } from '../firebase';
import { ref, set, onValue, onDisconnect } from 'firebase/database';

let qualityUpdateInterval = null;

/**
 * Начать мониторинг качества соединения
 * @param {string} serverId - ID сервера
 * @param {string} channelId - ID канала
 */
export const startConnectionQualityMonitoring = async (serverId, channelId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const qualityPath = `connectionQuality/${serverId}/${channelId}/${currentUser.uid}`;
  const qualityRef = ref(rtdb, qualityPath);
  
  // Auto-remove on disconnect
  await onDisconnect(qualityRef).remove();
  
  // Update quality every 5 seconds
  const updateQuality = async () => {
    const quality = await measureConnectionQuality();
    
    try {
      await set(qualityRef, {
        quality: quality.level, // 'excellent', 'good', 'fair', 'poor'
        ping: quality.ping,
        packetLoss: quality.packetLoss,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('Could not update connection quality:', err);
    }
  };
  
  // Initial update
  await updateQuality();
  
  // Start interval
  if (qualityUpdateInterval) {
    clearInterval(qualityUpdateInterval);
  }
  
  qualityUpdateInterval = setInterval(updateQuality, 5000);
  
  console.log('Connection quality monitoring started');
};

/**
 * Остановить мониторинг качества соединения
 * @param {string} serverId - ID сервера
 * @param {string} channelId - ID канала
 */
export const stopConnectionQualityMonitoring = async (serverId, channelId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  if (qualityUpdateInterval) {
    clearInterval(qualityUpdateInterval);
    qualityUpdateInterval = null;
  }
  
  const qualityPath = `connectionQuality/${serverId}/${channelId}/${currentUser.uid}`;
  const qualityRef = ref(rtdb, qualityPath);
  
  try {
    await onDisconnect(qualityRef).cancel();
    // Note: Don't remove immediately, let it expire naturally
    console.log('Connection quality monitoring stopped');
  } catch (err) {
    console.warn('Could not stop connection quality monitoring:', err);
  }
};

/**
 * Измерить качество соединения
 * @returns {Promise<Object>} Объект с качеством соединения
 */
const measureConnectionQuality = async () => {
  // Check network connection
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  let quality = {
    level: 'good',
    ping: 0,
    packetLoss: 0
  };
  
  // Check if online
  if (!navigator.onLine) {
    quality.level = 'poor';
    quality.ping = 9999;
    return quality;
  }
  
  // Measure ping using Firebase
  const startTime = Date.now();
  try {
    // Simple ping test - write and read from Firebase
    const testRef = ref(rtdb, `.info/connected`);
    await new Promise((resolve) => {
      let unsub;
      unsub = onValue(testRef, () => {
        if (unsub) unsub();
        resolve();
      }, { onlyOnce: true });
    });
    
    quality.ping = Date.now() - startTime;
  } catch (err) {
    quality.ping = 9999;
  }
  
  // Determine quality level based on ping and connection type
  if (connection) {
    const { effectiveType, downlink, rtt } = connection;
    
    if (effectiveType === '4g' && downlink > 5 && rtt < 100) {
      quality.level = 'excellent';
    } else if (effectiveType === '4g' || (effectiveType === '3g' && downlink > 2)) {
      quality.level = 'good';
    } else if (effectiveType === '3g' || effectiveType === '2g') {
      quality.level = 'fair';
    } else {
      quality.level = 'poor';
    }
    
    // Override based on ping
    if (quality.ping > 300) {
      quality.level = 'poor';
    } else if (quality.ping > 150) {
      quality.level = 'fair';
    } else if (quality.ping < 50) {
      quality.level = 'excellent';
    }
  } else {
    // Fallback to ping-based quality
    if (quality.ping < 50) {
      quality.level = 'excellent';
    } else if (quality.ping < 100) {
      quality.level = 'good';
    } else if (quality.ping < 200) {
      quality.level = 'fair';
    } else {
      quality.level = 'poor';
    }
  }
  
  return quality;
};

/**
 * Подписаться на качество соединения пользователей в канале
 * @param {string} serverId - ID сервера
 * @param {string} channelId - ID канала
 * @param {Function} callback - Функция обратного вызова с объектом {userId: quality}
 * @returns {Function} Функция отписки
 */
export const subscribeToChannelConnectionQuality = (serverId, channelId, callback) => {
  const qualityPath = `connectionQuality/${serverId}/${channelId}`;
  const qualityRef = ref(rtdb, qualityPath);
  
  return onValue(qualityRef, (snapshot) => {
    const qualities = {};
    const data = snapshot.val();
    const now = Date.now();
    const STALE_THRESHOLD = 15000; // 15 seconds
    
    if (data) {
      Object.keys(data).forEach(userId => {
        const qualityData = data[userId];
        const timestamp = qualityData.timestamp || 0;
        
        // Only include recent data
        if (now - timestamp < STALE_THRESHOLD) {
          qualities[userId] = {
            level: qualityData.quality,
            ping: qualityData.ping,
            packetLoss: qualityData.packetLoss
          };
        }
      });
    }
    
    callback(qualities);
  });
};

/**
 * Получить цвет индикатора качества
 * @param {string} level - Уровень качества
 * @returns {string} Цвет в hex
 */
export const getQualityColor = (level) => {
  switch (level) {
    case 'excellent':
      return '#43b581'; // Green
    case 'good':
      return '#faa61a'; // Yellow
    case 'fair':
      return '#f26522'; // Orange
    case 'poor':
      return '#f04747'; // Red
    default:
      return '#99aab5'; // Gray
  }
};
