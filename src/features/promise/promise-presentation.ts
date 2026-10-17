export function getPromiseDateDeltaLabel(deltaDays: number | null): string {
  if (deltaDays === null) return 'Date comparison unavailable';
  if (deltaDays === 0) return 'Completes on the requested date';
  if (deltaDays < 0) {
    const days = Math.abs(deltaDays);
    return `Completes ${days} ${days === 1 ? 'day' : 'days'} before the requested date`;
  }
  return `Completes ${deltaDays} ${deltaDays === 1 ? 'day' : 'days'} after the requested date`;
}
