import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="font-bold text-sm">AI Resume Coach</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-white/60 hover:text-white transition-colors">Sign in</Link>
            <Link href="/register" className="rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold transition-colors">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs text-violet-400 font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            AI-Powered Interview Platform
          </div>
          <h1 className="text-5xl sm:text-6xl font-black leading-tight mb-6">
            Ace Every Interview
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">
              With AI Coaching
            </span>
          </h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Practice with an AI interviewer that knows your resume, gives real-time feedback,
            and helps you land your dream job. Used by recruiters to hire smarter.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register"
              className="rounded-xl bg-violet-600 hover:bg-violet-700 px-8 py-3.5 text-base font-bold transition-all hover:scale-105 shadow-lg shadow-violet-500/25">
              Start Free — No Credit Card
            </Link>
            <Link href="/login"
              className="rounded-xl border border-white/10 hover:bg-white/5 px-8 py-3.5 text-base font-medium transition-colors">
              Sign In →
            </Link>
          </div>
          <p className="text-xs text-white/30 mt-4">Free plan includes 5 interviews/month</p>
        </div>

        {/* Hero visual */}
        <div className="max-w-4xl mx-auto mt-16">
          <div className="rounded-2xl border border-white/10 bg-[#111118] overflow-hidden shadow-2xl shadow-black/50">
            {/* Mock browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0d0d14]">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <div className="flex-1 mx-4 rounded-md bg-white/5 px-3 py-1 text-xs text-white/30">
                resume-ai-coach.rasuonline.in/interview/session
              </div>
            </div>
            {/* Mock interview UI */}
            <div className="p-6 space-y-4">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600">
                  <span className="text-xs">🤖</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/80 max-w-md">
                  Hello Sachin! I&apos;m your AI interviewer today. How are you feeling? Are you ready to begin?
                </div>
              </div>
              <div className="flex gap-3 flex-row-reverse">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <span className="text-xs">👤</span>
                </div>
                <div className="rounded-2xl rounded-tr-sm bg-violet-600 px-4 py-3 text-sm text-white max-w-md">
                  I&apos;m feeling great, ready to go!
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600">
                  <span className="text-xs">🤖</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/80 max-w-md">
                  Great! Let&apos;s begin. Can you walk me through your experience with React and how you&apos;ve used it in production?
                  <span className="inline-flex items-center gap-1 ml-2 text-xs text-violet-400">
                    <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" />
                    <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
              {/* Score preview */}
              <div className="mt-4 grid grid-cols-4 gap-3">
                {[["Overall", "82", "text-green-400"], ["Technical", "78", "text-blue-400"], ["Communication", "88", "text-yellow-400"], ["Confidence", "80", "text-violet-400"]].map(([label, score, color]) => (
                  <div key={label} className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                    <p className={`text-xl font-black ${color}`}>{score}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 border-y border-white/5">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            ["1,000+", "Interviews/month"],
            ["85%", "Score improvement"],
            ["4 rounds", "Interview types"],
            ["$19/mo", "Pro plan"],
          ].map(([num, label]) => (
            <div key={label}>
              <p className="text-3xl font-black text-violet-400">{num}</p>
              <p className="text-sm text-white/40 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Everything you need to hire smarter</h2>
            <p className="text-white/50 max-w-xl mx-auto">For candidates practicing interviews and recruiters screening at scale</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { emoji: "🎤", title: "Voice AI Interview", desc: "Real-time speech recognition and AI voice responses. Feels like a real interview." },
              { emoji: "📄", title: "Resume-Based Questions", desc: "AI reads your resume and asks personalized questions about your actual experience." },
              { emoji: "📊", title: "Detailed Feedback", desc: "Scores for Technical, Communication, Confidence with improvement roadmap." },
              { emoji: "👥", title: "Bulk Campaigns", desc: "Send interview links to 100s of candidates. Track completion, scores, integrity." },
              { emoji: "🔒", title: "AI Proctoring", desc: "Face detection, tab switch monitoring, copy-paste detection. Integrity flags." },
              { emoji: "🤖", title: "AI Chat Assistant", desc: "Ask anything about your data. 'Show top candidates' or 'What's my avg score?'" },
              { emoji: "📈", title: "Analytics Dashboard", desc: "Score trends, role comparisons, campaign pass/fail rates with beautiful charts." },
              { emoji: "🎯", title: "ATS Resume Matching", desc: "Compare your resume against any job description. See missing keywords instantly." },
              { emoji: "⚡", title: "RAG Personalization", desc: "Pinecone vector search ensures every question is relevant to your background." },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] p-6 transition-colors">
                <div className="text-3xl mb-3">{emoji}</div>
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Simple, transparent pricing</h2>
            <p className="text-white/50">Start free, upgrade when you need more</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                name: "Free", price: "₹0", period: "/month",
                features: ["5 interviews/month", "Resume analysis", "Basic feedback", "ATS matching"],
                cta: "Get Started", href: "/register", highlight: false,
              },
              {
                name: "Pro", price: "₹1,599", period: "/month",
                features: ["Unlimited interviews", "Advanced analytics", "Audio recording", "All personas", "Priority support", "Webhook integrations"],
                cta: "Start Pro", href: "/register", highlight: true,
                badge: "Most Popular",
              },
              {
                name: "Enterprise", price: "₹8,299", period: "/month",
                features: ["Everything in Pro", "Bulk campaigns", "Team management", "Custom branding", "Dedicated support", "SLA guarantee"],
                cta: "Contact Us", href: "/register", highlight: false,
              },
            ].map(({ name, price, period, features, cta, href, highlight, badge }) => (
              <div key={name} className={`rounded-2xl border p-6 relative ${highlight ? "border-violet-500/50 bg-violet-500/5 ring-1 ring-violet-500/20" : "border-white/10 bg-white/[0.02]"}`}>
                {badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full">{badge}</span>
                  </div>
                )}
                <h3 className="font-bold text-lg mb-1">{name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-black">{price}</span>
                  <span className="text-white/40 text-sm">{period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                      <span className="text-green-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href={href}
                  className={`block text-center rounded-xl py-2.5 text-sm font-semibold transition-colors ${highlight ? "bg-violet-600 hover:bg-violet-700 text-white" : "border border-white/10 hover:bg-white/5"}`}>
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">
            Ready to ace your next interview?
          </h2>
          <p className="text-white/50 mb-8">Join thousands of candidates and recruiters using AI Resume Coach</p>
          <Link href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-8 py-4 text-base font-bold transition-all hover:scale-105 shadow-lg shadow-violet-500/25">
            Get Started Free →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-violet-600">
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-sm font-semibold">AI Resume Coach</span>
          </div>
          <p className="text-xs text-white/30">© 2026 AI Resume Coach. Built with ❤️ on AWS.</p>
          <div className="flex gap-4 text-xs text-white/40">
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
