import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment-specific .env file
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = path.resolve(__dirname, `.env.${nodeEnv}`);
const envDefaultFile = path.resolve(__dirname, '.env.local');

// Try environment-specific first, then .env.local, then defaults
try {
  // Load in order of precedence: .env.local (local overrides) → .env.{NODE_ENV} (env-specific) → defaults
  dotenv.config({ path: envFile, override: false });
  dotenv.config({ path: envDefaultFile, override: false });
} catch (err) {
  // Silently continue if files don't exist
}

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
  // Environment-aware configuration
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development',
    DRY_RUN: process.env.DRY_RUN || 'true',
  },
};

export default nextConfig;
// Cache buster: 1781633511
