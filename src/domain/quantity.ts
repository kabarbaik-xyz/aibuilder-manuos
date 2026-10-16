import { ValidationError } from './errors';

export const ATOM_SCALE = 1_000_000n; // 1 base unit = 1,000,000 atoms
export const MAX_UOM_PRECISION = 6;

/**
 * Parses a decimal string quantity into bigint atoms.
 * 1.000000 -> 1000000n
 * Rejects negative numbers, malformed numbers, and precision exceeding allowed decimals.
 */
export function parseQuantity(value: string, allowedPrecision = 6): bigint {
  if (typeof value !== 'string') {
    throw new ValidationError('Quantity must be provided as a string');
  }

  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new ValidationError(`Malformed quantity '${value}': must be a non-negative decimal string`);
  }

  if (allowedPrecision < 0 || allowedPrecision > MAX_UOM_PRECISION) {
    throw new ValidationError(`UOM precision must be between 0 and ${MAX_UOM_PRECISION}`);
  }

  const [intPartStr, decPartStr = ''] = trimmed.split('.');

  // Check excess precision beyond allowed UOM configuration
  if (decPartStr.length > allowedPrecision) {
    throw new ValidationError(
      `Quantity '${value}' exceeds allowed UOM precision of ${allowedPrecision} decimal place(s)`
    );
  }

  // Integer precision must not have non-zero fractional decimals
  if (allowedPrecision === 0 && decPartStr.length > 0 && BigInt(decPartStr) > 0n) {
    throw new ValidationError(`Pieces / zero-precision UOM cannot have fractional decimals`);
  }

  const intAtoms = BigInt(intPartStr) * ATOM_SCALE;
  const paddedDec = decPartStr.padEnd(6, '0').slice(0, 6);
  const decAtoms = BigInt(paddedDec);

  const totalAtoms = intAtoms + decAtoms;
  if (totalAtoms < 0n) {
    throw new ValidationError('Quantity cannot be negative');
  }

  return totalAtoms;
}

/**
 * Formats bigint atoms back into a decimal string without floating-point errors.
 * 1000000n -> '1'
 * 1125000n -> '1.125'
 */
export function formatQuantity(atoms: bigint): string {
  if (typeof atoms !== 'bigint') {
    throw new ValidationError('Atoms must be a BigInt');
  }
  if (atoms < 0n) {
    throw new ValidationError('Negative atoms cannot be formatted as quantity');
  }

  const intPart = atoms / ATOM_SCALE;
  const fracPart = atoms % ATOM_SCALE;

  if (fracPart === 0n) {
    return intPart.toString();
  }

  const fracStr = fracPart.toString().padStart(6, '0').replace(/0+$/, '');
  return `${intPart.toString()}.${fracStr}`;
}


/**
 * Safely parses any atom-bearing input (bigint, decimal string, integer number) into bigint atoms.
 * Prohibits silent floating-point flooring and non-finite numbers.
 */
export function parseAtomInput(val: unknown): bigint {
  if (typeof val === 'bigint') {
    if (val < 0n) throw new ValidationError('Atom quantity cannot be negative');
    return val;
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) throw new ValidationError('Invalid quantity number');
    if (!Number.isInteger(val)) {
      throw new ValidationError(
        `Fractional numeric values are prohibited for atoms. Provide a decimal quantity string or integer atoms, received: ${val}`
      );
    }
    const b = BigInt(val);
    if (b < 0n) throw new ValidationError('Atom quantity cannot be negative');
    return b;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) throw new ValidationError('Quantity string cannot be empty');
    if (/^\d+n?$/.test(trimmed)) {
      return BigInt(trimmed.replace(/n$/, ''));
    }
    return parseQuantity(trimmed);
  }
  throw new ValidationError(`Unsupported quantity atom type: ${typeof val}`);
}
