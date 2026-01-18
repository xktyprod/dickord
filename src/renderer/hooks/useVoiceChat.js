import { useState, useRef, useEffect, useCallback } from 'react';

export function useVoiceChat(settings = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState(null);
  
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Анализ громкости для индикатора говорения
  const analyzeVolume = useCallback(() => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Вычисляем среднюю громкость
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedVolume = Math.min(100, average * 1.5);
    
    setVolume(normalizedVolume);
    setIsSpeaking(normalizedVolume > 15); // Порог для определения речи
    
    animationRef.current = requestAnimationFrame(analyzeVolume);
  }, []);

  // Подключение к голосовому каналу
  const connect = useCallback(async () => {
    try {
      setError(null);
      
      const constraints = {
        audio: {
          echoCancellation: settings.echoCancellation ?? true,
          noiseSuppression: settings.noiseSuppression ?? true,
          autoGainControl: settings.autoGainControl ?? true,
          deviceId: settings.inputDevice ? { exact: settings.inputDevice } : undefined
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // Создаём аудио контекст для анализа
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Анализатор для визуализации
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // Gain node для управления громкостью
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = (settings.inputVolume ?? 100) / 100;
      
      source.connect(analyserRef.current);
      source.connect(gainNodeRef.current);
      
      setIsConnected(true);
      analyzeVolume();
      
    } catch (err) {
      console.error('Voice chat error:', err);
      setError(err.message || 'Не удалось получить доступ к микрофону');
    }
  }, [settings, analyzeVolume]);

  // Отключение от голосового канала
  const disconnect = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    gainNodeRef.current = null;
    
    setIsConnected(false);
    setIsSpeaking(false);
    setVolume(0);
    setIsMuted(false);
    setIsDeafened(false);
  }, []);

  // Переключение мута микрофона
  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  }, [isMuted]);

  // Переключение глушения звука
  const toggleDeafen = useCallback(() => {
    setIsDeafened(!isDeafened);
    // При глушении также мутим микрофон
    if (!isDeafened && !isMuted) {
      toggleMute();
    }
  }, [isDeafened, isMuted, toggleMute]);

  // Обновление громкости входа
  useEffect(() => {
    if (gainNodeRef.current && settings.inputVolume !== undefined) {
      gainNodeRef.current.gain.value = settings.inputVolume / 100;
    }
  }, [settings.inputVolume]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isMuted,
    isDeafened,
    isSpeaking,
    volume,
    error,
    connect,
    disconnect,
    toggleMute,
    toggleDeafen,
    setIsMuted,
    setIsDeafened
  };
}
