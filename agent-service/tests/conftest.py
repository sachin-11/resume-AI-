import os
import sys
from pathlib import Path

# Tests must never ship traces to the real Langfuse project. Empty values win over
# .env because load_dotenv() doesn't override variables that are already set.
os.environ["LANGFUSE_PUBLIC_KEY"] = ""
os.environ["LANGFUSE_SECRET_KEY"] = ""
# Unit tests use in-memory conversation memory; the Postgres path is verified separately.
os.environ["AGENT_MEMORY"] = "memory"

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import core.llm  # noqa: E402


@pytest.fixture
def fake_llm(monkeypatch):
    """Make every gateway call answer with the given replies, in order."""
    def install(*replies: str) -> FakeListChatModel:
        model = FakeListChatModel(responses=list(replies))
        monkeypatch.setattr(core.llm, "get_llm", lambda temperature=0.3, tier="reasoning": model)
        return model
    return install
