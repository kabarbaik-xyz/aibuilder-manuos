import { redirect } from 'next/navigation';
import { UnauthorizedError } from '@/domain/errors';
import { requirePrincipal } from './auth';
import { getLandingPage } from '@/lib/persona-navigation';

/**
 * Result of resolving where a visitor should land on the marketing entry routes
 * (`/` and `/welcome`).
 *
 * - `destination` is set when the visitor holds an active workspace membership:
 *   callers must `redirect(destination)` so authenticated users always reach
 *   their persona workspace instead of looping through the marketing page.
 * - `destination: null` means the marketing page should render. `authenticated`
 *   distinguishes a signed-out visitor (safe to show "Sign In") from a signed-in
 *   visitor whose workspace could not be resolved (show "Open workspace" so they
 *   never fall back into the login loop).
 */
export type LandingResolution =
  | { destination: string; authenticated: true }
  | { destination: null; authenticated: boolean };

function isNextNavigationError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'digest' in err &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    ((err as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
      (err as { digest: string }).digest.startsWith('NEXT_NOT_FOUND'))
  );
}

/**
 * Resolves the persona landing destination for the current request headers.
 *
 * Next.js `redirect()` throws a special digest error; this helper deliberately
 * rethrows those so navigation propagates, while treating every other domain
 * error (unauthenticated, no workspace, etc.) as "render the marketing page".
 */
export async function resolveLanding(headers: Headers): Promise<LandingResolution> {
  try {
    const principal = await requirePrincipal(headers);
    const destination = getLandingPage(
      [...principal.permissions],
      principal.roles ?? [],
      principal.customerId,
      principal.landingPage
    );
    return { destination, authenticated: true };
  } catch (err) {
    if (isNextNavigationError(err)) {
      throw err;
    }
    // UnauthorizedError means there is no session at all; anything else
    // (e.g. ForbiddenError for a missing workspace) still implies a signed-in
    // user, which the marketing CTAs must treat as authenticated.
    return { destination: null, authenticated: !(err instanceof UnauthorizedError) };
  }
}

/** Convenience wrapper for route files: redirects authenticated visitors. */
export async function redirectIfAuthenticated(headers: Headers): Promise<LandingResolution> {
  const resolution = await resolveLanding(headers);
  if (resolution.destination) {
    redirect(resolution.destination);
  }
  return resolution;
}
