# DispatchMate 코드 점검 — 2026-09-19

## 후속 수정 결과

### 4차 현장 안전·운영 인텔리전스 (V11)

MAYDAY, PAR, 영속 외부전송 큐, 푸시 구독, 경로·실내 위치, QR/RFID, 병원 인계, 현장 역할 권한,
전술 구역·목표, 사후분석, 사건 기반 훈련, AI 드리프트, 훈련용 디지털 트윈, 운영 지표와 복구정책을 추가했다.
PGlite V1~V11과 34개 DB 시나리오, 알림 서버 32개 및 세 프론트엔드 69개 단위 테스트를 통과했다.
실제 공급자·장비·PostgreSQL/Flyway·Compose E2E는 운영 환경에서 별도 검증해야 한다.


### 3차 운영 완성도 확장 (V10)

다중 채널 경보, 자동 대원 안전 규칙, 지휘 명령, SOP, 자원 재고·요청, 실내 층별 표식, 사건 재생·내보내기,
AI 버전·임계값 이력, 기관 협업, 운영 준비·복구 체크포인트를 추가했다. 권한 검사는 기존 세션과 출동 배정
검사를 재사용하며, 대원에게는 본인·전체 명령과 현장 정보만 반환하고 기관 공유·채널 전송 이력은 숨긴다.

검증 결과 notification-server 32개, commander-tablet 27개, responder-app 20개, admin-web 22개 테스트와
네 빌드가 통과했다. PGlite에서 V1~V10 마이그레이션과 25개 운영 DB 시나리오가 통과했고 백업 스크립트의
셸 구문을 검사했다. 실제 PostgreSQL/Flyway, 외부 SMS·음성·기관 게이트웨이, Java backend, Compose와
브라우저 E2E는 이 환경에서 실행하지 못했다.

### 2차 기능 확장

우선순위에 따라 알림 대상자·앱 수신·사람 확인 분리, 재연결 복구, 사건 타임라인·감사 이력,
사용자별 오프라인 outbox, 상대 위치 기반 작전도, 실제 출동과 분리된 훈련 모드,
AI 정확·오탐·미탐 피드백과 관리자 집계를 추가했다. V8은 알림 전달 추적을, V9은 사건 이벤트,
훈련, AI 피드백, 오프라인 알림 멱등 키를 추가한다.

검증 결과 notification-server 32개, commander-tablet 27개, responder-app 20개 테스트와 세 빌드가 통과했다.
PostgreSQL WASM 호환 엔진에서 V1~V9 적용 후 알림 전달·확인·롤백·훈련 상태 전이·AI 피드백·권한 등
12개 DB 시나리오를 검증했다. 실제 PostgreSQL/Flyway, Java backend 빌드, 전체 Compose와 브라우저 E2E는
환경 제약으로 실행하지 못했으므로 배포 전 확인이 필요하다.

사용자 승인에 따라 아래 6개 항목의 코드 수정과 분석 불가·서비스 상태 표시 기능을 추가했다.
아래의 **초기 점검 기록**은 수정 전 커밋에 대한 기록으로 보존한다.

| 항목 | 반영 내용 |
|---|---|
| 분석 실패 | UNKNOWN 반환, ‘미검출’과 구분, 오류·30초 초과 캐시 결과도 판단 불가 표시 |
| 알림 REST 권한 | 공통 IncidentAccessService/Guard로 출동 배정·역할·통신담당 검증 |
| 웹훅 인증 | Java Bearer 토큰 전달 및 Compose 양쪽 매핑, 토큰 누락 시 503으로 거부 |
| 영상 접근 | 현재 ADMIN/COMMANDER 세션 확인, 등록 카메라 ID 조회, 숫자 IP 허용 목록, URL/파일/리다이렉트 차단 |
| 재알림 | 원본 ID escalation_of와 유일 인덱스, 파생 재알림 제외 및 중복 요청 처리 |
| 세션 폐기 | 활성 계정·역할·tokenVersion 검사, 알림 REST/소켓 join/매 전달 시 재검증 |
| 상태 표시 | 관리자 홈에서 backend 계정 DB, notification DB, AI 모델 응답을 15초마다 확인 |

### 최종 검증

- 프론트엔드: admin 22 / commander 25 / responder 15, **62개 테스트 통과**, 3개 빌드 통과.
- 알림 서버: **25개 테스트 통과**, 빌드 통과. 실제 로컬 HTTP 서버에서 컨트롤러/가드 연결도 검증했다.
  HTTP 검증의 세션·DB 저장소는 모의 구현이며 실제 PostgreSQL 통합 테스트는 아니다.
- AI 서버: **32개 테스트 통과**, 앱 import/라우터 등록 성공.
  Python 3.12 임시 가상환경에서 수행했고 일부 간접 의존성은 lockfile과 다르다.
  ultralytics/실제 모델 추론은 설치·실행하지 않았으며 모델 불가 경로와 가짜 프레임을 사용했다.
- backend: 토큰 폐기 및 웹훅 헤더 테스트 5개 추가. Temurin JDK 21.0.12.1을
  공식 배포본의 SHA-256과 대조한 뒤 준비했지만, Gradle 8.14.3 배포본 다운로드가
  `java.net.SocketException: Network is unreachable`로 실패했다. 구성된 HTTPS 프록시를
  사용한 재시도도 같은 오류로 실패하여 **backend 컴파일·테스트는 실행하지 못했다.**
- Compose/CI YAML 구문과 내부 토큰 매핑 검사 및 `git diff --check` 통과.
  Docker 부재로 전체 Compose·브라우저 E2E·V7 실제 DB 적용은 검증하지 못했다.
  PostgreSQL 설치도 환경의 setgroups/seteuid 권한 제한으로 실패했다. 해당 권한 제한은 우회하지 않았다.
- 의존성 취약점 스캔은 이번 작업에서 재실행하지 않았다. 기존 lint 경고 6개는 남아 있다.

### 실행·배포 전 확인

1. 루트 `.env.example`을 `.env`로 복사하고 두 내부 토큰을 서로 다른 무작위 값으로 설정한다.
2. 카메라 IP 허용 목록 `FAIND_CAMERA_ALLOWED_HOSTS`를 설정한다. 빈 목록은 연결을 거부한다.
3. backend Flyway V7~V10 적용 후 알림 서버를 실행한다. 네트워크가 허용된 JDK 21 CI 환경에서
   backend 컴파일·테스트와 실제 DB 통합 검증을 먼저 수행한다.
4. 영상은 고프레임률 MJPEG 대신 약 1초 간격 인증 프레임 미리보기다. DNS 이름, 파일 경로,
   URL 자격증명, HTTP 리다이렉트는 허용하지 않는다. 실제 카메라 호환성·성능 확인이 필요하다.
5. 기본 개발용 JWT/DB 키 교체, TLS·서비스 격리 및 실제 장비 시험 없이 운영에 사용하지 않는다.
   내부 분석 API(`/pre-analysis`, `/sop-match`)는 인터넷에 노출하지 않는다.

1·2차 변경은 GitHub `codex/dispatchmate-safety-status`에 반영됐다. V10 변경은 같은 브랜치에 반영하며,
배포는 별도 운영 환경 검증 뒤 진행해야 한다.

---

## 초기 점검 기록 (수정 전)

대상: `BAYERNA/DispatchMate`, `main`, `381c5f14cfd6045c0986f4a2deb1c9834e504002`.

6개 런타임의 구조, 핵심 인증·출동·보고서·알림·영상 분석 흐름, 프론트엔드 API 연결,
Compose 및 CI를 중심으로 한 1차 교차 점검이다. 모든 파일·분기·실제 장비의 동작을 전수 검증한 것은 아니다.
애플리케이션 코드는 수정하지 않았고 README와 이 보고서만 로컬 작업본에 추가·수정했다.
GitHub push, 이슈 생성, PR 생성·병합은 수행하지 않았다.

## 검증 결과

| 대상 | 결과 | 한계 |
|---|---|---|
| admin-web | 단위 테스트 15개, 빌드 통과 | lint 경고 2개 |
| commander-tablet | 단위 테스트 19개, 빌드 통과 | lint 경고 1개 |
| responder-app | 단위 테스트 15개, 빌드 통과 | lint 경고 3개 |
| notification-server | 단위 테스트 8개, 빌드 통과 | 실제 PostgreSQL 연동은 이번 환경에서 미실행 |
| ai-server | app/tests Python 구문 컴파일 통과 | 의존성 미설치로 pytest·실제 모델/영상 추론 미실행 |
| backend | 정적 검토 | 환경에 Java 17만 있어 JDK 21 프로젝트 테스트 미실행 |
| 전체 스택 | 기존 GitHub CI 성공 확인 | Docker 미설치로 이번 환경의 Compose·E2E 재실행 없음 |

Node.js v24.19.0에서 `npm ci --ignore-scripts --no-audit`로 의존성을 설치하고 검증했다.
이는 저장소 CI의 Node.js 20/22 환경과 다르다. 이번에 의존성 취약점 스캔은 재실행하지 않았다.
프론트엔드 lint는 오류 없이 종료했고 경고는 Fast Refresh용 export 분리와 effect 내부 setState 관련이다.

## 우선 수정 사항

### 1. [P1] 영상 획득·모델 준비 실패가 안전으로 표시됨

- 근거: `ai-server/app/agents/fire_detection_agent.py`의 `_run_detection`(73~83행),
  `ai-server/app/services/yolo_service.py`의 `DetectionResult`와 `detect_fire_burst`,
  `commander-tablet/src/dangerDisplay.ts`, `LiveCameraPanel.tsx`, `admin-web/src/pages/CctvMonitorPage.tsx`.
- 프레임이 없으면 `danger_level=SAFE`, `danger_score=0`을 반환한다. 모델 미준비도
  DetectionResult의 SAFE 기본값을 사용한다. 화면은 이 값을 `안전`으로 표시하며 `reason`을 표시하지 않는다.
- 재현: 원본 `_run_detection` 메서드를 AST로 추출하여 빈 frames로 실행했다.
  결과는 `detected=False, danger_level=SAFE, danger_score=0`과 획득 실패 reason이었다.
  전체 FastAPI 서버나 모델을 실행한 결과는 아니며, 원본 메서드의 해당 분기를 직접 실행한 결과다.
- 개선: `UNKNOWN/UNAVAILABLE`을 도입하고 API 타입·화면·테스트를 함께 변경한다.
  획득/모델/추론 실패 및 오래된 분석 결과는 안전 상태로 표시하지 않아야 한다.

### 2. [P1] 알림 REST의 출동 배정·역할 권한 검사 누락

- 근거: `notification-server/src/alerts/alerts.controller.ts`(19~74행), `alerts.service.ts`,
  `acknowledgements/ack.controller.ts`, `ack.service.ts`.
- JWT 인증은 있지만 알림 조회·생성·확인에 출동 배정 검사가 없다. `list`는 사용자 정보를 받지 않고,
  `createAiRiskWarning`도 역할을 확인하지 않는다. 진입정보 통신담당 권한은 클라이언트 UI에만 의존한다.
- 따라서 유효한 JWT와 다른 출동/알림 ID를 가진 대원이 배정되지 않은 알림을 조회하거나
  생성·확인하는 호출을 서버가 막지 못한다. 허위 확인은 미확인 위험경고의 재알림에도 영향을 준다.
- WebSocket join에는 배정 검사가 있으나 REST에는 적용되지 않는다. 정적 호출 경로 검토 결과이며
  실제 타 사용자 데이터나 운영 서버로 접근을 시도하지 않았다.
- 개선: 공통 출동 권한 서비스를 REST·WebSocket에 적용하고, 비배정 대원 403 및 역할별 생성 권한을 테스트한다.

### 3. [P1] 내부 웹훅 인증 활성화 시 Java 알림이 401로 거부됨

- 근거: `backend/src/main/java/com/faind/integration/notification/NotificationHttpAdapter.java`(30~58행),
  `notification-server/src/auth/internal-webhook.guard.ts`(13~26행).
- 알림 서버는 `INTERNAL_WEBHOOK_TOKEN` 설정 시 Authorization Bearer를 요구하지만 Java
  RestClient 설정과 두 POST 호출은 토큰을 읽거나 헤더로 전달하지 않는다.
- 결과: 토큰을 설정하면 보고서 작성·위험 알림 요청이 거부되고 fallback은 로그만 남긴다.
- 재현: 컴파일된 실제 InternalWebhookGuard를 설정된 테스트 토큰과 빈 요청 헤더로 호출하여 401 확인.
  Java에서 실제 HTTP 요청을 보내는 통합 테스트는 미실행이다.
- 개선: 송신 토큰 설정 및 Bearer 헤더 전달, Compose 매핑, 일치·누락·불일치 통합 테스트를 추가한다.
  인증을 끄는 방식은 운영 해결책이 아니다.

### 4. [P1] 스트림 API가 인증 없이 임의 URL·로컬 이미지 경로를 처리함

- 근거: `ai-server/app/api/v1/stream_router.py`의 `/mjpeg`, `/mjpeg-debug`, `/danger`,
  `ai-server/app/main.py`, `ai-server/app/api/v1/main.py`, 각 프론트엔드 `nginx.conf`.
- 라우터·앱에 접근 인증이 없고 입력 stream_url을 cv2.VideoCapture 또는 로컬 cv2.imread에 전달한다.
  nginx의 `/ai-stream/` 프록시에도 별도 인증이 없다. React의 로그인 화면만으로 API 접근을 막을 수 없다.
- 외부에서 이 포트/프록시에 접근 가능하면 서버가 접근할 수 있는 영상 URL 및 로컬 이미지 경로를
  요청할 수 있고, 내부 네트워크 요청 유발 및 자원 소모 위험이 있다. 임의 텍스트 파일 유출까지
  검증했다는 뜻은 아니다. 실제 내부망·파일 접근 시도는 하지 않았다.
- 개선: 인증된 cameraId를 서버에서 등록 URL로 해석하고 배정 권한, 허용 카메라 목록,
  프로토콜·네트워크 목적지 제한, 연결/읽기 타임아웃 및 스트림 수 제한을 적용한다.

### 5. [P2] 한 번만 보내려던 재알림이 새로운 재알림을 계속 생성함

- 근거: `notification-server/src/escalation/escalation.service.ts`(40~72행),
  `alerts/alerts.service.ts`의 `createFromSystem`, `alerts/entities/alert.entity.ts`.
- 기존 알림에는 escalatedAt을 채우지만 새로 만든 RISK_WARNING은 escalatedAt이 비어 있다.
  진행 중인 출동에서 새 알림도 10분 이상 미확인으로 남으면 다음 점검의 후보가 된다.
- 재현: 컴파일된 실제 EscalationService와 AlertsService, DB 기본값을 모사한 메모리 저장소로
  두 차례 점검했다. 두 번째 점검은 시간을 11분 전진시켰고, `[재알림] [재알림] ...`가 생성됐다.
  실제 DB·타이머를 사용한 통합 재현은 아니다. 기존 4개 escalation 테스트는 다음 주기를 검증하지 않는다.
- 개선: 원본 알림 ID/재알림 종류를 명시하고 파생 재알림은 후보에서 제외한다.
  생성과 원본 상태 변경의 원자성, 여러 인스턴스 중복 처리도 함께 설계한다.

### 6. [P1] 계정 비활성화·역할 변경이 기존 JWT에 즉시 반영되지 않음

- 근거: `backend/.../auth/service/AccountService.java`의 deactivate/update/reissueTemporaryPassword,
  `backend/.../global/security/JwtAuthFilter.java`, `notification-server/src/auth/jwt.util.ts`,
  `notification-server/src/alerts/alerts.gateway.ts`, backend `application.yml`.
- backend 필터와 알림 서버는 서명된 JWT의 role/sub를 사용하며 계정 상태·토큰 버전을 조회하지 않는다.
  비활성화는 신규 로그인을 막지만 기존 토큰은 만료까지 REST 접근에 사용될 수 있다(기본 480분).
  WebSocket은 연결 시에만 검증하므로 연결 유지 중 만료·계정 변경도 별도 처리가 필요하다.
- 정적 검토 결과다. 개선: 계정/토큰 버전 검증 또는 폐기 목록과 짧은 수명 토큰,
  활성 소켓 무효화 및 비활성화·권한 변경 회귀 테스트를 도입한다.

## GitHub 상태

- 조회 시 열린 이슈 0개, 열린 PR 0개.
- PR #1~#4 모두 병합. 최근 [PR #4](https://github.com/BAYERNA/DispatchMate/pull/4)는 2026-09-17 병합.
- 대상 커밋의 [CI 실행](https://github.com/BAYERNA/DispatchMate/actions/runs/35229294080)은 success.
- 기존 CI의 성공은 이번에 발견한 분기 및 운영 안전성 검증을 대신하지 않는다.

## README 반영 내용

실행 전 버전/도구, 루트 workspace 설치, 테스트 전용 시드 및 데이터 덮어쓰기 경고,
계정별 접속 화면, 실행 순서 정정, 테스트 명령, 오류 확인표와 운영 전 제한을 반영했다.
원격 저장소에는 아직 반영하지 않았다.

## 기능 추가 후보 — 선택 필요

1. 분석 불가·오래된 결과 표시 및 서비스 상태 대시보드: 감지 실패를 안전으로 오인하지 않게 하는 기능.
2. 알림 전달 이력·재시도/재전송 기능: 웹훅 실패를 로그에만 남기지 않고 추적·복구.
3. 안전한 최초 관리자 초기화 기능: 테스트 계정 없이 초기 운영 계정 생성.

우선순위는 1번을 포함한 위 결함 수정이다. 신규 기능은 사용자 선택과 수용 기준을 확인한 뒤 구현한다.
이번 점검은 실서비스 사용 적합성 인증이나 화재감지 정확도 검증을 제공하지 않는다.
