import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables the forbidden() function from next/navigation, used by the
    // signed-in shell to return a genuine 403 (not just 403-shaped JSX) for
    // the unverified-email case. Without this flag, forbidden() throws at
    // runtime instead of rendering app/forbidden.tsx with a 403 status.
    authInterrupts: true,
  },
};

export default nextConfig;
