import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // Dev: use `npm run dev` (--webpack). Monaco workers + CDN config in lib/monaco-env.ts.
  devIndicators: false,
  env: {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    ACCESS_KEY: process.env.ACCESS_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
    BUCKET_NAME: process.env.BUCKET_NAME,
    REGION: process.env.REGION,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_YEARLY_PRICE_ID: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    STRIPE_ENTERPRISE_MONTHLY_PRICE_ID: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    AGENT_SERVICE_URL: process.env.AGENT_SERVICE_URL,
    AGENT_SECRET: process.env.AGENT_SECRET,
    JSEARCH_API_KEY: process.env.JSEARCH_API_KEY,
    NEXT_PUBLIC_HAS_JSEARCH: process.env.NEXT_PUBLIC_HAS_JSEARCH,
    // MCP server + OAuth (Amplify only exposes env vars listed here to server code).
    // Deliberately absent: MCP_OAUTH_ALLOW_LOCAL_CIMD (dev-only) and MCP_PUBLIC_URL — in production the
    // MCP issuer/audience must be NEXTAUTH_URL's domain (the consent screen needs that login cookie).
    MCP_TOKEN_SECRET: process.env.MCP_TOKEN_SECRET,
    MCP_STATE_SECRET: process.env.MCP_STATE_SECRET,
    MCP_SEND_EMAILS: process.env.MCP_SEND_EMAILS,
  },
};

export default nextConfig;
