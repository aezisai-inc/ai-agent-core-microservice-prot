import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Amplify Hosting
  output: "export",
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;

