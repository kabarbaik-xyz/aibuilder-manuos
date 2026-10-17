export function memoryHrefForItem(itemId: string | null | undefined): string | null {
  const value = itemId?.trim();
  if (!value) return null;
  return `/ai/memory?${new URLSearchParams({ itemId: value }).toString()}`;
}
