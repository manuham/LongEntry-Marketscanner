import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All pages need live API data — skip static prerendering at build time
  output: "standalone",

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
