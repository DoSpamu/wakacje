/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wakacje/shared'],
  experimental: {
    serverComponentsExternalPackages: ['exceljs'],
  },
  /**
   * Resolve .js imports to .ts files in transpiled monorepo packages.
   * Required because @wakacje/shared uses NodeNext module resolution
   * (explicit .js extensions) while Next.js/webpack needs .ts files.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

module.exports = nextConfig;
