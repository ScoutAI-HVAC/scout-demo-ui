import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
const projectRoot = dirname(fileURLToPath(import.meta.url));
const commit = (process.env.SCOUT_BUILD_COMMIT || "")
  .trim()
  .slice(0, 8);
process.env.SCOUT_BUILD_ID ||= `${commit || "local"}-${Date.now().toString(36)}`;
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: projectRoot,
  env: { SCOUT_BUILD_ID: process.env.SCOUT_BUILD_ID },
  devIndicators: false,
};
export default nextConfig;
