/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native module — don't bundle it into the server build; require it at runtime.
  serverExternalPackages: ['better-sqlite3'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
