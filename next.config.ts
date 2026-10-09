import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native / Node-only packages must stay outside the server bundle.
  serverExternalPackages: ['pg', '@prisma/adapter-pg', 'qrcode'],
  // The hero frames ask for these; anything else falls back to the default 75.
  images: {
    qualities: [70, 75, 80],
    // Covers the shop uploads live in object storage and are referenced by their
    // own URL, so the optimiser has to be allowed to fetch from that host. The
    // suffix is the storage provider's, not a wildcard for the whole internet.
    remotePatterns: [{ protocol: 'https', hostname: '**.blob.vercel-storage.com' }],
  },
  // Dev only: without this, opening the dev server as 127.0.0.1 blocks Next's
  // dev resources, and the page never hydrates — so the scroll hero sits frozen.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
