"""
Service-to-service auth: who is calling, on whose behalf.

Next.js signs a short-lived HS256 JWT per request (key: AGENT_SECRET, which then
never travels over the wire):
    iss="resume-ai-web", aud="agent-service", sub=<user id>, org=<org id|null>,
    role=<role>, iat, exp (~2 min), jti
The verified `sub` is the caller's user id — agents never trust a user id sent
in a request body when a token is present.

Migration: the old shared `x-agent-secret` header is still accepted while
AGENT_ALLOW_LEGACY_SECRET is not "false" (no user identity in that mode). A
request that presents a token which fails verification is rejected outright,
never downgraded to the legacy check.
"""
import logging
import os
import secrets
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Literal, Optional

import jwt
from fastapi import Header, HTTPException

logger = logging.getLogger("agent.auth")

ISSUER = "resume-ai-web"
AUDIENCE = "agent-service"
LEEWAY_S = 30


@dataclass(frozen=True)
class Caller:
    via: Literal["jwt", "legacy"]
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    role: Optional[str] = None


# Set by `get_caller` for the current request; read by tracing (user/org on traces).
caller_var: ContextVar[Optional[Caller]] = ContextVar("caller", default=None)


def _secret() -> Optional[str]:
    return os.getenv("AGENT_SECRET") or None


def _legacy_allowed() -> bool:
    return os.getenv("AGENT_ALLOW_LEGACY_SECRET", "true").lower() != "false"


def verify_token(token: str) -> Caller:
    """Raises jwt.InvalidTokenError on anything but a valid, unexpired, correctly-scoped token."""
    key = _secret()
    if not key:
        raise jwt.InvalidTokenError("AGENT_SECRET not configured")
    claims = jwt.decode(
        token,
        key,
        algorithms=["HS256"],          # pinned: rejects alg=none and algorithm-confusion tokens
        audience=AUDIENCE,
        issuer=ISSUER,
        leeway=LEEWAY_S,
        options={"require": ["exp", "iat", "sub", "aud", "iss"]},
    )
    sub = claims["sub"]
    if not isinstance(sub, str) or not sub:
        raise jwt.InvalidTokenError("Invalid subject")
    org = claims.get("org")
    role = claims.get("role")
    return Caller(
        via="jwt",
        user_id=sub,
        org_id=org if isinstance(org, str) and org else None,
        role=role if isinstance(role, str) else None,
    )


async def get_caller(
    authorization: Optional[str] = Header(None),
    x_agent_secret: Optional[str] = Header(None),
) -> Caller:
    """FastAPI dependency guarding every agent endpoint."""
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="Invalid authorization header")
        try:
            caller = verify_token(token.strip())
        except jwt.InvalidTokenError as e:
            logger.warning("Rejected agent token: %s", e)
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    elif _legacy_allowed():
        key = _secret()
        # Fail closed: an unset AGENT_SECRET locks the service, never falls back to a default.
        if not key or not x_agent_secret or not secrets.compare_digest(x_agent_secret, key):
            raise HTTPException(status_code=401, detail="Invalid agent secret")
        caller = Caller(via="legacy")
    else:
        raise HTTPException(status_code=401, detail="Bearer token required")

    caller_var.set(caller)
    return caller


def resolve_user_id(caller: Caller, claimed: Optional[str]) -> Optional[str]:
    """The user a request acts for: the token's subject, never a conflicting body/query value."""
    if caller.via == "jwt":
        if claimed and claimed != caller.user_id:
            raise HTTPException(status_code=403, detail="user_id does not match the authenticated user")
        return caller.user_id
    return claimed
