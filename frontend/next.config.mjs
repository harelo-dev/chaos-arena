/** @type {import('next').NextConfig} */
const isApkBuild = process.env.BUILD_APK === "1";

const nextConfig = {
  reactStrictMode: false,
  ...(isApkBuild
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:8000/api/:path*",
            },
          ];
        },
      }),
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
};

export default nextConfig;
