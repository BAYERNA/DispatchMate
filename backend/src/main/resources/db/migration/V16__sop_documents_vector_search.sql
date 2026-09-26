-- FR-08 SOP 대조를 키워드 substring 매칭에서 벡터 유사도 검색(RAG)으로 교체한다.
-- 이미지가 postgres:16-alpine에서 pgvector/pgvector:pg16으로 바뀌어야 이 확장이 존재한다
-- (docker-compose.yml, .github/workflows/ci.yml, IncidentRepositoryContainerTest 동일하게 변경).
CREATE EXTENSION IF NOT EXISTS vector;

-- embedding은 애플리케이션(SopEmbeddingService)이 기동 후 채운다 — Flyway SQL 마이그레이션에서는
-- Java 임베딩 로직을 호출할 수 없다. 표본이 5건뿐이라 ivfflat 인덱스는 만들지 않는다(pgvector
-- 문서상 lists 파라미터에 맞는 최소 표본 수가 필요해 이 규모에서는 무의미 — SOP 문서가 실제로
-- 늘어나면 그때 추가). 5~20건 규모에서는 인덱스 없는 완전탐색(<=> 연산자)도 충분히 빠르다.
CREATE TABLE sop_documents (
    sop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item VARCHAR(120) NOT NULL,
    reference VARCHAR(120) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(128),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO sop_documents(item, reference, content) VALUES
    ('화재 인지 → 무전 보고', '§4.2 무전 보고 원칙',
     '화재를 인지한 즉시 무전으로 상황을 보고한다. 위치, 상황, 필요 지원을 명확히 전달한다.'),
    ('구역별 인명 검색', '§8.7 구역별 인명 검색 절차',
     '건물을 구역별로 나누어 체계적으로 인명을 검색하고 구조한다.'),
    ('초기 진압 절차', '§3.1 초기 진압 절차',
     '초기 화재는 신속한 방수와 소화기를 이용해 진압을 시도한다.'),
    ('대피 유도 절차', '§5.4 대피 유도 절차',
     '거주자를 안전한 대피 경로로 유도하고 대피 상황을 확인한다.'),
    ('잔화 확인 및 철수', '§9.2 잔화 확인 절차',
     '진화 후 잔화 여부를 재확인하고 안전하게 철수한다.');
