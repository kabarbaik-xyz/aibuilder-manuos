/** Public kill switch for adopting lifecycle workflows on newly created orders. */
export function isOrderLifecycleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MANUOS_ORDER_LIFECYCLE_ENABLED !== 'false';
}
