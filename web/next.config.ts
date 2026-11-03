import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
}

export default nextConfig
