/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Load the SQL Server drivers with Node's require instead of bundling them (bundling breaks mssql).
  serverExternalPackages: ["mssql", "tedious", "msnodesqlv8"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
