"""
Amazon Bedrock AgentCore Code Interpreter — the sandbox candidate code runs in.

Candidate code is untrusted, so it never runs on our servers: each call opens a
fresh AgentCore session (an isolated microVM with no network access by default),
writes the files, runs one shell command under `timeout`, and closes the session.
A fresh session per call also means the candidate's run can never see files or
state from the reference-solution run.

Measured behaviour this relies on (AgentCore built-in interpreter, us-east-1):
  - python3 3.12, node, deno 2.x and coreutils `timeout` are on PATH;
  - a run that `timeout` kills exits 124 and keeps everything printed before it,
    so tests that finished before an infinite loop still count;
  - stopping a session does not interrupt a call in flight (it returned ~60s later),
    which is why every command is wrapped in `timeout` instead.

Needs AWS credentials with bedrock-agentcore:StartCodeInterpreterSession,
InvokeCodeInterpreter and StopCodeInterpreterSession (AGENTCORE_REGION, default us-east-1).
"""
import asyncio
import logging
import os
import time
from functools import lru_cache

logger = logging.getLogger("agent.sandbox")

INTERPRETER = os.getenv("AGENTCORE_CODE_INTERPRETER_ID", "aws.codeinterpreter.v1")


class SandboxError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _client():
    import boto3
    return boto3.client("bedrock-agentcore", region_name=os.getenv("AGENTCORE_REGION", "us-east-1"))


def _last_result(response) -> dict:
    result = None
    for event in response["stream"]:
        result = event.get("result", result)
    if result is None:
        raise SandboxError("Empty response from the code interpreter")
    return result


def _run(files: dict[str, str], command: str, timeout_s: int) -> dict:
    client = _client()
    session = client.start_code_interpreter_session(
        codeInterpreterIdentifier=INTERPRETER, name="code-assessment",
        sessionTimeoutSeconds=max(60, timeout_s + 60),
    )["sessionId"]
    started = time.perf_counter()
    try:
        written = _last_result(client.invoke_code_interpreter(
            codeInterpreterIdentifier=INTERPRETER, sessionId=session, name="writeFiles",
            arguments={"content": [{"path": p, "text": t} for p, t in files.items()]},
        ))
        if written.get("isError"):
            raise SandboxError("Could not write files to the sandbox")
        result = _last_result(client.invoke_code_interpreter(
            codeInterpreterIdentifier=INTERPRETER, sessionId=session, name="executeCommand",
            arguments={"command": f"timeout {int(timeout_s)}s {command}; echo __EXIT__=$?"},
        ))
        out = result.get("structuredContent") or {}
        stdout = (out.get("stdout") or "").replace("\r\n", "\n")
        exit_code = None
        if "__EXIT__=" in stdout:
            stdout, _, tail = stdout.rpartition("__EXIT__=")
            exit_code = int(tail.strip() or -1)
        return {
            "stdout": stdout,
            "stderr": (out.get("stderr") or "").replace("\r\n", "\n")[-4000:],
            "exit_code": exit_code,
            "timed_out": exit_code == 124,
            "ms": int((time.perf_counter() - started) * 1000),
        }
    finally:
        try:
            client.stop_code_interpreter_session(codeInterpreterIdentifier=INTERPRETER, sessionId=session)
        except Exception as e:   # the session also expires on its own
            logger.warning("Stopping sandbox session failed: %s", e)


async def run(files: dict[str, str], command: str, timeout_s: int = 10) -> dict:
    """Run `command` (under `timeout`) in a fresh sandbox holding `files`. Blocking SDK → worker thread."""
    return await asyncio.to_thread(_run, files, command, timeout_s)
