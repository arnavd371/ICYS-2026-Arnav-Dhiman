/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // If your CSS breaks on the live site, uncomment the line below and add your repo name
  // basePath: '/your-github-repo-name',
};

export default nextConfig;
