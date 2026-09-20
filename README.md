# 출동메이트

AI가 화재를 감지하고 골든타임을 사수하는 지능형 소방 대응 시스템.

이 저장소는 로컬 개발·데모용입니다. 기능 구현과 운영 준비 완료는 다릅니다.
기본 JWT·DB 키는 개발용이고 실제 장비·운영 환경 검증은 별도로 필요하므로
그대로 외부에 공개하거나 실제 출동 판단에 사용하지 마세요. AI 결과는 사람의 판단을 보조합니다.

## 문서

- 요구사항정의서 v2.2 (FR-01~FR-27, NFR-01~NFR-08)
- MSA 아키텍처설계서 v8 (§6 모듈러 모놀리식 원칙)
- 코드구조설계서 v1.0
- DB설계서 v2.2 (12개 테이블)
- 기술스택 문서 v1.0
- 와이어프레임 (15 SCREENS)

## 구성

Java backend는 `auth`, `incident`, `device`, `report`, `statistics`의 5개 핵심 도메인을
가진 모듈러 모놀리식이며, `integration`과 `listener`는 연동·이벤트 처리 계층입니다.
AI·알림 서버와 세 프론트엔드는 별도 런타임입니다. 아래 상태는 구현 범위를 나타내며,
모든 기능의 통합 검증이나 운영 안전성을 보증하지 않습니다.

| 디렉토리 | 런타임 | 상태 |
|---|---|---|
| `backend/` | Java 21 + Spring Boot 3.5 | 인증·출동·장비·보고서·통계 및 외부 연동 구현 |
| `ai-server/` | Python 3.11 + FastAPI + LangGraph | 구현 완료 (FR-02 사전분석, FR-08 SOP대조, FR-24/26 화재감지) |
| `notification-server/` | Node.js + NestJS | 구현 완료 (FR-06, FR-18, FR-22, FR-23) |
| `admin-web/` | React 19 + TypeScript + Vite | 구현 완료 (CMN-001/002, ADM-001/002/003/006/009) |
| `commander-tablet/` | React 19 + TypeScript + Vite | 구현 완료 (CMN-001/002, CMD-001/002/003/006) |
| `responder-app/` | React 19 + TypeScript + Vite | 구현 완료 (CMN-001/002, USR-001/002/003) |

## 실행 전 준비

- 전체 컨테이너 실행: Docker Engine 또는 Docker Desktop + Docker Compose v2.
- 개별 실행: JDK 21, Python 3.11, 프론트엔드 Node.js 22.22 이상(22.x 권장).
  notification-server CI는 Node.js 20을 사용합니다.
- DB는 PostgreSQL 16, Redis는 7을 기준으로 합니다.
- 프론트엔드는 npm workspace 구조이므로 저장소 루트에서 `npm ci`를 한 번 실행합니다.
  notification-server는 별도 패키지이므로 해당 디렉터리에서 따로 `npm ci`를 실행합니다.
- Windows에서는 backend 실행 시 `gradlew.bat bootRun`을 사용할 수 있습니다.
  아래의 `source`, 입력 리다이렉션 명령 예시는 Bash/WSL 기준입니다.

## 빠른 시작: 로컬 데모 전용

```bash
git clone https://github.com/BAYERNA/DispatchMate.git
cd DispatchMate
cp .env.example .env
# .env의 DB 비밀번호, JWT 키, 두 내부 토큰을 서로 다른 충분히 긴 무작위 값으로 채운 뒤 실행
docker compose up -d --build
docker compose ps
curl -f http://localhost:8080/actuator/health
```

`JWT_SECRET`은 backend·알림 서버가, `INTERNAL_WEBHOOK_TOKEN`은 backend·알림 서버가,
`INTERNAL_SERVICE_TOKEN`은 backend·AI 서버가 공유합니다. Compose는 필수 비밀값의 누락을 거부합니다. `.env`는 Git에 올리지 마세요.
카메라를 사용할 때는 `FAIND_CAMERA_ALLOWED_HOSTS`에 허용할 숫자 IP를 쉼표로 구분해 지정합니다.
예: `192.168.1.10,192.168.1.11`. 빈 목록은 카메라 연결을 모두 거부합니다.

backend가 healthy가 되어 Flyway 마이그레이션을 마친 다음, **폐기 가능한 로컬 데모 DB에만**
기존 테스트 계정을 넣을 수 있습니다. 이 스크립트는 동일 사번 계정의 비밀번호·상태를
덮어쓰므로 실제 사용자 DB에는 실행하지 마세요.

```bash
docker compose exec -T postgres psql -U faind -d faind < scripts/seed-e2e-accounts.sql
```

| 화면 | 주소 | 테스트 사번 |
|---|---|---|
| 관리자 | http://localhost:8081 | `E2E-ADMIN` |
| 지휘관 | http://localhost:8082 | `E2E-COMMANDER` |
| 대원 | http://localhost:8083 | `E2E-RESPONDER` |

테스트 비밀번호는 시드 스크립트에 정의된 데모 전용 값입니다. 실행 전 로컬 정책에 맞게 바꾸고, 외부 공개 환경에서
사용하면 안 됩니다. 신규 DB에서는 계정만 생성되므로 출동·장비 목록이 비어 있을 수 있습니다.
중지할 때는 `docker compose down`을 사용하면 DB 볼륨은 보존됩니다.
`docker compose down -v`는 DB 데이터를 삭제하므로 주의하세요.

## ai-server 로컬 실행

```bash
cd ai-server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.lock.txt
# 설정 변경이 필요한 경우에만 .env.example을 .env로 복사하고 값을 설정
uvicorn app.main:app --reload --port 8001
```

자세한 계약(backend와 주고받는 엔드포인트), LLM/화재감지 모델 미설정 시 동작은 `ai-server/README.md` 참조.

## backend 로컬 실행

```bash
docker compose up -d postgres redis   # 또는 로컬 PostgreSQL 16 + Redis 7
cd backend
./gradlew bootRun
```

기본 접속 정보(로컬 개발용, `application.yml` 참조):

- DB: `jdbc:postgresql://localhost:5432/faind` (사용자와 비밀번호는 로컬 환경변수로 설정)
- Redis: `localhost:6379`
- 서버: `http://localhost:8080` (Swagger UI: `/swagger-ui.html`)

Flyway가 기동 시 `backend/src/main/resources/db/migration`의 스키마를 자동 적용한다.
운영용 최초 관리자 자동 생성 기능은 없다. 로컬 데모에는 위의 테스트 시드를 사용할 수 있다.

`AI_SERVER_BASE_URL`(기본 `http://localhost:8001`), `NOTIFICATION_SERVER_BASE_URL`(기본
`http://localhost:3001`)로 각 서비스 주소를 지정한다. 둘 다 없어도 backend는 정상 동작한다 —
AiAnalysisHttpAdapter/NotificationHttpAdapter가 CircuitBreaker+fallback으로 처리한다.

FR-20(후발대 경로·ETA)은 DB설계서에 소방서·차량 위치 테이블이 없어 `faind.routing.fire-station-*`
(위도/경도/표시명) 고정 좌표를 출발지로 근사한다 — 실제 관할 소방서 좌표로 바꾸려면 이 값만
`application.yml`에서 덮어쓰면 된다.

ai-server가 콜백하는 `/incidents/dispatch/cctv-detections`·`/incidents/drone-dispatches/{id}/recon-result`
(FR-24/FR-26)는 로그인 사용자 JWT 대신 `faind.security.internal-service-token`(env:
`INTERNAL_SERVICE_TOKEN`) 공유 토큰으로 검증한다 — ai-server의 `FAIND_BACKEND_SERVICE_TOKEN`과 같은 값을
넣어야 한다. backend 토큰이 비어 있으면 내부 콜백은 503으로 거부된다.
Compose는 루트 `.env`의 `INTERNAL_SERVICE_TOKEN`을 양쪽 변수로 전달한다.
개별 프로세스로 실행할 때는 각각 환경변수를 설정해야 한다.

보안 점검(Phase 10)에서 `POST /api/v1/auth/login`에 시도 횟수 제한이 전혀 없어 사번을 고정한 채
비밀번호를 무한히 대입할 수 있는 것을 발견해 고쳤다 — Redis에 사번당 실패 횟수를 세어 15분 내
5회 실패하면 비밀번호가 맞아도 429를 반환한다(`AuthService.login`). 성공하면 카운터를 지운다.

## notification-server 로컬 실행

```bash
cd notification-server
npm ci
cp .env.example .env   # JWT_SECRET은 backend와 반드시 동일해야 함
# INTERNAL_WEBHOOK_TOKEN도 backend 프로세스와 같은 값으로 설정
npm run build && npm run start
```

backend를 먼저 기동해 Flyway로 `alerts`/`alert_acknowledgements` 테이블을 만든 뒤 실행할 것 —
이 서비스는 `synchronize: false`로 매핑만 하고 스키마를 직접 만들지 않는다. 자세한 REST/WebSocket
계약은 `notification-server/README.md` 참조.

## admin-web 로컬 실행

```bash
# 저장소 루트에서 실행 (npm ci는 최초 1회 또는 lockfile 변경 시)
npm ci
npm run dev --workspace=admin-web
```

`http://localhost:5173`에서 접속. dev server가 `/api` 요청을 backend(`VITE_BACKEND_URL`, 기본
`http://localhost:8080`)로 프록시하므로 backend를 먼저 기동해야 한다. 화면 구성과 설계 원칙은
`admin-web/README.md` 참조.

## commander-tablet 로컬 실행

```bash
# 저장소 루트에서, npm ci 실행 후
npm run dev --workspace=commander-tablet
```

`http://localhost:5174`에서 접속 (admin-web과 동시에 띄울 수 있도록 포트를 분리했다). dev server가
`/api`는 backend로, `/notify`·`/socket.io`는 notification-server로 프록시하므로 둘 다 먼저 기동해야
한다. 화면 구성과 설계 원칙은 `commander-tablet/README.md` 참조.

## responder-app 로컬 실행

```bash
# 저장소 루트에서, npm ci 실행 후
npm run dev --workspace=responder-app
```

`http://localhost:5175`에서 접속 (admin-web·commander-tablet과 동시에 띄울 수 있도록 포트를
분리했다). commander-tablet과 같은 프록시 구성을 쓴다. 좁은 화면(모바일) 레이아웃이며, 화면 구성과
설계 원칙은 `responder-app/README.md` 참조.

## 전체 스택 실행

```bash
docker compose up --build
```

PostgreSQL·Redis의 healthy 이후 backend가 시작되고, backend의 healthy 이후 알림 서버가 시작된다.
AI 서버에는 별도의 `depends_on`이 없으며 독립적으로 시작한다. 프론트엔드는 backend를 기다리고,
지휘관·대원 화면은 알림 서버의 시작도 기다린다. 이것이 모든 기능의 준비 완료를 뜻하지는 않는다.
프론트엔드는 각자 nginx로 정적 빌드를 서빙하며, dev
server의 vite proxy와 동일한 규칙(`/api`→backend, `/notify`·`/socket.io`→notification-server,
`/ai-stream`→ai-server)을 nginx.conf로 재현해 브라우저가 CORS 없이 접근한다.

| 서비스 | 접속 주소 |
|---|---|
| admin-web | http://localhost:8081 |
| commander-tablet | http://localhost:8082 |
| responder-app | http://localhost:8083 |
| backend Swagger | http://localhost:8080/swagger-ui.html |

## 테스트와 검증

프론트엔드는 저장소 루트에서 실행합니다. E2E는 별도이며 아래 단위 테스트에 포함되지 않습니다.

```bash
npm ci
npm run test --workspaces --if-present
npm run build --workspaces --if-present
npm run lint --workspaces --if-present
```

각 서버는 해당 디렉터리에서 실행합니다.

| 디렉터리 | 명령 |
|---|---|
| `backend` | `./gradlew test compileJava --no-daemon` (JDK 21 필요) |
| `notification-server` | `npm ci && npm run build && npm test -- --runInBand` |
| `ai-server` | 가상환경에서 `pip install -r requirements-dev.txt` 후 `python -m pytest tests/ -v` |

Playwright E2E는 PostgreSQL·Redis·backend·notification-server, `psql`, `redis-cli`, Chromium을
준비한 후 각 프론트엔드에서 `npm run test:e2e`로 실행합니다. 테스트 준비 과정에서
테스트 계정을 다시 시딩하므로 테스트 전용 DB를 사용하세요.
상세 순서와 Docker 로그인 스모크 테스트는 [.github/workflows/ci.yml](.github/workflows/ci.yml)에 있습니다.
CI의 AI 의존성 점검은 정보성이고 npm 점검은 critical 기준이므로, CI 성공만으로 취약점이 없다고 볼 수 없습니다.

## 실행 문제 확인

| 증상 | 우선 확인할 내용 |
|---|---|
| backend 기동 실패 | JDK 21, PostgreSQL·Redis 연결, Flyway 로그. Compose에서는 `docker compose logs backend postgres redis` |
| 신규 설치 후 로그인 실패 | 계정 생성 여부. 로컬 테스트는 위 시드 절차 사용 |
| 로그인 HTTP 429 | 같은 사번으로 15분 내 5회 실패했는지 확인. 잠금 기간에는 올바른 비밀번호도 거부됨 |
| 로그인 HTTP 403 / CORS | 브라우저 주소가 `CORS_ALLOWED_ORIGINS`와 일치하는지 확인. `localhost`와 IP 주소는 서로 다른 오리진 |
| 알림 연결 실패 / JWT 오류 | backend·알림 서버의 `JWT_SECRET` 일치 여부, 알림 서버 3001 포트, `/notify`·`/socket.io` 프록시 |
| 웹훅 인증 오류 | backend·알림 서버의 `INTERNAL_WEBHOOK_TOKEN` 일치 여부 확인. 누락은 503, 잘못된 값은 401로 거부 |
| CCTV 자동 등록이 안 됨 | `FAIND_CCTV_POLLING_ENABLED` 기본값은 false. `FAIND_CCTV_CAMERAS` 및 모델·카메라 접근·backend 콜백 설정 확인 |
| 영상 확인 불가 | ADMIN/COMMANDER 세션, 등록된 CCTV/DRONE ID, 카메라 숫자 IP 허용 목록 확인. 로컬 파일·임의 URL·리다이렉트는 지원하지 않음 |
| 판단 불가 또는 모델 사용 불가 | 모델 로드 로그와 응답 `reason` 확인. 실패는 `UNKNOWN`, 정상 분석의 `SAFE`는 화면에서 ‘미검출’로 표시하며 안전 보증이 아님 |

## 운영 전 필수 보완

- 공개된 개발용 JWT·DB 기본값과 테스트 계정을 사용하지 마세요. 현재 Compose 포트는
  loopback으로 제한되어 있지 않으므로 로컬 방화벽·바인딩도 확인해야 합니다.
- backend 내부 콜백 토큰과 notification 웹훅 토큰은 서로 다른 인증 경로입니다.
  Java 송신부도 Bearer 토큰을 전달하며, 토큰 미설정 시 인증을 생략하지 않습니다.
- 공개 배포 전 TLS, 서비스 간 네트워크 격리, 외부 API 및 의존성 취약점 점검을 별도로 수행하세요.
  `/pre-analysis`, `/sop-match`는 내부 서비스용이며 공개망에 노출하지 마세요.
- 실제 PostgreSQL에서 V7~V14 마이그레이션·계정 무효화·재알림/오프라인 명령 중복 방지 및 실제 카메라·SMS·음성·기관 연동을 검증하세요.

## 이번 변경 및 호환성

- 관리자 홈에서 backend 계정 DB, 알림 서버 DB, AI 모델 상태를 15초마다 확인합니다.
  응답 확인과 실제 알림 수신·화재감지 정확도는 별개입니다.
- 분석 불가·갱신 실패·30초 이상 된 결과는 ‘판단 불가’로 표시합니다.
- 영상은 인증 헤더가 있는 `/ai-stream/frame?device_id=...` 요청으로 약 1초 간격 갱신합니다.
  기존 무인증 MJPEG URL은 제거했습니다. 고프레임률 영상 스트리밍을 대체하는 운영용 전송 방식은 아닙니다.
- 카메라는 등록된 CCTV/DRONE이고 운영자가 허용한 숫자 IP여야 합니다.
  HTTP(S) JPEG/MJPEG의 첫 JPEG 프레임 및 RTSP를 지원합니다. DNS 호스트명, URL 내 자격증명,
  로컬 파일, HTTP 리다이렉트는 거부됩니다. 카메라별 실제 호환성은 별도로 확인하세요.
- 알림 REST는 출동 배정/역할을 확인하고 진입정보 작성은 배정된 통신담당 대원만 허용합니다.
- backend는 계정 상태·역할·tokenVersion을 검증합니다. 알림 서버는 REST·WebSocket join 및
  매 알림 전달 시 backend `/api/v1/auth/session`에서 현재 세션을 확인하며 장애 시 접근을 거부합니다.
- V7은 `users.token_version`, `alerts.escalation_of`와 원본별 재알림 유일 인덱스를 추가합니다.
  backend의 Flyway 적용이 끝난 뒤 새 알림 서버를 실행하세요. 구버전과의 무중단 혼합 배포는 검증하지 않았습니다.

### 알림 전달·수신·확인 추적

- **발송 대상 저장:** V8은 `alert_deliveries`를 추가합니다. 알림 생성과 같은 트랜잭션에서
  당시 배정된 활성 RESPONDER를 저장하며, 개별 발송은 지정 대원만 포함합니다.
  이후 배정 변경으로 기존 대상자 기록을 바꾸지 않습니다. 지휘관의 확인은 대원의 확인을 대신하지 않습니다.
- **앱 수신:** 대원 앱이 알림 목록 응답을 처리한 뒤 본인 수신 기록을 전송합니다.
  WebSocket 송신 성공을 수신으로 간주하지 않으며, 앱 수신은 사람이 읽었다는 의미가 아닙니다.
- **사람 확인:** “확인했어요”의 서버 저장이 완료되어야 확인으로 표시합니다.
  같은 대원의 재요청은 기존 확인을 반환하고 시간을 갱신하지 않습니다. 이전 버전의 재확인 이력은 보존합니다.
  확인 요청 실패는 화면에 표시하며, 연결 복구 후 사용자가 다시 누를 수 있습니다.
- **누락 복구:** 재접속 시 서버 목록을 다시 조회하고, 화면 활성 중에는 10초 간격으로 동기화합니다.
  수신 기록은 최대 200개씩 전송하며 실패 시 재시도합니다. 알림 ID와 `(alert_id, user_id)`로 중복을 방지합니다.
  앱이 닫혔거나 네트워크가 끊긴 동안에는 즉시 전달을 보장하지 않습니다.
- **지휘관 현황:** 알림별 미수신·수신 후 미확인·확인 완료 인원과 대원 명단을 5초 간격으로 갱신합니다.
  조회 실패 시 이전 기록이 최신이 아닐 수 있음을 표시합니다. V8 이전 알림은 대상자·수신 기록을 추정하지 않습니다.
- **권한:** 전달 명단은 ADMIN/COMMANDER만 조회합니다. 개별 알림은 다른 대원의 REST 목록,
  확인 API, WebSocket 이벤트에 노출하지 않습니다. 세션과 현재 출동 배정 검증은 복구 요청에도 적용됩니다.

새 API는 `POST /incidents/:incidentId/alerts/receipts` (`{ "alertIds": ["UUID"] }`)와
`GET /incidents/:incidentId/alerts/delivery-status`입니다. 브라우저에서는 `/notify` 프록시를 사용합니다.
배포 시 **backend Flyway V8~V14를 먼저 적용**한 뒤 알림 서버와 프론트를 갱신하세요.
구버전 알림 서버와의 혼합 운영, 실제 PostgreSQL의 동시 세션 잠금, 전체 서비스 E2E는 별도 검증이 필요합니다.
기존 10분 미확인 위험경고의 1회 재알림 정책은 유지합니다. 대상자 중 일부만 확인한 경우의 추가 재알림 정책은 포함하지 않습니다.

### 운영 기능

- **타임라인·감사 이력:** V9의 `incident_events`에 출동 생성, 대원 배정·역할 변경, 상태 보고,
  알림 생성·확인, AI 판단, 출동 상태 변경을 시간순으로 기록합니다. 기존 데이터도 마이그레이션 시 이력으로 옮깁니다.
  지휘관·관리자만 조회할 수 있으며 최근 500건을 10초마다 갱신합니다.
- **오프라인 복구:** 대원 앱은 상태 보고, 알림 생성, 알림 확인을 사용자별 브라우저 outbox에 보관하고
  온라인 복귀 또는 15초 주기로 FIFO 재전송합니다. 알림 생성은 `clientRequestId`로 중복 발송을 막고,
  확인은 기존 서버 멱등 처리를 사용합니다. 상태 보고는 적어도 한 번 전송이므로 응답 직후 앱이 종료되면 같은 값이 중복 기록될 수 있습니다.
  인증·권한 오류 항목은 자동 삭제하지 않으며 화면에 대기 건수로 남습니다. 브라우저 저장소 삭제 시 대기 항목도 사라집니다.
- **작전 위치:** 지휘관 화면은 현장, 배정 대원의 매핑 기기, 좌표가 등록된 CCTV·드론을 표시합니다.
  외부 지도 타일에 의존하지 않는 상대 위치도이므로 도로 경로·실내 층·실시간 GPS를 뜻하지 않습니다.
- **훈련 모드:** 지휘관의 훈련 생성, 시작, 상황 주입, 종료·취소와 시간 기록을 별도 테이블에 저장합니다.
  실제 출동, 알림, 전달 현황, 기관 통계에는 섞이지 않습니다.
- **AI 피드백:** 지휘관이 AI 판단을 정확·오탐·미탐·판단보류로 평가할 수 있습니다.
  판단당 최신 평가 한 건을 유지하며 관리자 통계 화면에서 검토 수, 정확 판정 비율, 오탐·미탐을 봅니다.
  이는 검토된 표본의 운영 지표이며 모델 전체 정확도나 재학습 완료를 의미하지 않습니다.

V9은 위 기능의 `incident_events`, `training_sessions`, `training_events`, `ai_judgment_feedback`와
오프라인 알림 명령 키를 추가합니다. V9 적용 전 알림 서버 새 버전을 실행하면 관련 API가 실패합니다.

### V10 통합 현장 지휘와 운영 준비

- **다중 채널 경보:** 앱 미수신 30초 후 SMS, 90초 후 음성 채널을 시도하며 결과와 재시도 시각을 저장합니다.
  `SMS_GATEWAY_URL`, `VOICE_GATEWAY_URL`, `MULTICHANNEL_TOKEN`을 설정합니다. 게이트웨이 또는 대원 전화번호가
  없으면 성공으로 처리하지 않고 `UNAVAILABLE`로 기록합니다.
- **자동 대원 안전 경보:** 최신 상태의 위험 단계, 통신 두절, 심박수 180 초과, 주변 온도 80℃ 초과를 감지해
  해당 대원에게 중복 방지 키가 있는 센서 경보를 만듭니다. 임계값은 현재 코드 정책이며 의료 진단 기준이 아닙니다.
- **현장 지휘:** 지휘관은 개인·전체 명령, 인원 점검, 철수와 지휘권 인계를 발령하고 상태를 추적합니다.
  출동 유형별 SOP는 출동 시점의 체크리스트로 복사되어 이후 템플릿 변경과 분리됩니다.
- **자원·실내 작전도:** 장비 재고와 출동별 요청·승인을 연결하고, 층과 위험·진입·대피·구조대상 표식을 공유합니다.
  재고 연결 요청은 승인 시 트랜잭션 안에서 가용 수량을 차감합니다.
- **재생·감사:** 지휘 화면의 사건 타임라인을 순서대로 재생하고 JSON 감사 파일로 내보낼 수 있습니다.
  명령, SOP, 자원, 작전 표식, 기관 공유 상태 변경도 `incident_events`에 남습니다.
- **AI 운영:** 관리자는 모델 버전 활성화와 임계값 변경 사유를 기록합니다. 모델별 활성 버전은 하나만 허용됩니다.
- **기관 협업:** 분류 등급이 있는 공유 초안을 운영자가 승인한 뒤 고정된 `INTERAGENCY_WEBHOOK_URL`로 전송합니다.
  URL 미설정이나 전송 실패는 `FAILED`로 남습니다.
- **운영 준비:** 관리자 화면은 미수신·미확인 알림, 대체 채널 실패, 미완료 명령, 필수 SOP와 최근 복구 검증을 표시합니다.

V10은 위 기능에 필요한 운영 테이블과 감사 트리거를 추가합니다. 알림 서버는 30초 주기의 단일 프로세스 타이머를
사용하므로 여러 인스턴스를 운영할 때에도 DB 유일 키로 알림 중복은 막지만 외부 채널 작업 큐를 대신하지는 않습니다.
실제 SMS·음성 공급자 형식, 기관 연동 계약, 실내 도면 좌표 및 센서 임계값은 현장 환경에 맞게 검증해야 합니다.

백업과 복구 시험은 다음처럼 실행합니다. 복구 명령은 지정한 DB를 정리하므로 반드시 폐기 가능한 검증 DB만 사용합니다.

```bash
DATABASE_URL='postgresql://...' BACKUP_OUTPUT_DIR=./backups ./scripts/backup-postgres.sh
BACKUP_ARCHIVE=./backups/<file>.dump RESTORE_DATABASE_URL='postgresql://.../disposable' \
  ALLOW_RESTORE_TEST=YES ./scripts/verify-postgres-restore.sh
```

복구 시험 후 관리자 화면에 백업 참조와 SHA-256을 등록하고, 실제 복구 결과를 확인한 운영자만 검증 완료로 표시합니다.

DB 트리거·수신 재시도·확인 중복 방지·훈련 상태 전이·AI 피드백 검증은 임시 PGlite 설치로 재현할 수 있습니다.
이 검증은 PostgreSQL WASM 엔진과 저장소 어댑터를 사용하며 실제 PostgreSQL/Flyway 실행을 대체하지 않습니다.

```bash
npm install --prefix /tmp/dispatchmate-db-check @electric-sql/pglite --no-audit --no-fund
cd notification-server
npm run build
PGLITE_ROOT=/tmp/dispatchmate-db-check/node_modules/@electric-sql/pglite node test/delivery-database.mjs
```

### V11 현장 안전·운영 인텔리전스

- **MAYDAY·PAR:** 대원 원터치 긴급신호, 지휘 확인 전 반복 경보, 30~1800초 인원점검과 미응답 자동 위험신호를 제공합니다.
- **영속 작업 큐·푸시:** PUSH/SMS/VOICE/기관 전송은 `durable_jobs`에서 멱등 키, 지수 백오프, 최대 재시도와 DEAD 상태를 관리합니다. `PUSH_GATEWAY_URL`은 FCM/APNs/Web Push 중계 어댑터 주소입니다.
- **경로·실내 위치:** GPS 경로·ETA와 위험요소, BLE/UWB/GPS/수동 위치를 저장합니다. 내장 ETA는 직선거리 기반 참고값이며 실제 도로 통제 경로는 외부 라우팅 연동이 필요합니다.
- **장비·의료:** QR/RFID 장비 생명주기와 반출 스캔, 병원 수용상태와 환자 인계 데이터를 연결합니다.
- **권한·전술 보드:** 현장 역할별 권한 표, HOT/WARM/COLD/STAGING/TRIAGE 구역과 우선순위 목표를 제공합니다.
- **사후분석·훈련:** 사건 이벤트, 알림 지연, SOP 누락, MAYDAY를 요약하고 실제 사건을 분리된 훈련 세션으로 복제합니다.
- **AI 드리프트·디지털 트윈:** 7일 현장 피드백의 오탐·미탐 비율을 스냅샷으로 남기고, 연기·열·대피 훈련용 단순 모의를 저장합니다. 모의값은 실제 안전 판단에 사용할 수 없습니다.
- **관측성·복구:** 작업 큐, MAYDAY, PAR, 앱 수신 지연, AI 드리프트, 복구검증 상태를 관리자 화면에서 확인합니다. `scripts/run-recovery-cycle.sh`는 백업·선택적 격리 DB 복구시험·보존대상 출력을 수행합니다.

Web Push는 대원 화면의 “종료 상태 푸시 활성화”에서 서비스 워커를 등록합니다. 빌드 시 `VITE_WEB_PUSH_PUBLIC_KEY`가 필요합니다. Prometheus 스크레이퍼는 인증 토큰과 함께 `GET /operations/metrics/prometheus`를 호출할 수 있습니다. 외부 계약 전에는 `node scripts/mock-operations-gateway.mjs` 또는 `scripts/test-mock-gateway.sh`로 PUSH/SMS/음성/기관/경로 어댑터 형식을 점검합니다.

외부 푸시, 도로 라우팅, BLE/UWB, RFID 리더, 병원 시스템은 공급자별 계약이 없으므로 고정 설정 어댑터와 실패 상태까지만 제공합니다. URL·토큰·장비가 없으면 성공으로 처리하지 않습니다. V14 적용 후 새 알림 서버와 세 프론트엔드를 함께 배포하세요.

### V12 복원력·거버넌스·연합 운영

- **다중 인스턴스 안전성:** 자동화 주기는 DB lease와 fencing token으로 한 인스턴스만 실행합니다. 작업 전달은 기존 `FOR UPDATE SKIP LOCKED` 큐와 멱등 키를 유지합니다.
- **불변 감사:** 중요 작업을 SHA-256 hash chain으로 연결하고 관리자 화면/API에서 전체 체인을 검증합니다. DB 관리자에 의한 원본 삭제까지 막는 WORM 저장소는 별도 운영 인프라가 필요합니다.
- **비밀·Zero Trust 준비:** Vault/KMS 계열 공급자와 mTLS 인증서 경로의 설정 여부를 값 노출 없이 진단하며 fail-closed 상태를 표시합니다. 인증서 발급·회전과 실제 비밀 주입은 플랫폼에서 구성해야 합니다.
- **재해복구·Chaos:** 복구/장애훈련 실행 이력과 증거를 저장합니다. `scripts/check-security-readiness.sh`와 `scripts/run-chaos-drill.sh`는 운영 오실행을 막는 가드를 제공하며 Chaos는 staging/sandbox와 명시적 승인에서만 허용합니다.
- **오프라인 충돌 해소:** mutation UUID, base/server version, 충돌 필드와 서버 해석값을 저장합니다. 같은 mutation 재전송은 동일 결과를 반환합니다.
- **공간·BIM·무전:** IFC/glTF/GeoJSON/SVG 모델 메타데이터와 해시, 무전 전사·검토 상태를 저장합니다. 기본 V12는 GeoJSON 좌표를 사용하며 `scripts/enable-postgis.sql`을 별도로 적용하면 공간 인덱스를 활성화합니다.
- **서명·증거·개인정보:** 환자 인계 등 문서의 서명 메타데이터, 증거 chain-of-custody, 법적 보존, 삭제·익명화·보관 정책을 관리합니다. 외부 서명 인증기관과 보관 워커 연결 전에는 서명을 `PENDING`으로 둡니다.
- **AI 사람 승인:** 모델 후보는 설명과 artifact hash를 보관하고 승인 후에만 활성화합니다. 기존 활성 버전은 rollback 상태로 전환되며 운영 배포기는 이 상태를 기준으로 artifact를 교체해야 합니다.
- **기관 연합·수요 예측·공개 상태:** 신뢰 승인 기관만 제한 범위와 만료시간으로 사건을 공유합니다. 자원 수요는 근거·신뢰도·면책문구를 함께 저장하고 자동 배치하지 않습니다. 공개 포털 토큰은 허용 필드만 반환하며 원본 위치·환자·대원 정보는 노출하지 않습니다.
- **역할·접근성:** 사용자별 언어, 고대비, 모션 축소, 글자 배율과 역할 레이아웃 선호를 저장할 수 있습니다. 네이티브 앱/웨어러블·백그라운드 위치는 플랫폼 SDK와 기기 MDM 계약이 필요해 이번 저장소에서는 PWA/푸시·API 계약까지만 제공합니다.

관리자 콘솔의 `ADM-GOV 복원력·거버넌스`에서 감사 체인, 리스, 동기화 충돌, 법적 보존 증거, AI 릴리스, 연합 기관과 보안 준비 상태를 확인합니다. 공개 상태 토큰은 발급 응답에 한 번만 평문으로 반환되므로 별도 안전 채널로 전달하고 만료를 짧게 설정하세요.

```bash
# 운영 배포 전 비밀/mTLS 준비 상태 정적 점검
./scripts/check-security-readiness.sh

# 선택 기능: PostGIS가 포함된 PostgreSQL에서만 DB owner가 실행
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/enable-postgis.sql

# 승인된 비운영 환경의 Chaos 실행 가드
CHAOS_TARGET_ENVIRONMENT=staging CHAOS_APPROVED=true \
  CHAOS_SCENARIO=gateway-timeout ./scripts/run-chaos-drill.sh
```

V12의 실제 Vault/KMS 조회, mTLS handshake, BIM 렌더러, 음성 인식 공급자, 전자서명 공개키 검증, 연합기관 인증서 교환, 네이티브 기기 기능은 외부 인프라/계약/키가 있어야 완료됩니다. 설정이 없을 때 연결 성공으로 표시하지 않습니다.

### V13 운영 보증·정책 실행

- **개인정보 보존정책 실행:** 위치 기록 삭제와 무전 전사 익명화는 후보 미리보기, 표본 확인, 작성자와 다른 관리자의 승인 후에만 실행됩니다. 법적 보존 정책은 실행을 거부하며 증거·감사자료의 `ARCHIVE`는 외부 WORM 보관 검증 없이는 완료하지 않습니다.
- **공급자 회로 차단기:** PUSH/SMS/VOICE/기관 연동이 연속 5회 실패하면 2분간 `OPEN`으로 전환하고 호출을 차단합니다. 이후 `HALF_OPEN` 시험 호출이 성공해야 닫히며 관리자는 시험 복구만 요청할 수 있습니다.
- **mTLS·외부 비밀 주입:** `REQUIRE_PROVIDER_MTLS=true`이면 HTTPS와 client certificate/key/CA가 모두 없을 때 공급자 호출을 거부합니다. Vault Agent·KMS sidecar는 `MULTICHANNEL_TOKEN_FILE`, `INTERAGENCY_TOKEN_FILE` 경로로 회전된 비밀을 주입할 수 있고 외부 공급자 모드에서 파일이 없으면 fail-closed 처리합니다.
- **SLO와 오류 예산 입력:** 30초 내 알림 전달, 60초 내 MAYDAY 확인, 핵심 API 가용성의 목표와 측정치를 저장합니다. 자동화 워커가 5분 단위 측정치를 추가하고 관리 화면은 목표 대비 실제 비율을 표시합니다.
- **AI 자동 보호:** 모델별 최소 표본, 오탐·미탐 한계와 자동 롤백 여부를 저장합니다. 정책이 활성화되고 실제 드리프트가 한계를 넘을 때만 이전 릴리스를 다시 활성화하며, 대체 릴리스가 없으면 현재 모델을 임의로 제거하지 않습니다.
- **2인 승인·임시 권한:** failover 같은 특권 작업은 요청자와 다른 관리자가 30분 안에 승인해야 합니다. 사건별 임시 권한은 목적과 만료시간을 필수로 기록하고 즉시 철회할 수 있습니다.
- **관리형 현장 기기:** 대원 앱은 기기 지문과 WebCrypto 기능을 등록합니다. 관리자는 attestation 검증·폐기와 원격 폐기 요청을 기록합니다. 웹 구현은 MDM/OS 원격 삭제를 직접 수행하지 않으므로 네이티브 플랫폼 연결 전에는 요청 상태만 신뢰해야 합니다.
- **오프라인 첨부 계약:** 암호화 방식, 해시, 크기, 우선순위를 가진 첨부 manifest를 멱등 등록합니다. MAYDAY 관련 첨부는 우선순위 1로 전송하도록 네이티브 업로더가 이 계약을 사용합니다.
- **감사 WORM manifest:** hash-chain 범위, head hash, 외부 artifact URI와 SHA-256을 기록해 외부 WORM 복제를 검증할 수 있습니다. 저장소 자체가 WORM 스토리지를 대신하지 않습니다.
- **인증서 인벤토리:** 서비스별 인증서 fingerprint, 발급자와 만료일을 기록합니다. `scripts/check-certificate-expiry.sh`로 배포 인증서가 지정 기간 안에 만료되는지 차단할 수 있습니다.

CI는 V1~V14 마이그레이션과 58개 DB·현장 통합 시나리오, Compose 설정, 셸 문법 및 운영 환경 Chaos 차단을 검증합니다.

```bash
# 로컬 운영 보증 검사
PGLITE_ROOT=/tmp/dispatchmate-db-check/node_modules/@electric-sql/pglite \
  ./scripts/verify-production-assurance.sh

# 인증서 30일 만료 경고
CERTIFICATE_WARNING_DAYS=30 ./scripts/check-certificate-expiry.sh certs/service.pem
```

실제 네이티브 백그라운드 위치·Secure Enclave/Android Keystore, MDM 원격 삭제, WORM 업로드, Vault/KMS의 플랫폼별 인증·비밀 생성, 인증서 자동 발급·회전, 음성 인식, BIM 렌더링은 플랫폼별 공급자가 필요합니다. V13은 sidecar/file 주입과 실제 mTLS 전송 경로를 제공하지만, 외부 플랫폼이 연결되기 전 성공 상태를 만들지 않고 `PENDING`, `미설정` 또는 명시적 실패로 유지합니다.

### V14 현장 통합·의사결정 지원

- **공급자 webhook 검증:** `/provider-webhooks/:provider`는 raw request body의 HMAC-SHA256 서명을 검증하고 외부 event ID로 재전송을 멱등 처리합니다. 공급자별 `PROVIDER_<KEY>_WEBHOOK_SECRET` 또는 `_FILE`이 없으면 접근을 거부합니다.
- **암호화 오프라인 증거:** 대원 앱은 사진·영상·음성을 비추출 AES-GCM 키로 IndexedDB에 암호화하고 SHA-256 manifest를 등록합니다. 서버 등록 실패 시 암호화 원본을 삭제하지 않습니다. 실제 분할 업로더는 chunk hash와 우선순위 계약을 사용합니다.
- **네이티브 브리지 계약:** Android/iOS 앱이 기기 attestation, 백그라운드 위치, 원격 폐기를 구현할 수 있는 `NativeFieldBridge` 계약을 추가했습니다. 브라우저에서는 해당 기능을 지원한다고 가장하지 않습니다.
- **BIM 요소:** IFC 변환기가 방·계단·출구·방화문·소화전·위험구역·집결지를 최대 500개 단위로 멱등 반영할 수 있습니다. GeoJSON 좌표와 통행 가능 여부를 함께 저장합니다.
- **무전 위험어 감지:** 저장된 전사에서 MAYDAY·철수·통신두절·부상 키워드를 감지하고 CRITICAL 항목은 멱등 안전경보로 연결합니다. 현재 구현은 규칙 기반 보조 기능이며 원본 무전 확인을 대체하지 않습니다.
- **전자서명 실검증:** 신뢰 공개키의 유효기간과 상태를 확인하고 RSA/ECDSA SHA-256 서명을 실제 검증한 후에만 환자 인계의 송신자·수신자 서명으로 연결합니다. 두 서명이 모두 검증되어야 인계를 `VERIFIED`로 표시합니다.
- **공공데이터·드론:** 기상·도로통제·대피소·소방용수·위험물·병원 관측값에 출처, 관측시각, 만료와 신뢰도를 기록합니다. 드론 임무는 경로·귀환점·고도·최소 배터리를 요구하고 작성자와 다른 지휘관의 승인을 강제합니다.
- **지휘 의사결정 보드:** 활성 MAYDAY, 차단된 목표, 공급자 장애를 근거로 구조·재할당·대체통신 권고를 생성합니다. 권고는 자동 명령이 아니며 지휘관 승인·거절 사유를 반드시 저장합니다.
- **보안·KPI:** 기기 변경·대량 조회·권한 상승·서명 실패 등의 이상징후와 신고 후 첫 상태수신, 알림 전달, MAYDAY 확인, 사건 지속시간 KPI 스냅샷을 저장합니다.

CI는 V1~V14 마이그레이션과 58개 DB·현장 통합 시나리오를 검증합니다. 실시간 음성 인식, 실제 IFC 파서, 객체 스토리지 chunk 업로드, 드론 비행제어와 공공기관 API 호출은 공급자 SDK/계약이 연결되어야 하며, 현재 어댑터는 이를 성공으로 위장하지 않습니다.

2026-09-19 코드 점검의 근거, 재현 결과, 미검증 범위는 [CODE_REVIEW.md](CODE_REVIEW.md)를 참고하세요.
