/**
 * Next.js configuration
 *
 * Security architecture:
 * - Limits Server Action body size to reduce oversized POST abuse (adjust if you add large uploads).
 * - No env secrets belong in this file; keep them in `.env` + `lib/env.ts` validation.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "256kb",
    },
  },
};

export default nextConfig;
