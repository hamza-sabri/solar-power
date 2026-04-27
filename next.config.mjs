/** @type {import('next').NextConfig} */
const nextConfig = {
    // we use .mjs files in lib/ — Next handles them fine, but be explicit
    transpilePackages: [],
    experimental: {
        // serverActions ok with default
    },
};

export default nextConfig;
