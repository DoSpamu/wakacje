/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wakacje/shared'],
  experimental: {
    serverComponentsExternalPackages: ['exceljs'],
  },
  webpack: (config, { isServer }) => {
    // Resolve .js imports to .ts files for @wakacje/shared (NodeNext ESM style)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };

    // Node.js built-ins used in shared package (loadScoringConfig) — not needed in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        'fs/promises': false,
        path: false,
        url: false,
      };
    }

    return config;
  },
};

module.exports = nextConfig;
