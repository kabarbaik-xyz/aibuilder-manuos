'use client';

import { Input } from '@/components/ui/input';
import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error?.message || 'Invalid email or password');
      }

      // Safe navigation: ensure returnTo is internal
      const safeTarget = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
      router.push(safeTarget);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container flex min-h-screen items-center justify-center bg-surface p-4 text-ink">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8">
        <div className="mb-6 text-center">
          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary-soft text-primary font-bold text-xl">
            M
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in to ManuOS</h1>
          <p className="mt-1 text-sm text-muted">Precision manufacturing operating system</p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-muted mb-1">
              Email address
            </label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="operator@precisionworks.test"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider text-muted mb-1">
              Password
            </label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-soft focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-muted">
          Normal runtime requires verified workspace credentials. Public registration is disabled.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface flex items-center justify-center text-muted">Loading authentication...</div>}>
      <LoginForm />
    </Suspense>
  );
}

