"""FR-08: backend(/api/v1/sop/search) pgvector 결과를 임계값으로 매칭 판정하는 경로와,
backend 호출이 실패했을 때 예전 키워드 매칭으로 조용히 대체되는 경로(NFR-07) 둘 다 검증한다."""

import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agents.sop_match_agent import SopMatchAgent  # noqa: E402
from app.core.backend_client import BackendClientError  # noqa: E402


def _agent_with_mocked_backend(search_sop_result=None, search_sop_side_effect=None) -> SopMatchAgent:
    backend_client = AsyncMock()
    if search_sop_side_effect is not None:
        backend_client.search_sop.side_effect = search_sop_side_effect
    else:
        backend_client.search_sop.return_value = search_sop_result
    return SopMatchAgent(llm=None, backend_client=backend_client)


@pytest.mark.asyncio
async def test_벡터_검색_결과가_임계값_이상이면_일치로_표시된다():
    agent = _agent_with_mocked_backend(
        search_sop_result=[
            {"sopId": "1", "item": "화재 인지 → 무전 보고", "reference": "§4.2 무전 보고 원칙", "similarity": 0.55},
            {"sopId": "2", "item": "잔화 확인 및 철수", "reference": "§9.2 잔화 확인 절차", "similarity": 0.15},
        ]
    )

    state = await agent.run({"report_content": "무전으로 상황을 보고했다"})

    items = state["sop_match_result"]["items"]
    assert items[0] == {"reportRecord": "화재 인지 → 무전 보고", "executed": "일치", "recommendedSop": "§4.2 무전 보고 원칙"}
    assert items[1]["executed"] == "미실행"
    assert state["sop_match_result"]["matchedCount"] == 1
    assert state["sop_match_result"]["totalCount"] == 2


@pytest.mark.asyncio
async def test_backend_호출이_실패하면_키워드_매칭으로_대체된다():
    agent = _agent_with_mocked_backend(search_sop_side_effect=BackendClientError("connection refused"))

    state = await agent.run({"report_content": "무전으로 상황을 보고했고 초기 진압을 위해 방수했다"})

    items = state["sop_match_result"]["items"]
    matched = {i["reportRecord"] for i in items if i["executed"] == "일치"}
    assert matched == {"화재 인지 → 무전 보고", "초기 진압 절차"}
    assert state["sop_match_result"]["totalCount"] == 5


@pytest.mark.asyncio
async def test_놓친_항목이_있으면_휴리스틱_요약을_생성한다():
    agent = _agent_with_mocked_backend(
        search_sop_result=[{"sopId": "1", "item": "잔화 확인 및 철수", "reference": "§9.2 잔화 확인 절차", "similarity": 0.1}]
    )

    state = await agent.run({"report_content": "아무 내용도 없음"})

    assert "잔화 확인 및 철수" in state["risk_pattern"]
    assert state["recommendation"]
