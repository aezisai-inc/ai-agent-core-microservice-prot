import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Amplify Hosting handles the output configuration automatically
  // output: "standalone", 
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;

