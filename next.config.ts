import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  experimental: {
    cpus: 1,
    // Optional verification mode for hosts that prohibit child processes.
    // Type checking and production optimization still run normally.
    ...(process.env.MANJI_BUILD_THREADS === "1"
      ? {
          webpackBuildWorker: false,
          workerThreads: true,
          useTypeScriptCli: false,
        }
      : {}),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // CSP is generated once per request in src/proxy.ts so Next can nonce
          // its hydration scripts. A second policy here would also be enforced.
        ],
      },
    ];
  },
};
export default config;
