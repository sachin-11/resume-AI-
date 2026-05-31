"""
Standard Stdio-based Model Context Protocol (MCP) Client in Python.

Allows launching stdio-based MCP servers (like npx -y @modelcontextprotocol/server-github)
and calling their tools using JSON-RPC 2.0.
"""
import os
import json
import asyncio
import sys
from typing import Dict, Any, Optional

class StdioMCPClient:
    def __init__(self, command: str, args: list, env: Optional[Dict[str, str]] = None):
        self.command = command
        self.args = args
        self.env = env or os.environ.copy()
        self.process: Optional[asyncio.subprocess.Process] = None
        self.request_id = 0
        self.pending_requests: Dict[int, asyncio.Future] = {}
        self.read_task: Optional[asyncio.Task] = None

    async def initialize(self) -> bool:
        """Launch the MCP server and initialize the protocol session."""
        try:
            # On Windows, we need shell=True for node/npx commands to be resolved correctly
            is_windows = sys.platform == "win32"
            
            # Construct complete command list
            full_cmd = [self.command] + self.args
            cmd_str = " ".join(full_cmd) if is_windows else full_cmd

            if is_windows:
                self.process = await asyncio.create_subprocess_shell(
                    cmd_str,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=self.env
                )
            else:
                self.process = await asyncio.create_subprocess_exec(
                    self.command,
                    *self.args,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=self.env
                )

            # Start reading stdout loop
            self.read_task = asyncio.create_task(self._read_loop())

            # Perform MCP handshake (initialize)
            init_res = await self._send_request(
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "langgraph-screening-client", "version": "1.0.0"}
                }
            )

            # Send initialized notification
            await self._send_notification("notifications/initialized")
            return True
        except Exception as e:
            print(f"[MCP CLIENT ERROR] Handshake failed: {e}")
            await self.close()
            return False

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a tool on the MCP server."""
        if not self.process:
            raise RuntimeError("MCP client is not initialized or has been closed")

        response = await self._send_request(
            "tools/call",
            {
                "name": tool_name,
                "arguments": arguments
            }
        )
        return response

    async def list_tools(self) -> Dict[str, Any]:
        """Retrieve the list of tools supported by the MCP server."""
        if not self.process:
            raise RuntimeError("MCP client is not initialized")
        return await self._send_request("tools/list", {})

    async def _send_request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        self.request_id += 1
        curr_id = self.request_id
        future = asyncio.get_running_loop().create_future()
        self.pending_requests[curr_id] = future

        msg = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": curr_id
        }
        
        payload = json.dumps(msg) + "\n"
        self.process.stdin.write(payload.encode("utf-8"))
        await self.process.stdin.drain()

        # Wait for matching response id
        try:
            return await asyncio.wait_for(future, timeout=30.0)
        except asyncio.TimeoutError:
            self.pending_requests.pop(curr_id, None)
            raise TimeoutError(f"MCP request {method} (id={curr_id}) timed out after 30 seconds")

    async def _send_notification(self, method: str, params: Optional[Dict[str, Any]] = None):
        msg = {
            "jsonrpc": "2.0",
            "method": method
        }
        if params is not None:
            msg["params"] = params

        payload = json.dumps(msg) + "\n"
        self.process.stdin.write(payload.encode("utf-8"))
        await self.process.stdin.drain()

    async def _read_loop(self):
        """Continuously read stdout lines from the MCP server and parse JSON-RPC messages."""
        try:
            while self.process and self.process.stdout:
                line = await self.process.stdout.readline()
                if not line:
                    break
                
                try:
                    data = json.loads(line.decode("utf-8").strip())
                    if "id" in data:
                        resp_id = data["id"]
                        if resp_id in self.pending_requests:
                            future = self.pending_requests.pop(resp_id)
                            if "error" in data:
                                future.set_exception(Exception(data["error"]))
                            else:
                                future.set_result(data.get("result", {}))
                except Exception as json_err:
                    # Ignore malformed stdout logs (some servers print non-JSON logs to stdout, though discouraged)
                    continue
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[MCP CLIENT READ ERROR] {e}")

    async def close(self):
        """Close connection and terminate server subprocess."""
        if self.read_task:
            self.read_task.cancel()
        
        if self.process:
            try:
                self.process.terminate()
                await self.process.wait()
            except Exception:
                pass
            self.process = None

        # Clean up any pending futures
        for future in self.pending_requests.values():
            if not future.done():
                future.set_exception(RuntimeError("MCP Client closed"))
        self.pending_requests.clear()
