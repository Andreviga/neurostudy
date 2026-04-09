/** @type {import('next').NextConfig} */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

// Wrap with next-pwa if available
let withPWA;
try {
  withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    runtimeCaching: [
      {
        urlPattern: new RegExp(`^${API_BASE}/api/reviews`),
        handler: 'NetworkFirst',
        options: { cacheName: 'reviews-cache', expiration: { maxAgeSeconds: 3600 } },
      },
      {
        urlPattern: new RegExp(`^${API_BASE}/api/profile/today`),
        handler: 'NetworkFirst',
        options: { cacheName: 'profile-cache', expiration: { maxAgeSeconds: 900 } },
      },
    ],
  });
} catch {
  withPWA = (config) => config;
}

module.exports = withPWA(nextConfig);
