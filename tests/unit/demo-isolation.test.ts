import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Import-boundary guard for the demo/production split.
 *
 * Production shells, workspace routes, and shared feature code must never
 * import the demo simulation store (`@/store/graph-store`) or demo seed data
 * (`@/data/seed`). Only files under the demo umbrella may touch them.
 */

const ROOT = path.resolve(__dirname, '../../src');

/** Demo-only directories allowed to import the demo graph store / seed. */
const DEMO_ALLOWLIST_DIRS = [
  path.join(ROOT, 'components', 'demo'),
  path.join(ROOT, 'store'),
];

/** Individual demo files that live outside the demo folder. */
const DEMO_ALLOWLIST_FILES = [
  path.join(ROOT, 'features', 'command-center', 'command-center-view.tsx'),
  path.join(ROOT, 'features', 'command-center', 'audit-modal.tsx'),
  path.join(ROOT, 'features', 'orchestrator', 'orchestrator-view.tsx'),
  path.join(ROOT, 'features', 'orchestrator', 'event-modal.tsx'),
  path.join(ROOT, 'features', 'workstation', 'workstation-view.tsx'),
  path.join(ROOT, 'features', 'customer-portal', 'customer-portal-view.tsx'),
  path.join(ROOT, 'features', 'network', 'network-view.tsx'),
  path.join(ROOT, 'features', 'network', 'deal-modal.tsx'),
  path.join(ROOT, 'features', 'intake', 'intake-modal.tsx'),
  path.join(ROOT, 'features', 'memory', 'memory-modal.tsx'),
  path.join(ROOT, 'features', 'brain', 'brain-drawer.tsx'),
  path.join(ROOT, 'app', 'demo', 'page.tsx'),
  // Production server intelligence legitimately consumes engines/* which
  // import domain types; engines are shared, not demo-only.
];

const FORBIDDEN_PATTERNS = [
  /from\s+['"][^'"]*store\/graph-store['"]/,
  /from\s+['"][^'"]*data\/seed['"]/,
  /require\(['"][^'"]*store\/graph-store['"]\)/,
];

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

function isDemoOnly(file: string): boolean {
  if (DEMO_ALLOWLIST_FILES.includes(file)) return true;
  return DEMO_ALLOWLIST_DIRS.some((dir) => file.startsWith(dir + path.sep));
}

describe('demo/production import isolation', () => {
  const violations: string[] = [];

  for (const file of walk(ROOT)) {
    if (isDemoOnly(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(path.relative(ROOT, file));
        break;
      }
    }
  }

  it('keeps the demo graph store and seed data out of production code', () => {
    expect(violations).toEqual([]);
  });
});
