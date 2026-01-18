import { useState, cloneElement } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

/**
 * Универсальный компонент для всплывающих подсказок
 * Оборачивает любой элемент и показывает tooltip при наведении
 */
function Tooltip({ children, text, position = 'right' }) {
  const [tooltip, setTooltip] = useState(null);

  const handleMouseEnter = (e) => {
    if (!text) return;
    const rect = e.currentTarget.getBoundingClientRect();
    
    let x, y;
    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
        break;
      case 'left':
        x = rect.left - 8;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
      default:
        x = rect.right + 12;
        y = rect.top + rect.height / 2;
        break;
    }
    
    setTooltip({ text, x, y, position });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  // Клонируем дочерний элемент и добавляем обработчики событий
  const childWithHandlers = cloneElement(children, {
    onMouseEnter: (e) => {
      handleMouseEnter(e);
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e) => {
      handleMouseLeave(e);
      children.props.onMouseLeave?.(e);
    }
  });

  return (
    <>
      {childWithHandlers}
      {tooltip && createPortal(
        <div
          className={`tooltip tooltip-${tooltip.position}`}
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          {tooltip.text}
        </div>,
        document.body
      )}
    </>
  );
}

export default Tooltip;
