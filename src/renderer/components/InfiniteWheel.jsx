import { useState, useMemo, useEffect, useRef } from 'react';
import './InfiniteWheel.css';

/**
 * InfiniteWheel - Reusable infinite scrolling wheel component
 * 
 * @param {Array} items - Array of items to display in the wheel
 * @param {string|number} activeItemId - ID of the currently active item
 * @param {Function} onItemClick - Callback when an item is clicked
 * @param {Function} renderItem - Function to render each item (item, isActive, isCenter) => ReactNode
 * @param {number} visibleCount - Number of visible items (default: 7, must be odd)
 */
function InfiniteWheel({ items = [], activeItemId, onItemClick, renderItem, visibleCount = 7 }) {
  const [wheelOffset, setWheelOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const animationRef = useRef(null);
  const centerIndex = Math.floor(visibleCount / 2);
  
  // Easing function for smooth animation
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  
  // Animate wheel to center on active item when it changes
  useEffect(() => {
    if (items.length === 0 || !activeItemId) return;
    
    const activeIdx = items.findIndex(item => item.id === activeItemId);
    if (activeIdx === -1) return;
    
    const targetOffset = activeIdx;
    
    // Normalize current offset
    let currentOffset = wheelOffset % items.length;
    if (currentOffset < 0) currentOffset += items.length;
    
    // Find shortest path
    let diff = targetOffset - currentOffset;
    if (Math.abs(diff) > items.length / 2) {
      diff = diff > 0 ? diff - items.length : diff + items.length;
    }
    
    if (Math.abs(diff) < 0.01) return;
    
    // Animate with easing
    setIsAnimating(true);
    const startOffset = wheelOffset;
    const duration = 400; // ms
    const startTime = performance.now();
    
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      
      const newOffset = startOffset + diff * easedProgress;
      setWheelOffset(newOffset);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        setWheelOffset(targetOffset);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [activeItemId, items, wheelOffset]);

  const wheelItems = useMemo(() => {
    if (items.length === 0) return [];
    
    const result = [];
    const roundedOffset = Math.round(wheelOffset);
    
    for (let i = 0; i < visibleCount; i++) {
      const offset = i - centerIndex + roundedOffset;
      
      // Proper modulo for infinite scroll (handles negative numbers)
      let itemIdx = offset % items.length;
      if (itemIdx < 0) itemIdx += items.length;
      
      // Calculate fractional distance for smooth scaling
      const fractionalOffset = wheelOffset - roundedOffset;
      const distanceFromCenter = Math.abs(i - centerIndex + fractionalOffset);
      
      result.push({
        ...items[itemIdx],
        position: i,
        distanceFromCenter,
      });
    }
    
    return result;
  }, [items, wheelOffset, visibleCount, centerIndex]);

  const handleWheel = (e) => {
    if (isAnimating || items.length === 0) return;
    e.preventDefault();
    
    // Infinite scroll: always allow scrolling regardless of count
    const delta = e.deltaY > 0 ? 1 : -1;
    setWheelOffset(prev => prev + delta);
  };

  const handleTouchStart = (e) => {
    if (items.length === 0) return;
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e) => {
    if (touchStart === null || isAnimating || items.length === 0) return;
    
    const touchCurrent = e.touches[0].clientY;
    const diff = touchStart - touchCurrent;
    
    // Threshold for scroll
    if (Math.abs(diff) > 30) {
      const delta = diff > 0 ? 1 : -1;
      setWheelOffset(prev => prev + delta);
      setTouchStart(touchCurrent);
    }
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
  };

  const getScale = (distanceFromCenter) => {
    return Math.max(0.4, 1 - distanceFromCenter * 0.15);
  };

  if (items.length === 0) {
    return <div className="infinite-wheel empty">No items</div>;
  }

  return (
    <div 
      className="infinite-wheel" 
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {wheelItems.map((item, idx) => {
        const scale = getScale(item.distanceFromCenter);
        const isCenter = item.distanceFromCenter < 0.5;
        const isActive = item.id === activeItemId;
        
        return (
          <div 
            key={`${item.id}-${idx}`}
            className={`wheel-item ${isCenter ? 'center' : ''}`}
            style={{ 
              transform: `scale(${scale})`,
              opacity: 0.4 + scale * 0.6,
            }}
            onClick={() => onItemClick?.(item)}
          >
            {renderItem(item, isActive, isCenter)}
          </div>
        );
      })}
    </div>
  );
}

export default InfiniteWheel;
