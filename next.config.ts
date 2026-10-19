import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge sits on top of the UI and lands in every screenshot.
  devIndicators: false,
  // Not on Next's built-in external list (which already has @node-rs/argon2
  // and @react-pdf/renderer), so it would be bundled into the server chunk.
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
