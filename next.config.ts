import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  distDir: process.env.MANUOS_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
