import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product-photo uploads flow through a Server Action; raise the default 1 MB
    // body limit (images are capped at 3 MB in the app, safely under Netlify's ~6 MB).
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
