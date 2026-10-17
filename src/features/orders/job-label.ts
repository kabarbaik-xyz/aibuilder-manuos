import type { OrderDto } from './api';

/** Use released manufacturing numbers and item names, never database identifiers. */
export function jobLabel(order: OrderDto | undefined, instance: NonNullable<OrderDto['instances']>[number], index: number): string {
  const line = instance.engineeringRevisionId ? order?.lines?.find(line => line.manufacturingOrders?.some(mo => mo.engineeringRevisionId === instance.engineeringRevisionId)) : undefined;
  const mo = line?.manufacturingOrders?.find(mo => mo.engineeringRevisionId === instance.engineeringRevisionId);
  const item = line?.item ?? order?.item;
  return [mo?.moNumber ?? `Production job ${index + 1}`, item ? `${item.code} · ${item.name}` : null].filter(Boolean).join(' · ');
}
