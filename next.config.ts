import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise appends its own block to CLAUDE.md on every start.
  // CLAUDE.md is a hand-written file in this repo, not a generated one.
  agentRules: false,
};

export default nextConfig;
