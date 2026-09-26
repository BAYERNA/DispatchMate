from dataclasses import replace

import numpy as np
import pytest

from app.agents.sop_match_agent import SopMatchAgent
from app.rag.embeddings import embed_text
from app.rag.sop_store import SopDocument


def test_hash_embeddings_are_deterministic_and_normalized():
    first = embed_text("화재 인지 후 무전 보고")
    second = embed_text("화재 인지 후 무전 보고")
    assert np.array_equal(first, second)
    assert np.linalg.norm(first) == pytest.approx(1.0)


class FakeRetriever:
    async def search(self, query: str, limit: int = 5):
        document = SopDocument(
            document_id="doc-1", title="화재 현장 표준작전절차", content="화재 인지 즉시 무전으로 지휘관에게 보고한다.",
            source_uri="s3://sop/fire-v3.pdf", document_version="3", license="기관 내부", similarity=0.82,
        )
        return [replace(document)]


@pytest.mark.asyncio
async def test_sop_agent_returns_pgvector_sources_without_exposing_content():
    result = await SopMatchAgent(retriever=FakeRetriever()).run({"report_content": "화재 인지 후 무전 보고"})
    assert result["sop_match_result"]["retrievalMode"] == "pgvector"
    assert result["sop_match_result"]["sources"][0]["documentId"] == "doc-1"
    assert "content" not in result["sop_match_result"]["sources"][0]
