'use client';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail } from 'lucide-react';
import React, { useState, Suspense } from 'react';
import Link from 'next/link';
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
    <main className="login-container grid min-h-dvh grid-cols-1 overflow-hidden bg-white text-ink lg:grid-cols-[58.5fr_41.5fr]">
      <section aria-label="About ManuOS" className="relative flex min-h-[600px] flex-col overflow-hidden bg-[#0c1020] px-6 py-7 text-white sm:px-10 sm:py-9 lg:min-h-dvh lg:px-12 lg:py-10 xl:px-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(151,169,255,0.32)_0.7px,transparent_0.7px)] [background-size:22px_22px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative flex items-center justify-between gap-4">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="ManuOS home"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-500 text-white transition group-hover:scale-105" aria-hidden="true">
              <Icon name="network" className="h-6 w-6" />
            </span>
            <div>
              <span className="block text-xl font-bold tracking-tight text-white">ManuOS</span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Manufacturing Orchestrating System</span>
            </div>
          </Link>
          <ButtonLink
            href="/"
            variant="ghost"
            size="small"
            className="inline-flex shrink-0 items-center gap-1.5 border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
            id="login-header-back-link"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to landing page</span>
            <span className="sm:hidden">Landing</span>
          </ButtonLink>
        </div>

        <div className="login-story relative my-auto max-w-3xl py-12 lg:py-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300">
            <Icon name="settings" className="h-4 w-4" />
            Manufacturing Orchestrating System
          </p>
          <h1 className="login-headline mt-7 max-w-2xl font-bold tracking-tight text-white">
            From customer orders
            <span className="mt-1 block text-blue-400">to serialized delivery.</span>
          </h1>
          <p className="login-description mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Coordinate engineering DAGs, finite schedules, double-entry inventory, shop-floor execution, and digital product passports—with CoreAI assisting your team.
          </p>

          <div className="login-workflow" aria-label="Manufacturing workflow">
            <div className="login-workflow-heading">
              <span>One continuous workflow</span>
              <span>Intake to serialized delivery</span>
            </div>
            <ol className="login-workflow-stages">
              {[
                { icon: 'order' as const, title: 'Order Hub', detail: 'Order intake and commitments' },
                { icon: 'engineering' as const, title: 'Engineering', detail: 'BOM revisions and DAG routing' },
                { icon: 'work' as const, title: 'Production', detail: 'Finite planning and shop floor execution' },
                { icon: 'shield' as const, title: 'Quality & Passports', detail: 'Inspections, lot genealogy, and delivery' },
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
              <p><strong>CoreAI Copilot</strong><span>Deterministic math calculates, CoreAI proposes recovery options, your team decides.</span></p>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-500">ManuOS · Manufacturing Orchestrating System</p>
      </section>

      <section aria-labelledby="login-title" className="flex min-h-[620px] flex-col items-center justify-center bg-[#f8f9fc] px-5 py-12 sm:px-10 lg:min-h-dvh lg:px-12 xl:px-16">
        <div className="w-full max-w-md">
          <div className="mb-4">
            <ButtonLink
              href="/"
              variant="ghost"
              size="small"
              className="-ml-2 inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:bg-white hover:text-ink hover:shadow-xs"
              id="back-to-landing-button"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span>Back to landing page</span>
            </ButtonLink>
          </div>

          <div className="login-form-card rounded-2xl border border-line bg-white p-6 sm:p-9">
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
              {loading ? 'Signing in…' : 'Sign In'}
              {!loading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-7 border-t border-line pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs leading-5 text-muted">
            <span>Public registration is disabled.</span>
            <Link href="/demo" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
              <span>Explore Demo Sandbox</span>
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

