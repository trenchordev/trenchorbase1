/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  productionBrowserSourceMaps: false,
  webpack: (config) => {
    config.ignoreWarnings = [
      { module: /node_modules/, message: /source-map-loader/ },
      { message: /sourceMapURL/ },
    ];
    return config;
  },
  turbopack: {},
};

export default nextConfig;
