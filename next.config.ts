import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native / Node-only packages must stay outside the server bundle.
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3', 'qrcode'],
  // The hero frames ask for these; anything else falls back to the default 75.
  images: { qualities: [70, 75, 80] },
  // Dev only: without this, opening the dev server as 127.0.0.1 blocks Next's
  // dev resources, and the page never hydrates — so the scroll hero sits frozen.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
