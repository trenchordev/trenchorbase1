/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        encoding: false,
      };
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding', 'thread-stream');
    config.ignoreWarnings = [
      { module: /node_modules/, message: /source-map-loader/ },
      { message: /sourceMapURL/ },
    ];
    // Ignore test files
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.test\.(js|mjs|ts|tsx)$/,
      loader: 'ignore-loader',
    });
    return config;
  },
  turbopack: {},
};

export default nextConfig;
