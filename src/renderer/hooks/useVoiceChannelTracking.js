import { useEffect } from 'react';
import { setUserActivity, clearUserActivity } from '../services/userActivityService';
import { startConnectionQualityMonitoring, stopConnectionQualityMonitoring } from '../services/connectionQualityService';

/**
 * Хук для автоматического отслеживания активности и качества соединения в голосовом канале
 * @param {Object} voiceChannel - Объект голосового канала {serverId, channelId, channelName}
 */
export const useVoiceChannelTracking = (voiceChannel) => {
  useEffect(() => {
    if (!voiceChannel) return;
    
    const { serverId, channelId, channelName } = voiceChannel;
    
    // Установить активность пользователя
    setUserActivity({
      type: 'voice',
      details: channelName || 'Голосовой канал',
      serverId,
      channelId
    });
    
    // Начать мониторинг качества соединения
    startConnectionQualityMonitoring(serverId, channelId);
    
    console.log('Voice channel tracking started:', channelName);
    
    // Cleanup при выходе из канала
    return () => {
      clearUserActivity();
      stopConnectionQualityMonitoring(serverId, channelId);
      console.log('Voice channel tracking stopped');
    };
  }, [voiceChannel]);
};
