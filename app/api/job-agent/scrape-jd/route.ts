/**
 * POST /api/job-agent/scrape-jd
 * Fetches a job URL and extracts the JD using AI
 * Body: { url: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractJDFromUrl } from "@/lib/jobAgent";
import { z } from "zod";

const schema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const result = await extractJDFromUrl(parsed.data.url);

  if (!result.extractionSuccess || !result.jobDescription) {
    return NextResponse.json({
      error: "Could not extract job description from this URL. Try LinkedIn, Naukri, or Indeed links — or paste the JD manually.",
      extractionSuccess: false,
    }, { status: 422 });
  }

  return NextResponse.json({ jd: result });
}
