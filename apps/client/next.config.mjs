/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No eslint-config-next dependency in this pass (kept the dependency
  // list minimal — see package.json); this avoids `next build` trying to
  // interactively bootstrap an ESLint config in a non-interactive shell.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
