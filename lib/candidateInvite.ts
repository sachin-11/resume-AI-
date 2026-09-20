import { db } from "@/lib/db";

/**
 * Public interview routes are keyed by sessionId, which is a guessable/leakable
 * cuid, not a secret. This confirms the caller also holds the invite `token`
 * bound to that exact session before any read/write is allowed.
 */
export async function verifyInviteToken(sessionId: string | null | undefined, token: string | null | undefined): Promise<boolean> {
  if (!sessionId || !token) return false;
  const invite = await db.candidateInvite.findFirst({
    where: { token, sessionId },
    select: { id: true },
  });
  return !!invite;
}
