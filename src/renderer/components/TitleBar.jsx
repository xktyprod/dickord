import React from 'react';
import './TitleBar.css';

function TitleBar() {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="window-buttons">
          <button className="window-btn minimize" onClick={() => window.electronAPI?.minimize()} title="Свернуть">
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect fill="currentColor" width="10" height="1"/>
            </svg>
          </button>
          <button className="window-btn maximize" onClick={() => window.electronAPI?.maximize()} title="Развернуть">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect fill="none" stroke="currentColor" strokeWidth="1" x="0.5" y="0.5" width="9" height="9"/>
            </svg>
          </button>
          <button className="window-btn close" onClick={() => window.electronAPI?.close()} title="Закрыть">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path fill="currentColor" d="M1 0L0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default TitleBar;
