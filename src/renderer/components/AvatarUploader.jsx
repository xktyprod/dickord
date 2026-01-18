import { useState, useRef } from 'react';
import Avatar from './Avatar';
import './AvatarUploader.css';

/**
 * AvatarUploader component - allows setting avatar via URL
 * 
 * @param {string} currentAvatar - Current avatar URL
 * @param {string} userName - User name for preview
 * @param {Function} onUploadSuccess - Callback when avatar is set (url) => void
 * @param {Function} onUploadError - Callback when setting fails (error) => void
 */
function AvatarUploader({ currentAvatar, userName, onUploadSuccess, onUploadError }) {
  const [error, setError] = useState(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [loading, setLoading] = useState(false);

  const validateImageUrl = async (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  };

  const handleUrlSubmit = async () => {
    if (!urlValue.trim()) {
      setError('Введите URL изображения');
      return;
    }

    // Basic URL validation
    try {
      new URL(urlValue);
    } catch {
      setError('Некорректный URL');
      return;
    }

    setError(null);
    setLoading(true);

    // Validate that URL points to an image
    const isValid = await validateImageUrl(urlValue);
    
    if (!isValid) {
      setError('Не удалось загрузить изображение по этому URL');
      setLoading(false);
      return;
    }

    setLoading(false);
    setShowUrlInput(false);
    setUrlValue('');
    onUploadSuccess?.(urlValue);
  };

  const handleRemoveAvatar = () => {
    onUploadSuccess?.(null);
  };

  return (
    <div className="avatar-uploader">
      <div className="avatar-upload-area" onClick={() => setShowUrlInput(true)}>
        <Avatar
          src={currentAvatar}
          name={userName}
          size="large"
        />
        
        <div className="upload-overlay">
          <svg width="32" height="32" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          <span>Изменить</span>
        </div>
      </div>

      {showUrlInput && (
        <div className="url-input-modal" onClick={() => setShowUrlInput(false)}>
          <div className="url-input-content" onClick={(e) => e.stopPropagation()}>
            <h3>Аватар по ссылке</h3>
            <input
              type="text"
              placeholder="https://example.com/image.png"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              autoFocus
            />
            <div className="url-input-buttons">
              <button 
                className="btn-cancel" 
                onClick={() => {
                  setShowUrlInput(false);
                  setUrlValue('');
                  setError(null);
                }}
              >
                Отмена
              </button>
              <button 
                className="btn-submit" 
                onClick={handleUrlSubmit}
                disabled={loading}
              >
                {loading ? 'Проверка...' : 'Применить'}
              </button>
            </div>
            {currentAvatar && (
              <button 
                className="btn-remove"
                onClick={() => {
                  handleRemoveAvatar();
                  setShowUrlInput(false);
                }}
              >
                Удалить аватар
              </button>
            )}
            {error && <div className="url-error">{error}</div>}
          </div>
        </div>
      )}

      <p className="upload-hint">
        Нажмите чтобы изменить аватар
      </p>
    </div>
  );
}

export default AvatarUploader;
