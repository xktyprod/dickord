import { useState } from 'react';
import './Avatar.css';

/**
 * Avatar component with loading states and fallback
 * 
 * @param {string} src - Avatar image URL
 * @param {string} name - User name for initials fallback
 * @param {string} size - Size: 'small' | 'medium' | 'large' (default: 'medium')
 * @param {boolean} showStatus - Show online status indicator
 * @param {string} status - Status: 'online' | 'idle' | 'offline'
 */
function Avatar({ src, name = '?', size = 'medium', showStatus = false, status = 'offline' }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const getInitials = (name) => {
    if (!name || name === '?') return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  const showImage = src && !imageError;
  const initials = getInitials(name);

  return (
    <div className={`avatar avatar-${size}`}>
      {showImage ? (
        <>
          {!imageLoaded && <div className="avatar-skeleton" />}
          <img
            src={src}
            alt={name}
            className={`avatar-img ${imageLoaded ? 'loaded' : ''}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </>
      ) : (
        <div className="avatar-initials">{initials}</div>
      )}
      {showStatus && (
        <span className={`avatar-status avatar-status-${status}`} />
      )}
    </div>
  );
}

export default Avatar;
