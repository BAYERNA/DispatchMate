"""FR-08: 제출된 사후보고서를 SOP 체크리스트와 대조하는 에이전트.

그래프: match_against_checklist → generate_summary
USR-003 "내 보고서 기록 / 실행 여부 / 추천 SOP 근거" 3열 표(NFR-07 "AI 제안 vs 실제 행동 대조")를
그대로 채울 수 있도록 sop_match_result를 리스트[dict] 구조로 만든다.

backend(/api/v1/sop/search)가 pgvector로 SOP 문서 전체를 유사도 순으로 반환하면, 그중 임계값
이상인 항목만 "일치"로 표시한다(RAG). backend 호출이 실패하면(네트워크 오류, 벡터 미설정 등)
예전의 키워드 substring 매칭(SOP_CHECKLIST)으로 조용히 대체한다 — NFR-07 "AI 보조는 없어도
핵심 계약(입력→응답)은 항상 지켜야 한다" 원칙을 그대로 따른다. build_graph()/run() 계약은
이 교체 전후로 동일하다.
"""

import logging
from typing import Any, Optional

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph

from app.agents.base_agent import BaseAgent
from app.core.backend_client import BackendClientError, FaindBackendClient

logger = logging.getLogger(__name__)

# 벡터 검색 실패 시에만 쓰는 폴백. SopEmbeddingService가 계산하는 벡터와 동일한 5개 항목이다.
SOP_CHECKLIST = [
    {"item": "화재 인지 → 무전 보고", "reference": "§4.2 무전 보고 원칙", "keywords": ["무전", "보고"]},
    {"item": "구역별 인명 검색", "reference": "§8.7 구역별 인명 검색 절차", "keywords": ["인명", "검색", "구조"]},
    {"item": "초기 진압 절차", "reference": "§3.1 초기 진압 절차", "keywords": ["진압", "방수", "소화"]},
    {"item": "대피 유도 절차", "reference": "§5.4 대피 유도 절차", "keywords": ["대피", "유도"]},
    {"item": "잔화 확인 및 철수", "reference": "§9.2 잔화 확인 절차", "keywords": ["잔화", "진화", "철수"]},
]

# backend의 SopEmbeddingService(문자 2-gram 해싱)로 실측한 값 — 실제로 관련 있는 문장은
# 0.53~0.56, 무관한 문장은 0.15~0.20의 코사인 유사도를 보였다. 그 사이인 0.30을 경계로 쓴다.
SIMILARITY_MATCH_THRESHOLD = 0.30


class SopMatchAgent(BaseAgent):
    def __init__(self, llm: Optional[BaseChatModel] = None, backend_client: Optional[FaindBackendClient] = None):
        self.llm = llm
        self.backend_client = backend_client or FaindBackendClient()
        self.graph = self.build_graph()

    def build_graph(self):
        graph = StateGraph(dict)
        graph.add_node("match_against_checklist", self._match_against_checklist)
        graph.add_node("generate_summary", self._generate_summary)
        graph.set_entry_point("match_against_checklist")
        graph.add_edge("match_against_checklist", "generate_summary")
        graph.add_edge("generate_summary", END)
        return graph.compile()

    async def run(self, state: dict) -> dict:
        return await self.graph.ainvoke(state)

    async def _match_against_checklist(self, state: dict) -> dict:
        content = state.get("report_content") or ""
        try:
            results = await self.backend_client.search_sop(content)
            items = [
                {
                    "reportRecord": result["item"],
                    "executed": "일치" if result["similarity"] >= SIMILARITY_MATCH_THRESHOLD else "미실행",
                    "recommendedSop": result["reference"],
                }
                for result in results
            ]
        except BackendClientError:
            items = self._match_against_checklist_heuristic(content)
        state["sop_match_items"] = items
        return state

    def _match_against_checklist_heuristic(self, content: str) -> list[dict]:
        content_lower = content.lower()
        return [
            {
                "reportRecord": sop["item"],
                "executed": "일치" if any(keyword.lower() in content_lower for keyword in sop["keywords"]) else "미실행",
                "recommendedSop": sop["reference"],
            }
            for sop in SOP_CHECKLIST
        ]

    async def _generate_summary(self, state: dict) -> dict:
        items = state["sop_match_items"]
        missed = [i["reportRecord"] for i in items if i["executed"] == "미실행"]

        if self.llm and state.get("report_content"):
            risk_pattern, recommendation = await self._summarize_with_llm(state["report_content"], missed)
        else:
            risk_pattern, recommendation = self._summarize_heuristic(items, missed)

        state["sop_match_result"] = {"items": items, "matchedCount": len(items) - len(missed), "totalCount": len(items)}
        state["risk_pattern"] = risk_pattern
        state["recommendation"] = recommendation
        return state

    async def _summarize_with_llm(self, report_content: str, missed: list[str]) -> tuple[str, str]:
        prompt = (
            "다음은 화재 대응 사후보고서다. 놓친 SOP 항목을 참고해 위험 패턴 한 문장과 "
            f"개선 권고 한 문장을 각각 작성하라(줄바꿈으로 구분).\n보고서: {report_content}\n"
            f"놓친 항목: {', '.join(missed) if missed else '없음'}"
        )
        try:
            response = await self.llm.ainvoke([HumanMessage(content=prompt)])
            lines = [line.strip() for line in response.content.strip().splitlines() if line.strip()]
            risk_pattern = lines[0] if lines else None
            recommendation = lines[1] if len(lines) > 1 else None
            return risk_pattern, recommendation
        except Exception as e:
            logger.warning("LLM SOP 요약 실패, 휴리스틱으로 대체: %s", e)
            return self._summarize_heuristic_from_missed(missed)

    def _summarize_heuristic(self, items: list[dict[str, Any]], missed: list[str]) -> tuple[str, str]:
        return self._summarize_heuristic_from_missed(missed)

    def _summarize_heuristic_from_missed(self, missed: list[str]) -> tuple[str, str]:
        if not missed:
            return "SOP 체크리스트 전 항목을 준수했습니다.", "현재 대응 절차를 유지하십시오."
        risk_pattern = f"다음 절차가 기록에서 확인되지 않았습니다: {', '.join(missed)}."
        recommendation = f"'{missed[0]}' 절차를 포함해 대응 순서를 재정비하는 것을 권장합니다."
        return risk_pattern, recommendation
