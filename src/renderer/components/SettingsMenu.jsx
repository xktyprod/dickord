import './SettingsMenu.css';

const sections = [
  {
    title: 'Настройки пользователя',
    items: [
      { id: 'account', label: 'Мой аккаунт', icon: 'user' },
      { id: 'privacy', label: 'Конфиденциальность', icon: 'lock' },
    ]
  },
  {
    title: 'Настройки приложения',
    items: [
      { id: 'appearance', label: 'Внешний вид', icon: 'palette' },
      { id: 'notifications', label: 'Уведомления', icon: 'bell' },
      { id: 'voice', label: 'Голос и видео', icon: 'mic' },
      { id: 'keybinds', label: 'Горячие клавиши', icon: 'keyboard' },
    ]
  }
];

const icons = {
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  lock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  palette: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/>
      <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/>
      <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/>
      <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  mic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
  keyboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
      <path d="M6 8h.001"/>
      <path d="M10 8h.001"/>
      <path d="M14 8h.001"/>
      <path d="M18 8h.001"/>
      <path d="M8 12h.001"/>
      <path d="M12 12h.001"/>
      <path d="M16 12h.001"/>
      <path d="M7 16h10"/>
    </svg>
  ),
};

function SettingsMenu({ activeSection, onSectionChange }) {
  return (
    <div className="settings-menu">
      {sections.map(section => (
        <div key={section.title} className="menu-section">
          <h3>{section.title}</h3>
          <div className="menu-list">
            {section.items.map(item => (
              <div 
                key={item.id} 
                className={`menu-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => onSectionChange(item.id)}
              >
                <span className="item-icon">{icons[item.icon]}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default SettingsMenu;
