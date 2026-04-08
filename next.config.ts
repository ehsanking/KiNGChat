import path from 'path';
import type { NextConfig } from 'next';
import { InjectManifest } from 'workbox-webpack-plugin';

const cdnUrl = process.env.CDN_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  assetPrefix: cdnUrl || undefined,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false,
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'drive.google.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 's8.uupload.ir', port: '', pathname: '/**' },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  webpack: (config, { dev, isServer }) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = { ignored: /.*/ };
    }

    if (!dev && !isServer) {
      config.plugins.push(
        new InjectManifest({
          swSrc: path.join(process.cwd(), 'public/sw.js'),
          swDest: 'static/sw.js',
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        }) as any,
      );
    }

    return config;
  },
};

export default nextConfig;
