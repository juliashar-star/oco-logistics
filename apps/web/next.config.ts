import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

loadEnvConfig(path.join(__dirname, "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@oco/db", "@oco/shared", "@oco/core", "@oco/apiship"],
};

export default nextConfig;
