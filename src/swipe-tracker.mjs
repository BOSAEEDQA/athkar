import { horizontalSwipe, swipeStep } from './navigation.mjs';

// Decide a direction once per gesture; a vertical scroll must never turn into
// a page change, and a drag on the counter must never also increment it.
export function createSwipeTracker() {
  let gesture = null, suppressClick = false;
  return {
    start(id, x, y, primary = true) {
      if (!primary || gesture) { gesture = null; suppressClick = true; return; }
      suppressClick = false;
      gesture = { id, x, y, dx: 0, dy: 0, axis: null };
    },
    move(id, x, y) {
      if (!gesture || gesture.id !== id) return false;
      gesture.dx = x - gesture.x; gesture.dy = y - gesture.y;
      const { dx, dy } = gesture;
      if (Math.hypot(dx, dy) > 12) suppressClick = true;
      if (!gesture.axis) {
        if (horizontalSwipe({ dx, dy, numberActiveTouches: 1 })) gesture.axis = 'horizontal';
        else if (Math.abs(dy) > 16) gesture.axis = 'vertical';
      }
      return gesture.axis === 'horizontal';
    },
    end(id, x, y) {
      if (!gesture || gesture.id !== id) return 0;
      this.move(id, x, y);
      const step = gesture.axis === 'horizontal' ? swipeStep(gesture) : 0;
      gesture = null;
      return step;
    },
    cancel() { gesture = null; suppressClick = true; },
    blocksClick() { return suppressClick; },
  };
}
