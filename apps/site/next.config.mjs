/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Force clean build - no cached routes
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
};

export default nextConfig;
// Cache buster: 1781633511
