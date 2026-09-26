# DispatchMate analytics

운영 PostgreSQL을 읽어 출동 운영 KPI를 만드는 dbt 프로젝트다. 모델은 `analytics_staging`,
`analytics_intermediate`, `analytics_marts` 스키마에 생성되며 `public` 운영 테이블을 수정하지 않는다.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r analytics/requirements.txt
cp analytics/profiles.example.yml analytics/profiles.yml
export DB_PASSWORD='local-password'
dbt build --project-dir analytics --profiles-dir analytics
```

`dbt build`는 모델 생성과 함께 PK 유일성, FK 고아 레코드, 허용 상태값, 좌표 범위,
시간 순서 및 집계 키 중복을 검사한다. 실패하면 S3 내보내기를 실행하지 않는다.
`profiles.yml`, `target/`, `logs/`에는 접속 정보나 실행 메타데이터가 들어갈 수 있어 Git에서 제외한다.
