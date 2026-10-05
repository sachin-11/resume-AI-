"""
MCP connection pool — one long-lived stdio session per MCP server.

Before: every call spawned `npx -y <server>` (≈2s+ startup), used it once and
closed it. Now each server is started on first use and reused; a dead process or
a timed-out request drops the session so the next call starts a fresh one.

MCP servers expose more than we need (the GitHub server can create repos, push
files, open issues…), so each server has an explicit allowlist of tools agents
may call. Everything else is refused here, before it reaches the server.
"""
import asyncio
import logging
import os
from typing import Optional

from agents.shared.mcp_client import StdioMCPClient

logger = logging.getLogger("agent.mcp")


def _servers() -> dict:
    """Server name → (command, args, env, allowed tools). Read lazily so env changes apply."""
    servers = {
        "github": (
            "npx", ["-y", "@modelcontextprotocol/server-github"],
            {"GITHUB_PERSONAL_ACCESS_TOKEN": os.getenv("GITHUB_PERSONAL_ACCESS_TOKEN") or os.getenv("GITHUB_TOKEN") or ""},
            {"search_repositories"},
        ),
        "brave": (
            "npx", ["-y", "@modelcontextprotocol/server-brave-search"],
            {"BRAVE_SEARCH_API_KEY": os.getenv("BRAVE_SEARCH_API_KEY") or ""},
            {"brave_web_search"},
        ),
    }
    if os.getenv("GOOGLE_CALENDAR_MCP_COMMAND") and os.getenv("GOOGLE_CALENDAR_MCP_ARGS"):
        import json
        servers["calendar"] = (
            os.environ["GOOGLE_CALENDAR_MCP_COMMAND"], json.loads(os.environ["GOOGLE_CALENDAR_MCP_ARGS"]), {},
            {os.getenv("GOOGLE_CALENDAR_MCP_TOOL_NAME", "find_free_slots")},
        )
    return servers


class MCPPool:
    def __init__(self) -> None:
        self._clients: dict[str, StdioMCPClient] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def is_configured(self, server: str) -> bool:
        return server in _servers()

    async def call(self, server: str, tool: str, arguments: dict) -> dict:
        config = _servers().get(server)
        if config is None:
            raise RuntimeError(f"MCP server '{server}' is not configured")
        command, args, extra_env, allowed = config
        if tool not in allowed:
            raise PermissionError(f"MCP tool '{tool}' on '{server}' is not allowlisted")

        client = await self._client(server, command, args, extra_env)
        try:
            return await client.call_tool(tool, arguments)
        except TimeoutError:
            await self._drop(server)  # hung server: start fresh next time
            raise
        finally:
            if not client.is_alive:
                await self._drop(server)

    async def _client(self, server: str, command: str, args: list, extra_env: dict) -> StdioMCPClient:
        lock = self._locks.setdefault(server, asyncio.Lock())
        async with lock:
            client = self._clients.get(server)
            if client is not None and client.is_alive:
                return client
            client = StdioMCPClient(command, args, env={**os.environ, **extra_env})
            if not await client.initialize():
                raise RuntimeError(f"MCP server '{server}' failed to start")
            logger.info("mcp_session_started server=%s", server)
            self._clients[server] = client
            return client

    async def _drop(self, server: str) -> None:
        client: Optional[StdioMCPClient] = self._clients.pop(server, None)
        if client is not None:
            await client.close()

    async def close_all(self) -> None:
        for server in list(self._clients):
            await self._drop(server)


pool = MCPPool()
