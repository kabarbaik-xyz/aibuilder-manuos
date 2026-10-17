import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const nextConfig = (phase: string): NextConfig => ({
  output: 'standalone',
  // Dev and production builds must not overwrite each other's manifests.
  distDir: process.env.MANUOS_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'),
  reactStrictMode: true,
  poweredByHeader: false,
});

export default nextConfig;
