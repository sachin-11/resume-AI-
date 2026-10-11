"""
MCP client pool — agent-service as an MCP *client*, on the official Python SDK (v2).

One long-lived session per configured MCP server, owned by a background task (the
SDK's Client is an async context manager; its task group must enter and exit in the
same task), fed through a queue. A dead or hung session is dropped and restarted on
the next call.

Transports:
  - Streamable HTTP for remote servers (GitHub's hosted MCP server, our own Resume-AI
    server), with headers per server (e.g. a bearer token);
  - stdio for local servers, started from an EXACT package version (`@x@1.2.3`, never
    `npx -y x` = "whatever is latest today" — a supply-chain risk).

Least privilege: each server has an allowlist; anything else is refused here, before it
reaches the server (MCP servers expose far more than we need — GitHub can push code).

Tool pinning ("rug pull" / tool-poisoning defence): when a session starts we hash every
allowlisted tool's definition (name, description, input schema, annotations). If it
differs from the pin in mcp_pins.json — a server changed what it tells the model —
the tool is refused and an alert fires until someone reviews it and re-pins:
    python -m core.mcp_pool pin      # print current hashes to review / commit
Unpinned tools are accepted with a warning (trust on first use).

Tracing (SEP-414): every call carries W3C trace context in `_meta.traceparent`. The
trace id comes from this request's id, so `mcp_call trace_id=…` here and the MCP
server's audit line for the same call share one id.
"""
import asyncio
import hashlib
import json
import logging
import os
import secrets
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

logger = logging.getLogger("agent.mcp")

PINS_FILE = Path(__file__).resolve().parent.parent / "mcp_pins.json"
CALL_TIMEOUT_S = 30.0
START_TIMEOUT_S = 45.0


@dataclass(frozen=True)
class ServerConfig:
    name: str
    transport: Literal["stdio", "http"]
    allowed: frozenset
    command: str = ""
    args: tuple = ()
    env: tuple = ()          # ((key, value), …) — hashable
    url: str = ""
    headers: tuple = ()      # ((key, value), …)


def _servers() -> dict[str, ServerConfig]:
    """Configured servers. Read lazily, so env changes apply on the next session."""
    servers: dict[str, ServerConfig] = {}
    pat = os.getenv("GITHUB_PERSONAL_ACCESS_TOKEN") or os.getenv("GITHUB_TOKEN")
    if pat:
        # GitHub's hosted MCP server (the npm @modelcontextprotocol/server-github is deprecated);
        # the /readonly endpoint exposes no write tools at all.
        servers["github"] = ServerConfig(
            "github", "http", frozenset({"search_repositories"}),
            url=os.getenv("GITHUB_MCP_URL", "https://api.githubcopilot.com/mcp/readonly"),
            headers=(("Authorization", f"Bearer {pat}"),),
        )
    if os.getenv("BRAVE_API_KEY") or os.getenv("BRAVE_SEARCH_API_KEY"):
        servers["brave"] = ServerConfig(
            "brave", "stdio", frozenset({"brave_web_search"}),
            command="npx", args=("-y", "@brave/brave-search-mcp-server@2.1.4"),
            env=(("BRAVE_API_KEY", os.getenv("BRAVE_API_KEY") or os.getenv("BRAVE_SEARCH_API_KEY") or ""),),
        )
    if os.getenv("GOOGLE_CALENDAR_MCP_COMMAND") and os.getenv("GOOGLE_CALENDAR_MCP_ARGS"):
        servers["calendar"] = ServerConfig(
            "calendar", "stdio", frozenset({os.getenv("GOOGLE_CALENDAR_MCP_TOOL_NAME", "find_free_slots")}),
            command=os.environ["GOOGLE_CALENDAR_MCP_COMMAND"], args=tuple(json.loads(os.environ["GOOGLE_CALENDAR_MCP_ARGS"])),
        )
    if os.getenv("RESUME_AI_MCP_URL") and os.getenv("RESUME_AI_MCP_TOKEN"):
        # Our own MCP server (Next.js /api/mcp) — read-only tools only from here.
        servers["resume_ai"] = ServerConfig(
            "resume_ai", "http", frozenset({"list_campaigns", "search_candidates", "get_candidate", "list_open_slots"}),
            url=os.environ["RESUME_AI_MCP_URL"], headers=(("Authorization", f"Bearer {os.environ['RESUME_AI_MCP_TOKEN']}"),),
        )
    return servers


def tool_fingerprint(tool: Any) -> str:
    """Stable hash of what a tool tells the model (a changed description is how tools get poisoned)."""
    body = {
        "name": tool.name,
        "description": tool.description or "",
        "input_schema": tool.input_schema,
        "annotations": tool.annotations.model_dump(mode="json", exclude_none=True) if tool.annotations else None,
    }
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _traceparent() -> str:
    """W3C traceparent for one MCP call: trace id from the current request id, fresh span id."""
    try:
        from core.observability import request_id_var
        rid = request_id_var.get()
    except Exception:
        rid = "-"
    if rid == "-":
        trace_id = secrets.token_hex(16)
    elif len(rid) == 32 and all(c in "0123456789abcdef" for c in rid):
        trace_id = rid
    else:
        trace_id = hashlib.sha256(rid.encode()).hexdigest()[:32]
    return f"00-{trace_id}-{secrets.token_hex(8)}-01"


def _load_pins() -> dict:
    try:
        return json.loads(PINS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


class ToolDefinitionChanged(PermissionError):
    pass


def _transport(cfg: ServerConfig):
    if cfg.transport == "http":
        from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client
        return streamable_http_client(cfg.url, http_client=create_mcp_http_client(headers=dict(cfg.headers)))
    from mcp import StdioServerParameters
    command = cfg.command
    if sys.platform == "win32" and command in ("npx", "npm"):
        command += ".cmd"
    return StdioServerParameters(command=command, args=list(cfg.args), env={**os.environ, **dict(cfg.env)})


@dataclass
class _Session:
    cfg: ServerConfig
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    ready: Optional[asyncio.Future] = None
    task: Optional[asyncio.Task] = None
    blocked: dict = field(default_factory=dict)       # tool → reason (pin mismatch)

    @property
    def alive(self) -> bool:
        return self.task is not None and not self.task.done()

    async def _run(self) -> None:
        from mcp import Client
        from mcp.types import Implementation
        try:
            async with Client(_transport(self.cfg), read_timeout_seconds=CALL_TIMEOUT_S,
                              client_info=Implementation(name="resume-ai-agent-service", version="1.0.0")) as client:
                await self._check_pins(client)
                self.ready.set_result(True)
                logger.info("mcp_session_started server=%s transport=%s protocol=%s", self.cfg.name, self.cfg.transport,
                            client.protocol_version)
                while True:
                    tool, arguments, meta, fut = await self.queue.get()
                    if tool is None:
                        return
                    if fut.cancelled():
                        continue
                    try:
                        result = await client.call_tool(tool, arguments, meta=meta)
                        if not fut.cancelled():
                            fut.set_result(result)
                    except Exception as e:   # one failed call doesn't end the session
                        if not fut.cancelled():
                            fut.set_exception(e)
        except BaseException as e:
            if self.ready and not self.ready.done():
                self.ready.set_exception(e if isinstance(e, Exception) else RuntimeError(str(e)))
            while not self.queue.empty():
                *_, fut = self.queue.get_nowait()
                if fut and not fut.done():
                    fut.set_exception(RuntimeError(f"MCP session '{self.cfg.name}' ended"))
            if not isinstance(e, (asyncio.CancelledError, GeneratorExit)):
                logger.warning("mcp_session_ended server=%s error=%s", self.cfg.name, type(e).__name__)

    async def _check_pins(self, client) -> None:
        pins = _load_pins().get(self.cfg.name, {})
        tools = {t.name: t for t in (await client.list_tools()).tools}
        for name in self.cfg.allowed:
            tool = tools.get(name)
            if tool is None:
                self.blocked[name] = "not offered by the server"
                continue
            fp = tool_fingerprint(tool)
            if name in pins and pins[name] != fp:
                self.blocked[name] = f"definition changed (pinned {pins[name]}, now {fp}) — review and re-pin"
                logger.error("mcp_tool_definition_changed server=%s tool=%s pinned=%s now=%s", self.cfg.name, name, pins[name], fp)
                try:
                    from core import metrics
                    metrics.alert(f"mcp_pin:{self.cfg.name}:{name}",
                                  f"🧷 MCP tool {self.cfg.name}.{name} changed its definition — refused until re-pinned.")
                except Exception:
                    pass
            elif name not in pins:
                logger.warning("mcp_tool_unpinned server=%s tool=%s fingerprint=%s", self.cfg.name, name, fp)

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        self.ready = loop.create_future()
        self.task = asyncio.create_task(self._run(), name=f"mcp:{self.cfg.name}")
        await asyncio.wait_for(asyncio.shield(self.ready), START_TIMEOUT_S)

    async def call(self, tool: str, arguments: dict) -> Any:
        if tool in self.blocked:
            raise ToolDefinitionChanged(f"MCP tool '{self.cfg.name}.{tool}' refused: {self.blocked[tool]}")
        traceparent = _traceparent()
        fut = asyncio.get_running_loop().create_future()
        started = time.monotonic()
        await self.queue.put((tool, arguments, {"traceparent": traceparent}, fut))
        ok = False
        try:
            result = await asyncio.wait_for(fut, CALL_TIMEOUT_S)
            ok = not getattr(result, "is_error", False)
            return result
        finally:
            logger.info("mcp_call server=%s tool=%s trace_id=%s ok=%s ms=%d", self.cfg.name, tool,
                        traceparent.split("-")[1], ok, (time.monotonic() - started) * 1000)

    async def close(self) -> None:
        if self.alive:
            await self.queue.put((None, None, None, None))
            try:
                await asyncio.wait_for(self.task, 5)
            except (asyncio.TimeoutError, Exception):
                self.task.cancel()


def _as_dict(result: Any) -> dict:
    """CallToolResult → the plain dict shape callers parse (content[].text, structuredContent)."""
    data = result.model_dump(mode="json", by_alias=True, exclude_none=True)
    if data.get("isError"):
        text = "".join(c.get("text", "") for c in data.get("content", []) if c.get("type") == "text")
        raise RuntimeError(f"MCP tool error: {text[:300]}")
    return data


class MCPPool:
    def __init__(self) -> None:
        self._clients: dict[str, _Session] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def is_configured(self, server: str) -> bool:
        return server in _servers()

    async def call(self, server: str, tool: str, arguments: dict) -> dict:
        cfg = _servers().get(server)
        if cfg is None:
            raise RuntimeError(f"MCP server '{server}' is not configured")
        if tool not in cfg.allowed:
            raise PermissionError(f"MCP tool '{tool}' on '{server}' is not allowlisted")
        session = await self._session(cfg)
        try:
            return _as_dict(await session.call(tool, arguments))
        except asyncio.TimeoutError:
            await self._drop(server)   # hung server: start fresh next time
            raise
        finally:
            if not session.alive:
                await self._drop(server)

    async def tools(self, server: str) -> list:
        """The server's full tool list (discovery), e.g. for pinning or an admin view."""
        from mcp import Client
        cfg = _servers()[server]
        async with Client(_transport(cfg), read_timeout_seconds=CALL_TIMEOUT_S) as client:
            return (await client.list_tools()).tools

    async def _session(self, cfg: ServerConfig) -> _Session:
        lock = self._locks.setdefault(cfg.name, asyncio.Lock())
        async with lock:
            s = self._clients.get(cfg.name)
            if s is not None and s.alive and s.cfg == cfg:
                return s
            if s is not None:
                await s.close()
            s = _Session(cfg)
            try:
                await s.start()
            except Exception as e:
                s.task and s.task.cancel()
                raise RuntimeError(f"MCP server '{cfg.name}' failed to start: {type(e).__name__}: {str(e)[:200]}") from e
            self._clients[cfg.name] = s
            return s

    async def _drop(self, server: str) -> None:
        s = self._clients.pop(server, None)
        if s is not None:
            await s.close()

    async def close_all(self) -> None:
        for server in list(self._clients):
            await self._drop(server)


pool = MCPPool()


async def _print_pins(servers: list[str]) -> None:
    out = {}
    configured = _servers()
    for name in servers:
        cfg = configured.get(name)
        if cfg is None:
            print(f"# {name}: not configured (missing env) — skipped", file=sys.stderr)
            continue
        tools = await pool.tools(name)
        out[name] = {t.name: tool_fingerprint(t) for t in tools if t.name in cfg.allowed}
    print(json.dumps(out, indent=2, sort_keys=True))


if __name__ == "__main__":
    # python -m core.mcp_pool pin [server …] — review the output, then save it as mcp_pins.json
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    if sys.argv[1:2] == ["pin"]:
        asyncio.run(_print_pins(sys.argv[2:] or list(_servers())))
    else:
        print(__doc__)
