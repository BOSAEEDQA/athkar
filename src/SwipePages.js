import React, { useRef } from 'react';
import { createSwipeTracker } from './swipe-tracker.mjs';

export default function SwipePages({ children, onSwipe, disabled = false, label }) {
  const tracker = useRef(null);
  if (!tracker.current) tracker.current = createSwipeTracker();
  return <div className="swipe-pages" role="region" aria-label={label} tabIndex={0}
    onPointerDownCapture={e => {
      if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      tracker.current.start(e.pointerId, e.clientX, e.clientY, e.isPrimary);
    }}
    onPointerMoveCapture={e => {
      if (disabled) return;
      if (tracker.current.move(e.pointerId, e.clientX, e.clientY) && e.cancelable) e.preventDefault();
    }}
    onPointerUpCapture={e => {
      if (disabled) { tracker.current.cancel(); return; }
      const step = tracker.current.end(e.pointerId, e.clientX, e.clientY);
      if (step) onSwipe(step);
    }}
    onPointerCancelCapture={() => tracker.current.cancel()}
    onClickCapture={e => {
      if (!disabled && e.detail !== 0 && tracker.current.blocksClick()) { e.preventDefault(); e.stopPropagation(); }
    }}
    onKeyDown={e => {
      if (disabled || e.target !== e.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault(); onSwipe(e.key === 'ArrowRight' ? 1 : -1);
    }}
  >{children}</div>;
}
