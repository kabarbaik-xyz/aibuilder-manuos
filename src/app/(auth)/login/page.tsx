'use client';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icons';
import { ArrowRight, Eye, EyeOff, Mail } from 'lucide-react';
import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/welcome';

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
    <main className="login-container grid min-h-dvh grid-cols-1 overflow-hidden bg-white text-ink lg:grid-cols-[58.5fr_41.5fr]">
      <section aria-label="About ManuOS" className="relative flex min-h-[600px] flex-col overflow-hidden bg-[#0c1020] px-6 py-7 text-white sm:px-10 sm:py-9 lg:min-h-dvh lg:px-12 lg:py-10 xl:px-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(151,169,255,0.32)_0.7px,transparent_0.7px)] [background-size:22px_22px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-500 text-white" aria-hidden="true">
            <Icon name="network" className="h-6 w-6" />
          </span>
          <div>
            <span className="block text-xl font-bold tracking-tight text-white">ManuOS</span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Manufacturing operations</span>
          </div>
        </div>

        <div className="login-story relative my-auto max-w-3xl py-12 lg:py-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300">
            <Icon name="settings" className="h-4 w-4" />
            Manufacturing orchestration system
          </p>
          <h1 className="login-headline mt-7 max-w-2xl font-bold tracking-tight text-white">
            From customer orders
            <span className="mt-1 block text-blue-400">to finished production.</span>
          </h1>
          <p className="login-description mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Manage engineering, materials, schedules, shop-floor work, quality inspections, and shipments in ManuOS—with CoreAI assistance across your workspace.
          </p>

          <div className="login-workflow" aria-label="Manufacturing workflow">
            <div className="login-workflow-heading">
              <span>One continuous workflow</span>
              <span>Intake to shipment</span>
            </div>
            <ol className="login-workflow-stages">
              {[
                { icon: 'order' as const, title: 'Order Hub', detail: 'Order intake and commitments' },
                { icon: 'engineering' as const, title: 'Engineering', detail: 'BOMs and production workflows' },
                { icon: 'work' as const, title: 'Production', detail: 'Planning, dispatch, and execution' },
                { icon: 'shield' as const, title: 'Quality & delivery', detail: 'Inspections, traceability, and shipments' },
              ].map((item, index) => (
                <li key={item.title}>
                  <div className="login-stage-node"><Icon name={item.icon} /></div>
                  <span className="login-stage-number">0{index + 1}</span>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </li>
              ))}
            </ol>
            <div className="login-workflow-assistant">
              <Icon name="spark" />
              <p><strong>CoreAI</strong><span>Workspace answers, RFQ intake, and operational risk review.</span></p>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-500">ManuOS · Operational manufacturing</p>
      </section>

      <section aria-labelledby="login-title" className="flex min-h-[620px] items-center justify-center bg-[#f8f9fc] px-5 py-12 sm:px-10 lg:min-h-dvh lg:px-12 xl:px-16">
        <div className="login-form-card w-full max-w-md rounded-2xl border border-line bg-white p-6 sm:p-9">
          <div className="mb-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface-muted px-3 py-1.5 text-xs font-medium text-muted">
              <Icon name="lock" className="h-4 w-4 text-primary" />
              Secure workspace access
            </div>
            <h2 id="login-title" className="text-2xl font-bold tracking-tight text-ink">Sign in to ManuOS</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Sign in to continue to your manufacturing workspace.</p>
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
              <label htmlFor="email" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
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
              <label htmlFor="password" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
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
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-7 border-t border-line pt-5 text-xs leading-5 text-muted">
            Public registration is disabled. Contact your workspace administrator if you need access.
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

