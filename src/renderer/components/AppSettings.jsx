import { useState, useEffect, useRef } from 'react';
import './AppSettings.css';
import { setInputVolume, setOutputVolume, setOutputDevice, updateAppSettings } from '../services/webrtcService';

// Device selection functions (simplified - WebRTC handles this differently)
const setPlaybackDevice = async (deviceId) => {
  // Use the webrtcService function to set output device
  await setOutputDevice(deviceId);
};

const setInputDevice = async (deviceId) => {
  // This would require recreating the local stream with new device
};

function AppSettings({ section, settings, setSettings, onClose }) {
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [recordingKey, setRecordingKey] = useState(null);
  const [micLevel, setMicLevel] = useState(0);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [isDraggingThreshold, setIsDraggingThreshold] = useState(false);
  
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const levelBarRef = useRef(null);

  useEffect(() => {
    // Get real media devices
    const getDevices = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
        setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
      } catch (err) {
        // Could not get devices
      }
    };
    
    getDevices();
    
    // Listen for device changes
    navigator.mediaDevices?.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', getDevices);
  }, []);

  // Автоматически запускаем тест микрофона при открытии раздела голоса
  useEffect(() => {
    if (section === 'voice') {
      startMicTest();
    } else {
      stopMicTest();
    }
    
    return () => stopMicTest();
  }, [section, settings.inputDevice]);

  // Update gain when input volume changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (settings.inputVolume ?? 100) / 100;
    }
  }, [settings.inputVolume]);

  const gainNodeRef = useRef(null);

  const startMicTest = async () => {
    try {
      stopMicTest();
      
      const constraints = {
        audio: {
          deviceId: settings.inputDevice && settings.inputDevice !== 'default' 
            ? { exact: settings.inputDevice } 
            : undefined,
          echoCancellation: settings.echoCancellation ?? true,
          noiseSuppression: settings.noiseSuppression ?? true,
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Apply input volume gain
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = (settings.inputVolume ?? 100) / 100;
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // Signal chain: source → gainNode → analyser
      source.connect(gainNodeRef.current);
      gainNodeRef.current.connect(analyserRef.current);
      
      setIsMicTesting(true);
      analyzeMicLevel();
    } catch (err) {
      console.error('Mic test error:', err);
    }
  };

  const stopMicTest = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    gainNodeRef.current = null;
    setIsMicTesting(false);
    setMicLevel(0);
  };

  const handleThresholdDrag = (e) => {
    if (!levelBarRef.current) return;
    
    const rect = levelBarRef.current.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    const newThreshold = Math.round(percentage);
    updateSetting('micThreshold', newThreshold);
    // Update webrtcService immediately
    updateAppSettings({ micThreshold: newThreshold });
  };

  const handleThresholdMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingThreshold(true);
    handleThresholdDrag(e);
  };

  useEffect(() => {
    if (!isDraggingThreshold) return;
    
    const handleMouseMove = (e) => handleThresholdDrag(e);
    const handleMouseUp = () => setIsDraggingThreshold(false);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove);
    document.addEventListener('touchend', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDraggingThreshold]);

  const analyzeMicLevel = () => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(dataArray);
    
    // Calculate RMS (Root Mean Square) for more accurate volume detection
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const normalizedLevel = Math.min(100, rms * 200);
    
    setMicLevel(normalizedLevel);
    
    animationRef.current = requestAnimationFrame(analyzeMicLevel);
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const startRecordingKey = (keyName) => {
    setRecordingKey(keyName);
  };

  const handleKeyDown = (e, keyName) => {
    if (recordingKey !== keyName) return;
    
    e.preventDefault();
    const keys = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');
    if (e.metaKey) keys.push('Meta');
    
    const key = e.key;
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      keys.push(key.length === 1 ? key.toUpperCase() : key);
    }
    
    if (keys.length > 0 && !['Control', 'Shift', 'Alt', 'Meta'].includes(keys[keys.length - 1])) {
      updateSetting(keyName, keys.join(' + '));
      setRecordingKey(null);
    }
  };

  const renderAppearance = () => (
    <>
      <h2>Внешний вид</h2>
      
      <div className="setting-group">
        <h3>Тема</h3>
        <div className="theme-options">
          {['dark', 'light', 'system'].map(theme => (
            <button
              key={theme}
              className={`theme-btn ${settings.theme === theme ? 'active' : ''}`}
              onClick={() => updateSetting('theme', theme)}
            >
              <div className={`theme-preview ${theme}`}>
                <div className="preview-sidebar" />
                <div className="preview-content" />
              </div>
              <span>{theme === 'dark' ? 'Тёмная' : theme === 'light' ? 'Светлая' : 'Системная'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="setting-group">
        <h3>Масштаб интерфейса</h3>
        <div className="slider-row">
          <input
            type="range"
            min="0.8"
            max="1.5"
            step="0.05"
            value={settings.zoomLevel || 1.1}
            onChange={(e) => updateSetting('zoomLevel', parseFloat(e.target.value))}
          />
          <span>{Math.round((settings.zoomLevel || 1.1) * 100)}%</span>
        </div>
      </div>

      <div className="setting-group">
        <h3>Размер шрифта</h3>
        <div className="slider-row">
          <input
            type="range"
            min="12"
            max="20"
            value={settings.fontSize || 14}
            onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
          />
          <span>{settings.fontSize || 14}px</span>
        </div>
      </div>

      <div className="setting-group">
        <h3>Компактный режим</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.compactMode || false}
            onChange={(e) => updateSetting('compactMode', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Уменьшить отступы между сообщениями</span>
        </label>
      </div>
    </>
  );

  const renderNotifications = () => (
    <>
      <h2>Уведомления</h2>
      
      <div className="setting-group">
        <h3>Уведомления на рабочем столе</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.desktopNotifications ?? true}
            onChange={(e) => updateSetting('desktopNotifications', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Показывать уведомления</span>
        </label>
      </div>

      <div className="setting-group">
        <h3>Звуки</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.messageSound ?? true}
            onChange={(e) => updateSetting('messageSound', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Звук сообщения</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.mentionSound ?? true}
            onChange={(e) => updateSetting('mentionSound', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Звук упоминания</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.callSound ?? true}
            onChange={(e) => updateSetting('callSound', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Звук звонка</span>
        </label>
      </div>

      <div className="setting-group">
        <h3>Упоминания</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.highlightMentions ?? true}
            onChange={(e) => updateSetting('highlightMentions', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Подсвечивать сообщения с упоминанием</span>
        </label>
      </div>
    </>
  );

  const renderVoice = () => {
    const threshold = settings.micThreshold ?? 15;
    const isAboveThreshold = micLevel > threshold;
    
    return (
    <>
      <h2>Голос и видео</h2>
      
      <div className="setting-group">
        <h3>Устройство ввода (микрофон)</h3>
        <select 
          value={settings.inputDevice || 'default'}
          onChange={(e) => {
            updateSetting('inputDevice', e.target.value);
            setInputDevice(e.target.value);
          }}
        >
          <option value="default">По умолчанию</option>
          {audioInputs.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Микрофон ${device.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        
        <div className="mic-test-section">
          <div className="mic-level-container">
            <div 
              className="mic-level-bar" 
              ref={levelBarRef}
              onMouseDown={handleThresholdMouseDown}
              onTouchStart={handleThresholdMouseDown}
            >
              <div 
                className={`mic-level-fill ${isAboveThreshold ? 'active' : ''}`} 
                style={{ width: `${micLevel}%` }} 
              />
              <div 
                className={`mic-threshold-marker ${isDraggingThreshold ? 'dragging' : ''}`}
                style={{ left: `${threshold}%` }}
                title={`Порог: ${threshold}%`}
              />
            </div>
            <span className="mic-level-value">{Math.round(micLevel)}%</span>
          </div>
          <div className="mic-status">
            {isMicTesting ? (
              isAboveThreshold ? (
                <span className="status-speaking">● Говорите</span>
              ) : (
                <span className="status-silent">○ Тишина</span>
              )
            ) : (
              <span className="status-off">Микрофон не активен</span>
            )}
          </div>
          <p className="mic-hint">Перетащите синий маркер для настройки порога срабатывания</p>
        </div>
        
        <div className="slider-row">
          <label>Громкость ввода</label>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.inputVolume ?? 100}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              updateSetting('inputVolume', value);
              setInputVolume(value);
            }}
          />
          <span>{settings.inputVolume ?? 100}%</span>
        </div>
      </div>

      <div className="setting-group">
        <h3>Устройство вывода (динамики)</h3>
        <select
          value={settings.outputDevice || 'default'}
          onChange={(e) => {
            updateSetting('outputDevice', e.target.value);
            setPlaybackDevice(e.target.value);
          }}
        >
          <option value="default">По умолчанию</option>
          {audioOutputs.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || 'Динамик ' + device.deviceId.slice(0, 8)}
            </option>
          ))}
        </select>
        
        <div className="slider-row">
          <label>Громкость вывода</label>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.outputVolume ?? 100}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              updateSetting('outputVolume', value);
              setOutputVolume(value);
            }}
          />
          <span>{settings.outputVolume ?? 100}%</span>
        </div>
      </div>
    </>
  );};

  const renderKeybinds = () => {
    const keybinds = [
      { key: 'muteKey', label: 'Отключить микрофон', default: 'Ctrl + M' },
      { key: 'deafenKey', label: 'Отключить звук', default: 'Ctrl + D' },
      { key: 'pttKey', label: 'Рация (Push-to-Talk)', default: 'Space' },
      { key: 'searchKey', label: 'Поиск', default: 'Ctrl + F' },
      { key: 'settingsKey', label: 'Настройки', default: 'Ctrl + ,' },
      { key: 'closeKey', label: 'Закрыть окно', default: 'Escape' },
    ];

    return (
      <>
        <h2>Горячие клавиши</h2>
        
        <div className="setting-group">
          <p className="keybind-hint">Нажмите на клавишу, затем введите новую комбинацию</p>
          <div className="keybind-list">
            {keybinds.map(({ key, label, default: defaultKey }) => (
              <div key={key} className="keybind-item">
                <span>{label}</span>
                <button
                  className={`keybind-btn ${recordingKey === key ? 'recording' : ''}`}
                  onClick={() => startRecordingKey(key)}
                  onKeyDown={(e) => handleKeyDown(e, key)}
                  onBlur={() => setRecordingKey(null)}
                >
                  {recordingKey === key ? 'Нажмите клавиши...' : (settings[key] || defaultKey)}
                </button>
                {settings[key] && settings[key] !== defaultKey && (
                  <button 
                    className="reset-btn"
                    onClick={() => updateSetting(key, defaultKey)}
                    title="Сбросить"
                  >
                    ↺
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderPrivacy = () => (
    <>
      <h2>Конфиденциальность</h2>
      
      <div className="setting-group">
        <h3>Личные сообщения</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.allowDMs ?? true}
            onChange={(e) => updateSetting('allowDMs', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Разрешить личные сообщения от участников сервера</span>
        </label>
      </div>

      <div className="setting-group">
        <h3>Статус активности</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showActivity ?? true}
            onChange={(e) => updateSetting('showActivity', e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">Показывать текущую активность</span>
        </label>
      </div>
    </>
  );

  const renderContent = () => {
    switch (section) {
      case 'appearance': return renderAppearance();
      case 'notifications': return renderNotifications();
      case 'voice': return renderVoice();
      case 'keybinds': return renderKeybinds();
      case 'privacy': return renderPrivacy();
      default: return null;
    }
  };

  return (
    <div className="app-settings">
      {renderContent()}
      <button className="close-btn" onClick={onClose}>✕ ESC</button>
    </div>
  );
}

export default AppSettings;
