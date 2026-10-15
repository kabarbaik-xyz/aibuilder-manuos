// JSON transports quantity atoms as strings. Hydrate only explicit atom fields,
// never IDs, reference numbers, dates or ordinary numeric text.
export function hydrateAtomFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(hydrateAtomFields) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
    /^(?:atoms|.*Atoms)$/.test(key) && typeof entry === 'string' && /^-?\d+$/.test(entry)
      ? BigInt(entry) : hydrateAtomFields(entry),
  ])) as T;
}
export function stringifyQuantities(value: unknown): string {
  return JSON.stringify(value, (_, entry) => typeof entry === 'bigint' ? entry.toString() : entry);
}
