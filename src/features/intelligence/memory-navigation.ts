export function memoryHrefForItem(itemId: string | null | undefined, sourceOrderId?: string | null): string | null {
  const value = itemId?.trim();
  if (!value) return null;
  const orderId = sourceOrderId?.trim();
  const params = new URLSearchParams({ itemId: value });
  if (orderId) params.set('orderId', orderId);
  return `/ai/memory?${params.toString()}`;
}

export function orderReturnHref(orderId: string | null | undefined): string | null {
  const value = orderId?.trim();
  return value ? `/orders/${encodeURIComponent(value)}` : null;
}
