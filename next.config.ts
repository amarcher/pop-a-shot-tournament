import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phone selfies (especially HEIC live-photos) routinely hit 5-10 MB
    // and the default 1 MB cap on server-action bodies silently 413s the
    // baller-gen form. 20 MB matches mtg-dash and gives headroom for
    // multi-shot iPhone bursts.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
