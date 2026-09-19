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
# .env의 두 내부 토큰을 서로 다른 충분히 긴 무작위 값으로 채운 뒤 실행
docker compose up -d --build
docker compose ps
curl -f http://localhost:8080/actuator/health
```

`INTERNAL_WEBHOOK_TOKEN`은 backend·알림 서버가, `INTERNAL_SERVICE_TOKEN`은 backend·AI 서버가
공유합니다. Compose는 빈 값을 거부합니다. `.env`는 Git에 올리지 마세요.
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

테스트 비밀번호는 세 계정 모두 `Test1234!`입니다. 운영 계정이 아니며 외부 공개 환경에서
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

- DB: `jdbc:postgresql://localhost:5432/faind` (user/password: `faind`/`faind`)
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
- 실제 PostgreSQL에서 V7 마이그레이션·계정 무효화·재알림 중복 방지 및 실제 카메라 연결을 검증하세요.

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

2026-09-19 코드 점검의 근거, 재현 결과, 미검증 범위는 [CODE_REVIEW.md](CODE_REVIEW.md)를 참고하세요.
