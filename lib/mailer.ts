import nodemailer from "nodemailer";

function getTransporter() {
  const user = process.env.SMTP_USER?.trim();
  // Gmail App Passwords sometimes have spaces — strip them
  const pass = process.env.SMTP_PASS?.replace(/\s/g, "").trim();

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendInterviewInvite({
  to,
  candidateName,
  role,
  companyName,
  interviewLink,
  difficulty,
  roundType,
}: {
  to: string;
  candidateName: string;
  role: string;
  companyName: string;
  interviewLink: string;
  difficulty: string;
  roundType: string;
}) {
  const transporter = getTransporter();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e2e8f0; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #111118; border: 1px solid #1e1e2e; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 22px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; }
    .body { padding: 32px; }
    .body p { color: #94a3b8; line-height: 1.6; margin: 0 0 16px; }
    .body strong { color: #e2e8f0; }
    .details { background: #1a1a2e; border: 1px solid #1e1e2e; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .detail-row { padding: 10px 0; border-bottom: 1px solid #1e1e2e; overflow: hidden; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #64748b; font-size: 13px; display: block; margin-bottom: 2px; }
    .detail-value { color: #e2e8f0; font-size: 13px; font-weight: 600; display: block; }
    .btn { display: block; background: #7c3aed; color: white !important; text-decoration: none; text-align: center; padding: 16px 32px; border-radius: 12px; font-weight: 700; font-size: 16px; margin: 24px 0; }
    .footer { padding: 20px 32px; border-top: 1px solid #1e1e2e; text-align: center; }
    .footer p { color: #475569; font-size: 12px; margin: 0; }
    .badge { display: inline-block; background: rgba(124,58,237,0.2); color: #a78bfa; border: 1px solid rgba(124,58,237,0.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size:32px;margin-bottom:8px;">🤖</div>
      <h1>AI Interview Invitation</h1>
      <p>You've been invited to an AI-powered interview</p>
    </div>
    <div class="body">
      <span class="badge">📋 Interview Invite</span>
      <p>Hello <strong>${candidateName || "Candidate"}</strong>,</p>
      <p>
        <strong>${companyName}</strong> has invited you to complete an AI-powered interview for the 
        <strong>${role}</strong> position. This interview is conducted by our AI interviewer and 
        typically takes 15–30 minutes.
      </p>
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Position</span>
          <span class="detail-value">${role}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Round Type</span>
          <span class="detail-value">${roundType.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Difficulty</span>
          <span class="detail-value">${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Format</span>
          <span class="detail-value">AI Voice + Text Interview</span>
        </div>
      </div>
      <p>Click the button below to start your interview. The link is unique to you and can only be used once.</p>
      <a href="${interviewLink}" class="btn">🚀 Start My Interview</a>
      <p style="font-size:12px;color:#475569;">
        Or copy this link: <br/>
        <span style="color:#7c3aed;word-break:break-all;">${interviewLink}</span>
      </p>
      <p style="font-size:13px;">
        💡 <strong>Tips:</strong> Find a quiet place, use Chrome or Edge for voice features, and take your time with each answer.
      </p>
      <div style="margin-top:20px;padding:14px;background:#1a1a2e;border:1px solid #1e1e2e;border-radius:10px">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 6px">After your interview, view your results at the Candidate Portal:</p>
        <a href="${appUrl}/candidate/login?email=${encodeURIComponent(candidateName)}" style="color:#7c3aed;font-size:12px;word-break:break-all">${appUrl}/candidate/portal</a>
      </div>
    </div>
    <div class="footer">
      <p>Powered by <a href="${appUrl}" style="color:#7c3aed;text-decoration:none;">AI Resume Coach</a></p>
      <p style="margin-top:8px;">If you didn't expect this email, you can safely ignore it.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"AI Resume Coach" <${process.env.SMTP_USER}>`,
    to,
    subject: `Interview Invitation: ${role} at ${companyName}`,
    html,
  });
}

// ── Shared HTML shell ────────────────────────────────────────────
function emailShell(headerEmoji: string, headerTitle: string, headerSub: string, bodyHtml: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e2e8f0;margin:0;padding:0}
  .wrap{max-width:560px;margin:40px auto;background:#111118;border:1px solid #1e1e2e;border-radius:16px;overflow:hidden}
  .hdr{background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 32px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:20px;font-weight:700}
  .hdr p{color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px}
  .body{padding:28px 32px}
  .body p{color:#94a3b8;line-height:1.6;margin:0 0 14px;font-size:14px}
  .body strong{color:#e2e8f0}
  .box{background:#1a1a2e;border:1px solid #1e1e2e;border-radius:12px;padding:18px;margin:18px 0}
  .row{padding:8px 0;border-bottom:1px solid #1e1e2e}
  .row:last-child{border-bottom:none}
  .lbl{color:#64748b;font-size:12px;display:block;margin-bottom:2px}
  .val{color:#e2e8f0;font-size:13px;font-weight:600;display:block}
  .btn{display:block;background:#7c3aed;color:#fff!important;text-decoration:none;text-align:center;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;margin:20px 0}
  .score{font-size:48px;font-weight:900;text-align:center;margin:8px 0}
  .tag{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;margin-bottom:12px}
  .ftr{padding:18px 32px;border-top:1px solid #1e1e2e;text-align:center}
  .ftr p{color:#475569;font-size:11px;margin:0}
  .chip{display:inline-block;background:#1e1e2e;border:1px solid #2d2d3e;border-radius:6px;padding:3px 8px;font-size:11px;margin:2px}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <div style="font-size:30px;margin-bottom:6px">${headerEmoji}</div>
    <h1>${headerTitle}</h1>
    <p>${headerSub}</p>
  </div>
  <div class="body">${bodyHtml}</div>
  <div class="ftr">
    <p>Powered by <a href="${appUrl}" style="color:#7c3aed;text-decoration:none">AI Resume Coach</a></p>
  </div>
</div></body></html>`;
}

// ── 1. Interview Reminder (1 hour before) ───────────────────────
export async function sendInterviewReminder({
  to, candidateName, role, interviewLink, scheduledAt,
}: {
  to: string; candidateName: string; role: string;
  interviewLink: string; scheduledAt: string;
}) {
  const transporter = getTransporter();
  const body = `
    <span class="tag" style="background:rgba(234,179,8,.15);color:#eab308;border:1px solid rgba(234,179,8,.3)">⏰ Reminder</span>
    <p>Hello <strong>${candidateName || "Candidate"}</strong>,</p>
    <p>Your AI interview for the <strong>${role}</strong> position starts in <strong>1 hour</strong>.</p>
    <div class="box">
      <div class="row"><span class="lbl">Scheduled Time</span><span class="val">${scheduledAt}</span></div>
      <div class="row"><span class="lbl">Position</span><span class="val">${role}</span></div>
      <div class="row"><span class="lbl">Format</span><span class="val">AI Voice + Text Interview</span></div>
    </div>
    <p>Make sure you're in a quiet place with a good microphone. Use Chrome or Edge for best experience.</p>
    <a href="${interviewLink}" class="btn">🚀 Start Interview Now</a>
    <p style="font-size:12px;color:#475569">Link: <span style="color:#7c3aed;word-break:break-all">${interviewLink}</span></p>`;

  await transporter.sendMail({
    from: `"AI Resume Coach" <${process.env.SMTP_USER}>`,
    to,
    subject: `⏰ Reminder: Your ${role} interview starts in 1 hour`,
    html: emailShell("⏰", "Interview Reminder", "Your interview is coming up soon!", body),
  });
}

// ── 2. Interview Completed → Recruiter Alert ─────────────────────
export async function sendRecruiterAlert({
  to, recruiterName, candidateName, candidateEmail, role,
  overallScore, tabSwitchCount, dashboardUrl,
}: {
  to: string; recruiterName: string; candidateName: string;
  candidateEmail: string; role: string; overallScore: number;
  tabSwitchCount: number; dashboardUrl: string;
}) {
  const transporter = getTransporter();
  const scoreColor = overallScore >= 70 ? "#22c55e" : overallScore >= 50 ? "#eab308" : "#ef4444";
  const grade = overallScore >= 85 ? "Excellent" : overallScore >= 70 ? "Pass" : overallScore >= 55 ? "Decent" : "Needs Work";

  const body = `
    <span class="tag" style="background:rgba(124,58,237,.15);color:#a78bfa;border:1px solid rgba(124,58,237,.3)">🔔 New Submission</span>
    <p>Hello <strong>${recruiterName || "Recruiter"}</strong>,</p>
    <p>A candidate has just completed their AI interview. Here's the summary:</p>
    <div class="box">
      <div class="row"><span class="lbl">Candidate</span><span class="val">${candidateName || candidateEmail}</span></div>
      <div class="row"><span class="lbl">Email</span><span class="val">${candidateEmail}</span></div>
      <div class="row"><span class="lbl">Position</span><span class="val">${role}</span></div>
      <div class="row"><span class="lbl">Score</span><span class="val" style="color:${scoreColor}">${overallScore}/100 — ${grade}</span></div>
      ${tabSwitchCount > 0 ? `<div class="row"><span class="lbl">⚠️ Tab Switches</span><span class="val" style="color:${tabSwitchCount >= 3 ? "#ef4444" : "#eab308"}">${tabSwitchCount} time(s) detected</span></div>` : ""}
    </div>
    <div class="score" style="color:${scoreColor}">${overallScore}<span style="font-size:20px;color:#64748b">/100</span></div>
    <a href="${dashboardUrl}" class="btn">📊 View Full Report</a>`;

  await transporter.sendMail({
    from: `"AI Resume Coach" <${process.env.SMTP_USER}>`,
    to,
    subject: `🔔 ${candidateName || candidateEmail} completed interview — Score: ${overallScore}/100`,
    html: emailShell("🔔", "Interview Completed", `${candidateName || candidateEmail} has finished their interview`, body),
  });
}

// ── 3. Score Report → Candidate ──────────────────────────────────
export async function sendScoreReport({
  to, candidateName, role, overallScore, technicalScore,
  communicationScore, confidenceScore, strengths, weakAreas, summary,
}: {
  to: string; candidateName: string; role: string;
  overallScore: number; technicalScore: number;
  communicationScore: number; confidenceScore: number;
  strengths: string[]; weakAreas: string[]; summary: string;
}) {
  const transporter = getTransporter();
  const scoreColor = overallScore >= 70 ? "#22c55e" : overallScore >= 50 ? "#eab308" : "#ef4444";
  const grade = overallScore >= 85 ? "Excellent 🏆" : overallScore >= 70 ? "Pass ✅" : overallScore >= 55 ? "Decent 🟡" : "Needs Work ❌";

  const strengthsHtml = strengths.slice(0, 3).map((s) => `<div style="color:#94a3b8;font-size:13px;padding:4px 0">✓ ${s}</div>`).join("");
  const weakHtml = weakAreas.slice(0, 3).map((w) => `<div style="color:#94a3b8;font-size:13px;padding:4px 0">! ${w}</div>`).join("");

  const body = `
    <span class="tag" style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)">📊 Your Results</span>
    <p>Hello <strong>${candidateName || "Candidate"}</strong>,</p>
    <p>Thank you for completing your AI interview for the <strong>${role}</strong> position. Here are your results:</p>
    <div class="score" style="color:${scoreColor}">${overallScore}<span style="font-size:20px;color:#64748b">/100</span></div>
    <p style="text-align:center;font-size:16px;font-weight:700;color:${scoreColor};margin-top:0">${grade}</p>
    <div class="box">
      <div class="row"><span class="lbl">Technical</span><span class="val">${technicalScore}/100</span></div>
      <div class="row"><span class="lbl">Communication</span><span class="val">${communicationScore}/100</span></div>
      <div class="row"><span class="lbl">Confidence</span><span class="val">${confidenceScore}/100</span></div>
    </div>
    <p style="font-size:13px;color:#94a3b8;font-style:italic;border-left:3px solid #7c3aed;padding-left:12px">${summary}</p>
    ${strengths.length > 0 ? `<p><strong>Your Strengths:</strong></p><div style="margin-bottom:12px">${strengthsHtml}</div>` : ""}
    ${weakAreas.length > 0 ? `<p><strong>Areas to Improve:</strong></p><div>${weakHtml}</div>` : ""}
    <p style="font-size:13px;margin-top:16px">Keep practicing and improving. Good luck! 💪</p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/candidate/portal" class="btn" style="margin-top:16px">📊 View Full Results in Portal</a>`;

  await transporter.sendMail({
    from: `"AI Resume Coach" <${process.env.SMTP_USER}>`,
    to,
    subject: `Your interview results: ${overallScore}/100 — ${role}`,
    html: emailShell("📊", "Your Interview Results", `Here's how you performed`, body),
  });
}

// ── 4. Weekly Campaign Digest → Recruiter ───────────────────────
export async function sendWeeklyDigest({
  to, recruiterName, campaigns,
}: {
  to: string;
  recruiterName: string;
  campaigns: Array<{
    title: string; role: string;
    total: number; completed: number; avgScore: number | null;
  }>;
}) {
  const transporter = getTransporter();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const totalCompleted = campaigns.reduce((s, c) => s + c.completed, 0);
  const totalInvited = campaigns.reduce((s, c) => s + c.total, 0);

  const campaignRows = campaigns.map((c) => `
    <div class="row">
      <span class="lbl">${c.title} — ${c.role}</span>
      <span class="val">${c.completed}/${c.total} completed${c.avgScore !== null ? ` · Avg: ${c.avgScore}/100` : ""}</span>
    </div>`).join("");

  const body = `
    <span class="tag" style="background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.3)">📅 Weekly Summary</span>
    <p>Hello <strong>${recruiterName || "Recruiter"}</strong>,</p>
    <p>Here's your weekly interview campaign summary:</p>
    <div class="box">
      <div class="row"><span class="lbl">Total Invited</span><span class="val">${totalInvited} candidates</span></div>
      <div class="row"><span class="lbl">Completed</span><span class="val">${totalCompleted} interviews</span></div>
      <div class="row"><span class="lbl">Completion Rate</span><span class="val">${totalInvited > 0 ? Math.round((totalCompleted / totalInvited) * 100) : 0}%</span></div>
    </div>
    <p><strong>Campaign Breakdown:</strong></p>
    <div class="box">${campaignRows}</div>
    <a href="${appUrl}/campaigns" class="btn">📊 View All Campaigns</a>`;

  await transporter.sendMail({
    from: `"AI Resume Coach" <${process.env.SMTP_USER}>`,
    to,
    subject: `📅 Weekly Interview Summary — ${totalCompleted} interviews completed`,
    html: emailShell("📅", "Weekly Campaign Digest", `Your interview activity this week`, body),
  });
}

// ── 5. Team Member Invite ────────────────────────────────────────
export async function sendTeamInvite({
  to, memberName, inviterName, orgName, role, tempPassword, loginUrl,
}: {
  to: string; memberName: string; inviterName: string;
  orgName: string; role: string; tempPassword: string; loginUrl: string;
}) {
  const transporter = getTransporter();

  const roleDesc = role === "recruiter"
    ? "Create campaigns, invite candidates, view reports"
    : "View campaigns and reports (read-only)";

  const body = `
    <span class="tag" style="background:rgba(124,58,237,.15);color:#a78bfa;border:1px solid rgba(124,58,237,.3)">👥 Team Invite</span>
    <p>Hello <strong>${memberName || to}</strong>,</p>
    <p>
      <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> 
      on AI Resume Coach as a <strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong>.
    </p>
    <div class="box">
      <div class="row"><span class="lbl">Organization</span><span class="val">${orgName}</span></div>
      <div class="row"><span class="lbl">Your Role</span><span class="val">${role.charAt(0).toUpperCase() + role.slice(1)}</span></div>
      <div class="row"><span class="lbl">Permissions</span><span class="val">${roleDesc}</span></div>
      <div class="row"><span class="lbl">Login Email</span><span class="val">${to}</span></div>
      <div class="row"><span class="lbl">Temp Password</span><span class="val" style="font-family:monospace;letter-spacing:2px">${tempPassword}</span></div>
    </div>
    <p style="color:#eab308;font-size:13px">⚠️ Please change your password after first login from Settings.</p>
    <a href="${loginUrl}" class="btn">🚀 Login to AI Resume Coach</a>
    <p style="font-size:12px;color:#475569">
      Or go to: <span style="color:#7c3aed">${loginUrl}</span>
    </p>`;

  await transporter.sendMail({
    from: `"AI Resume Coach" <${process.env.SMTP_USER}>`,
    to,
    subject: `You've been invited to join ${orgName} on AI Resume Coach`,
    html: emailShell("👥", "Team Invitation", `${inviterName} invited you to ${orgName}`, body),
  });
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetLink,
}: {
  to: string;
  name: string;
  resetLink: string;
}) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"AI Resume Coach" <${process.env.SMTP_USER}>`,
    to,
    subject: "Reset your password",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e2e8f0;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:40px;">
    <h2 style="color:#fff;margin:0 0 8px">Reset your password</h2>
    <p style="color:#94a3b8;margin:0 0 24px">Hi ${name || "there"}, click the button below to reset your password. This link expires in 1 hour.</p>
    <a href="${resetLink}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">Reset Password</a>
    <p style="color:#64748b;font-size:12px;margin:24px 0 0">If you didn't request this, ignore this email. Your password won't change.</p>
    <p style="color:#64748b;font-size:11px;margin:8px 0 0;word-break:break-all;">Or copy: ${resetLink}</p>
  </div>
</body>
</html>`,
  });
}
