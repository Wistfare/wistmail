import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@wistmail/shared'],
  images: {
    // Avatar URLs come from arbitrary sender domains (gravatar, etc.) so
    // we accept any HTTPS source. Same hostname rules the app already
    // accepts via fetch.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    // Tree-shake icon imports to the specific file each named import lives
    // in. Saves ~80KB on the inbox bundle even though our imports are
    // already named — Next still otherwise pulls the whole barrel for SSR.
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
