import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/medical-documents/**": ["./app/prescription-document.css", "./public/fonts/prescription/*", "./public/images/the_klinique_logo-removebg-preview.png", "./node_modules/@sparticuz/chromium/bin/**"],
  },
  images: {
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: supabaseUrl ? [{
      protocol: new URL(supabaseUrl).protocol === "https:" ? "https" : "http",
      hostname: new URL(supabaseUrl).hostname,
      port: new URL(supabaseUrl).port,
      pathname: "/storage/v1/object/public/landing-media/**",
      search: "",
    }] : [],
  },
  async headers() {
    return [{
      source: "/website-media/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
