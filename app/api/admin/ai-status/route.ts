import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProviderStatus } from "@/lib/groq";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = getProviderStatus();

  return NextResponse.json({
    ...status,
    groqConfigured: !!process.env.GROQ_API_KEY,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString(),
  });
}
