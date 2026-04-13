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
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e1e2e; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #64748b; font-size: 13px; }
    .detail-value { color: #e2e8f0; font-size: 13px; font-weight: 600; }
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
