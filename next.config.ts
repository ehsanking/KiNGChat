import type {NextConfig} from 'next';

// The application previously relied on the `@ducanh2912/next-pwa` plugin to enable PWA
// functionality.  In Elahe Messenger v3.0 the dependency on this plugin has been removed to
// simplify the build and reduce bundle size.  If you wish to add a service worker or
// offline caching in the future, integrate your own workbox configuration instead of
// depending on an unmaintained plugin.

const cdnUrl = process.env.CDN_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  assetPrefix: cdnUrl || undefined,
  eslint: {
    // Do not ignore ESLint errors during production builds.  Linting should block builds to
    // maintain code quality.
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's8.uupload.ir',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

// Export the Next.js configuration directly.  If PWA support is desired, you can
// register a service worker in `pages/_app.tsx` or a custom hook without wrapping
// the configuration in a plugin.
export default nextConfig;
