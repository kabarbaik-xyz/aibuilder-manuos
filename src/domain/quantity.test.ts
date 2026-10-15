import { describe, it, expect } from 'vitest';
import { parseQuantity, formatQuantity, ATOM_SCALE } from './quantity';

describe('F03: Exact Quantity & Atom Conversion', () => {
  it('preserves base-unit quantity precision without floating-point stock', () => {
    expect(parseQuantity('1.125', 3)).toBe(1125000n);
    expect(formatQuantity(1125000n)).toBe('1.125');
    expect(() => parseQuantity('1.5', 0)).toThrow();
    expect(() => parseQuantity('-1', 3)).toThrow();
  });

  it('handles zero and whole units correctly', () => {
    expect(parseQuantity('0', 0)).toBe(0n);
    expect(formatQuantity(0n)).toBe('0');
    expect(parseQuantity('100', 0)).toBe(100_000_000n);
    expect(formatQuantity(100_000_000n)).toBe('100');
  });

  it('rejects excess precision for configured UOM', () => {
    // 3 decimal places allowed, 4 supplied
    expect(() => parseQuantity('2.1234', 3)).toThrow(/exceeds allowed UOM precision/i);
    // 0 decimal places allowed, 1 supplied
    expect(() => parseQuantity('10.5', 0)).toThrow();
  });

  it('rejects malformed and negative quantity inputs', () => {
    expect(() => parseQuantity('abc', 2)).toThrow();
    expect(() => parseQuantity('1.2.3', 2)).toThrow();
    expect(() => parseQuantity('-0.5', 2)).toThrow();
    expect(() => parseQuantity('', 2)).toThrow();
  });

  it('supports 64-bit large quantities accurately', () => {
    const large = '9007199254.123456'; // > Number.MAX_SAFE_INTEGER in atoms
    const atoms = parseQuantity(large, 6);
    expect(atoms).toBe(9007199254123456n);
    expect(formatQuantity(atoms)).toBe(large);
  });

  it('round-trips decimal strings faithfully in JSON serializations', () => {
    const original = '45.0025';
    const atoms = parseQuantity(original, 4);
    const dto = JSON.stringify({ quantity: formatQuantity(atoms) });
    const parsed = JSON.parse(dto);
    expect(parsed.quantity).toBe(original);
  });
});
