/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wakacje/shared'],
  experimental: {
    serverComponentsExternalPackages: ['exceljs'],
  },
};

module.exports = nextConfig;
