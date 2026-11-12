/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep an open development server from overwriting production-build artifacts.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
