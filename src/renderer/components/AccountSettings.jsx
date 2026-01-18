import { useState } from 'react';
import AvatarUploader from './AvatarUploader';
import { updateUserAvatar } from '../services/friendsService';
import './AccountSettings.css';

function AccountSettings({ user, setUser, onClose, onLogout, onAvatarChange }) {
  const [showEmail, setShowEmail] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (field) => {
    setEditing(field);
    setEditValue(user[field]);
  };

  const saveEdit = () => {
    if (editValue.trim()) {
      setUser({ ...user, [editing]: editValue.trim() });
    }
    setEditing(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue('');
  };

  const handleAvatarChange = async (url) => {
    setUser({ ...user, avatar: url });
    try {
      await updateUserAvatar(url);
      // Notify parent to update avatar in voice channel if connected
      onAvatarChange?.(url);
    } catch (err) {
      console.error('Failed to save avatar:', err);
    }
  };

  return (
    <div className="account-settings">
      <div className="header">
        <h1>My Account</h1>
        <button className="close-btn" onClick={onClose}>✕ ESC</button>
      </div>

      <div className="profile-card">
        <div className="banner" />
        <div className="profile-info">
          <AvatarUploader
            currentAvatar={user.avatar}
            userName={user.name}
            onUploadSuccess={handleAvatarChange}
            onUploadError={(error) => {
              console.error('Avatar upload failed:', error);
            }}
          />
          <div className="name">{user.name} <span>#{user.tag}</span></div>
        </div>
      </div>

      <div className="section">
        <h3>General info</h3>
        
        <div className="row">
          <div>
            <label>Username</label>
            {editing === 'name' ? (
              <div className="edit-field">
                <input 
                  value={editValue} 
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                <button className="save-btn" onClick={saveEdit}>✓</button>
                <button className="cancel-btn" onClick={cancelEdit}>✕</button>
              </div>
            ) : (
              <span>{user.name}</span>
            )}
          </div>
          {editing !== 'name' && (
            <button className="btn" onClick={() => startEdit('name')}>Edit</button>
          )}
        </div>

        <div className="row">
          <div>
            <label>Email</label>
            {editing === 'email' ? (
              <div className="edit-field">
                <input 
                  value={editValue} 
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                <button className="save-btn" onClick={saveEdit}>✓</button>
                <button className="cancel-btn" onClick={cancelEdit}>✕</button>
              </div>
            ) : (
              <>
                <span>{showEmail ? user.email : user.email.replace(/(.{2}).*(@.*)/, '$1*****$2')}</span>
                <button className="link" onClick={() => setShowEmail(!showEmail)}>
                  {showEmail ? 'Hide' : 'Reveal'}
                </button>
              </>
            )}
          </div>
          {editing !== 'email' && (
            <button className="btn" onClick={() => startEdit('email')}>Edit</button>
          )}
        </div>
      </div>

      <div className="section">
        <h3>Password</h3>
        <div className="row">
          <div><label>Password</label><span>••••••••••</span></div>
          <button className="btn primary">Change password</button>
        </div>
      </div>

      <div className="section danger-section">
        <h3>Выход</h3>
        <div className="row">
          <div>
            <span>Выйти из аккаунта на этом устройстве</span>
          </div>
          <button className="btn danger" onClick={onLogout}>Выйти</button>
        </div>
      </div>
    </div>
  );
}

export default AccountSettings;
