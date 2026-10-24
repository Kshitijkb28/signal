import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport ? { output: "export" as const, images: { unoptimized: true } } : {}),
  turbopack: {
    rules: {
      // Tailwind v4 processes the global stylesheet only. CSS Modules must stay modules: running them through the
      // loader with `as: "*.css"` turned every *.module.css into plain global CSS (unhashed selectors, empty imports).
      "*.css": {
        condition: { all: [{ not: "foreign" }, { not: { path: /\.module\.css$/ } }] },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
