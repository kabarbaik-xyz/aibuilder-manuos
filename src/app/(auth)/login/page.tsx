'use client';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icons';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail } from 'lucide-react';
import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPostLoginPath } from '@/lib/persona-navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      // The root route resolves the authenticated user's role-aware landing page.
      const safeTarget = getPostLoginPath(returnTo);
      router.push(safeTarget);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-container grid min-h-dvh grid-cols-1 overflow-hidden bg-white text-ink lg:grid-cols-[1.1fr_1fr]">
      <section aria-label="About ManuOS" className="login-intro">
        <div className="login-brand-row">
          <Link href="/" aria-label="ManuOS home"><BrandLogo className="w-36 sm:w-40" /></Link>
          <Link href="/" className="login-back-link" id="login-header-back-link"><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span>Back to website</span></Link>
        </div>

        <div className="login-coreai-story">
          <h1>Get a clearer view.<br /><span>Move forward with CoreAI.</span></h1>
          <p className="login-coreai-description">Your orders, production, and delivery records in one workspace—with CoreAI to help you find answers and review what comes next.</p>
          <div className="login-coreai-benefits">
            {[
              { icon: 'spark' as const, title: 'Ask about your operations', detail: 'Find answers with links to the records behind them.' },
              { icon: 'alert' as const, title: 'Focus on what needs attention', detail: 'Review delivery risks and open the affected orders.' },
              { icon: 'calendar' as const, title: 'Review your next move', detail: 'Explore schedule and recovery proposals before approval.' },
            ].map((item) => (
              <div className="login-coreai-benefit" key={item.title}>
                <span><Icon name={item.icon} /></span>
                <div><h2>{item.title}</h2><p>{item.detail}</p></div>
              </div>
            ))}
          </div>
          <div className="login-coreai-assurance"><Icon name="shield" /><span>Grounded in your records. Reviewed by your team.</span></div>
        </div>
        <p className="login-intro-footer">ManuOS · Connected manufacturing with CoreAI</p>
      </section>

      <section aria-labelledby="login-title" className="flex min-h-0 flex-col items-center justify-center bg-surface px-5 py-8 sm:px-10 lg:min-h-dvh lg:px-12 xl:px-16">
        <div className="w-full max-w-md">
          <div className="login-form-card">
            <div className="mb-8">
              <h2 id="login-title" className="text-2xl font-bold tracking-tight text-ink">Sign in to ManuOS</h2>
              <p className="mt-2 text-sm leading-6 text-muted">Access your workspace and pick up where your team left off.</p>
            </div>

          {errorMessage && (
            <div
              id="login-error"
              role="alert"
              className="mb-5 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger"
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-xs font-semibold text-ink">
                Email address
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={errorMessage ? 'login-error' : undefined}
                  className="login-input w-full rounded-lg border border-line bg-white text-sm text-ink placeholder:text-muted"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-xs font-semibold text-ink">
                Password
              </label>
              <div className="relative">
                <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={errorMessage ? 'login-error' : undefined}
                  className="login-input w-full rounded-lg border border-line bg-white text-sm text-ink placeholder:text-muted"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn primary login-submit flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign In'}
              {!loading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-7 border-t border-line pt-5 flex flex-col gap-3 text-xs leading-5 text-muted">
            <span>Need workspace access? Contact your administrator.</span>
            <Link href="/demo" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
              <span>Explore the demo</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-sm text-muted">Loading authentication…</div>}>
      <LoginForm />
    </Suspense>
  );
}

