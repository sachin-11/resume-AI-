/**
 * JSearch API — Job Search via RapidAPI
 *
 * Free tier: 200 requests/month
 * Sign up: rapidapi.com → search "JSearch" → Subscribe (free)
 * Add to .env: JSEARCH_API_KEY=your_key
 *
 * Fallback: If no API key, returns mock jobs for testing
 */

export interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_city: string;
  job_country: string;
  job_apply_link: string;
  job_description: string;
  job_employment_type: string;
  job_salary_currency?: string;
  job_min_salary?: number;
  job_max_salary?: number;
  job_posted_at_datetime_utc: string;
  job_required_skills?: string[];
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
    Benefits?: string[];
  };
}

export interface JobSearchResult {
  jobs: JSearchJob[];
  total: number;
  source: "jsearch" | "mock";
}

// ── Mock jobs for testing (when no API key) ──────────────────────
function getMockJobs(query: string, location: string): JSearchJob[] {
  return [
    {
      job_id: "mock-1",
      job_title: `Senior ${query}`,
      employer_name: "TechCorp India",
      job_city: location,
      job_country: "India",
      job_apply_link: "https://example.com/job/1",
      job_description: `We are looking for a Senior ${query} with 3-5 years of experience. 
Required: Node.js, React.js, PostgreSQL, AWS, Docker, TypeScript.
Responsibilities: Build scalable APIs, mentor junior developers, system design.
CTC: 15-25 LPA. Remote-first culture.`,
      job_employment_type: "FULLTIME",
      job_min_salary: 1500000,
      job_max_salary: 2500000,
      job_posted_at_datetime_utc: new Date().toISOString(),
      job_required_skills: ["Node.js", "React.js", "PostgreSQL", "AWS"],
    },
    {
      job_id: "mock-2",
      job_title: `${query} Engineer`,
      employer_name: "Zepto",
      job_city: "Bangalore",
      job_country: "India",
      job_apply_link: "https://example.com/job/2",
      job_description: `${query} Engineer at Zepto — India's fastest growing quick commerce.
Required: TypeScript, Node.js, Redis, Kafka, Kubernetes.
Build systems handling 100k+ requests/day.
CTC: 20-35 LPA. ESOPs available.`,
      job_employment_type: "FULLTIME",
      job_min_salary: 2000000,
      job_max_salary: 3500000,
      job_posted_at_datetime_utc: new Date(Date.now() - 86400000).toISOString(),
      job_required_skills: ["TypeScript", "Node.js", "Redis", "Kafka"],
    },
    {
      job_id: "mock-3",
      job_title: `Lead ${query}`,
      employer_name: "Razorpay",
      job_city: "Bangalore",
      job_country: "India",
      job_apply_link: "https://example.com/job/3",
      job_description: `Lead ${query} at Razorpay — India's leading fintech.
Required: Node.js, React.js, System Design, Microservices, PostgreSQL.
Lead a team of 5 engineers. Own product features end-to-end.
CTC: 25-40 LPA. Remote option available.`,
      job_employment_type: "FULLTIME",
      job_min_salary: 2500000,
      job_max_salary: 4000000,
      job_posted_at_datetime_utc: new Date(Date.now() - 172800000).toISOString(),
      job_required_skills: ["Node.js", "React.js", "System Design", "Microservices"],
    },
  ];
}

// ── Main search function ─────────────────────────────────────────
export async function searchJobs(params: {
  query: string;
  location?: string;
  page?: number;
  numPages?: number;
  datePosted?: "all" | "today" | "3days" | "week" | "month";
}): Promise<JobSearchResult> {
  const { query, location = "India", page = 1, numPages = 1, datePosted = "week" } = params;

  // No API key — return mock jobs
  if (!process.env.JSEARCH_API_KEY) {
    console.log("[JSearch] No API key — using mock jobs");
    return {
      jobs: getMockJobs(query, location),
      total: 3,
      source: "mock",
    };
  }

  try {
    const url = new URL("https://jsearch.p.rapidapi.com/search");
    url.searchParams.set("query", `${query} in ${location}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("num_pages", String(numPages));
    url.searchParams.set("date_posted", datePosted);
    url.searchParams.set("country", "in"); // India

    const res = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": process.env.JSEARCH_API_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error("[JSearch] API error:", res.status);
      return { jobs: getMockJobs(query, location), total: 3, source: "mock" };
    }

    const data = await res.json();
    const jobs: JSearchJob[] = data.data ?? [];

    return {
      jobs,
      total: data.status === "OK" ? jobs.length : 0,
      source: "jsearch",
    };
  } catch (err) {
    console.error("[JSearch] Fetch failed:", err);
    return { jobs: getMockJobs(query, location), total: 3, source: "mock" };
  }
}

// ── Format salary ────────────────────────────────────────────────
export function formatSalary(job: JSearchJob): string {
  if (!job.job_min_salary && !job.job_max_salary) return "Not disclosed";
  const currency = job.job_salary_currency ?? "INR";
  const fmt = (n: number) => currency === "INR"
    ? `₹${(n / 100000).toFixed(1)}L`
    : `$${Math.round(n / 1000)}K`;
  if (job.job_min_salary && job.job_max_salary)
    return `${fmt(job.job_min_salary)} – ${fmt(job.job_max_salary)}`;
  return fmt(job.job_min_salary ?? job.job_max_salary ?? 0);
}
