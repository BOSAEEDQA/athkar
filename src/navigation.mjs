// Arabic reading order: swipe right for the next dhikr, left for the previous.
export const horizontalSwipe = ({ dx, dy, numberActiveTouches }) =>
  numberActiveTouches === 1 && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.5;

export const swipeStep = ({ dx, dy }) =>
  Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? 1 : -1) : 0;

export function browseDhikr(progress, items, currentIndex, step) {
  if (!items.length || !step) return progress;
  const index = (currentIndex + step + items.length) % items.length;
  return { ...progress, selected: items[index].id };
}
