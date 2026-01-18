import { useState, useEffect } from 'react';
import './ScreenPicker.css';

function ScreenPicker({ onSelect, onClose }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      if (window.electronAPI?.getSources) {
        const sources = await window.electronAPI.getSources();
        setSources(sources);
      } else {
        // Fallback для браузера - используем getDisplayMedia
        // В браузере нельзя получить список источников, 
        // поэтому показываем заглушку
        setSources([{
          id: 'screen:0:0',
          name: 'Весь экран',
          thumbnail: null
        }]);
      }
    } catch (err) {
      console.error('Failed to get sources:', err);
    }
    setLoading(false);
  };

  const handleSelect = async () => {
    if (!selected) return;
    
    try {
      let stream;
      
      if (window.electronAPI?.getSources) {
        // Electron - используем chromeMediaSource
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selected.id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080
            }
          }
        });
      } else {
        // Браузер - используем getDisplayMedia
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
      }
      
      onSelect(stream, selected.name);
    } catch (err) {
      console.error('Failed to capture:', err);
    }
  };

  return (
    <div className="screen-picker-overlay" onClick={onClose}>
      <div className="screen-picker" onClick={e => e.stopPropagation()}>
        <div className="picker-header">
          <h3>Выберите экран для демонстрации</h3>
          <button className="close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <div className="picker-content">
          {loading ? (
            <div className="picker-loading">Загрузка источников...</div>
          ) : sources.length === 0 ? (
            <div className="picker-empty">Источники не найдены</div>
          ) : (
            <div className="sources-grid">
              {sources.map(source => (
                <div 
                  key={source.id}
                  className={`source-item ${selected?.id === source.id ? 'selected' : ''}`}
                  onClick={() => setSelected(source)}
                >
                  <div className="source-thumbnail">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt={source.name} />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className="source-name">{source.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="picker-footer">
          <button className="cancel-btn" onClick={onClose}>Отмена</button>
          <button 
            className="share-btn" 
            onClick={handleSelect}
            disabled={!selected}
          >
            Демонстрировать
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScreenPicker;
