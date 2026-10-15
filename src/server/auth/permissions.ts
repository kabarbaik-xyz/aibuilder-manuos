import { ForbiddenError } from '@/domain/errors';
import { Principal } from './principal';

export function hasPermission(principal: Principal, permissionCode: string): boolean {
  return principal.permissions.has(permissionCode);
}

export function requirePermission(principal: Principal, permissionCode: string): void {
  if (!hasPermission(principal, permissionCode)) {
    throw new ForbiddenError(
      `Permission denied: principal is missing required capability '${permissionCode}'`
    );
  }
}

export function requireAnyPermission(principal: Principal, permissionCodes: string[]): void {
  const hasAny = permissionCodes.some((code) => hasPermission(principal, code));
  if (!hasAny) {
    throw new ForbiddenError(
      `Permission denied: principal requires at least one of [${permissionCodes.join(', ')}]`
    );
  }
}
