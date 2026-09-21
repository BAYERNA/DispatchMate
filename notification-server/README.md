# 출동메이트 Notification Server

Node.js + NestJS. FR-06(위험정보 알림) · FR-18(선발대-후발대 인수인계) · FR-22(확인 흐름) ·
FR-23(장비·인력 지원요청) 담당 (코드구조설계서 §4).

## 로컬 실행

```bash
npm install
cp .env.example .env   # JWT_SECRET은 backend와 반드시 동일해야 함
npm run build && npm run start
# 또는 개발 중: npm run start:dev
```

`alerts`/`alert_acknowledgements` 테이블은 backend(Java)의 Flyway 마이그레이션이 소유·생성한다.
이 서비스는 `synchronize: false`로 매핑만 하며 스키마를 바꾸지 않는다 — 반드시 backend를 먼저
한 번 기동해 마이그레이션을 적용한 뒤 이 서비스를 실행할 것.

## 자동화 테스트

```bash
npm run test
```

`AlertsGateway`의 RESPONDER 배정 권한 검증(WebSocket join 스코프)과 `EscalationService`의
위험경고 재알림 조건(미확인·종료된 출동 제외)을 단위 테스트로 검증한다. 실제 DB 연결 없이
리포지토리를 목(mock)으로 대체한다.

## 인증

- REST: `Authorization: Bearer <backend가 발급한 JWT>` — backend `JwtTokenProvider`와 같은
  `JWT_SECRET`(HS512)을 공유해 검증한다. 별도 로그인 기능은 없다.
- WebSocket: `io(url, { auth: { token } })`로 연결 시 같은 JWT를 전달한다. 연결되면 자동으로
  `user:{userId}` 개인 채널에 합류하고, `join`/`leave` 메시지로 `incident:{incidentId}` 채널을
  구독/해제한다.
- `/webhook/*`(backend 전용 인바운드)는 로그인 사용자 JWT가 아니라 `INTERNAL_WEBHOOK_TOKEN`
  공유 비밀로 검증한다. 비워두면 503으로 거부한다. Java backend에도 같은 환경변수를 설정한다.

REST와 WebSocket join/전송은 `BACKEND_BASE_URL`의 `/api/v1/auth/session`으로 현재 계정을
재검증한다. backend 장애 시 접근을 허용하지 않는다. REST의 출동 배정·통신담당 권한은
`IncidentAccessGuard`가, 소켓 구독/전송 권한은 같은 `IncidentAccessService`가 검증한다.
알림 서버를 올리기 전에 backend Flyway V7을 적용해야 한다.

## REST 엔드포인트

| 메서드/경로 | 설명 |
|---|---|
| `GET /incidents/:id/alerts` | 해당 출동의 알림 피드 (CMD-002) |
| `POST /incidents/:id/alerts/entry-info` | FR-18 진입정보 공유 |
| `POST /incidents/:id/alerts/supply-request` | FR-23 장비·인력 지원요청 |
| `POST /incidents/:id/alerts/risk-warning` | FR-06 위험정보 알림(사람이 직접) |
| `POST /alerts/:id/acknowledgements` | FR-22 "확인했어요" |
| `GET /alerts/:id/acknowledgements/freshness` | FR-22 확인자 목록 + 신선도("N분 전 확인, 갱신 필요") |
| `POST /webhook/report-draft-created` | (backend 전용) FR-05 종료 확정 시 대원별 개인 채널 푸시 |
| `POST /webhook/risk-warning` | (backend 전용) FR-06 AI/시스템 발신 위험알림 → alerts 영속화 + 브로드캐스트 |

## WebSocket 이벤트

| 이벤트 | 채널 | 설명 |
|---|---|---|
| `alert:created` | `incident:{id}` | 새 alert(진입정보/지원요청/위험알림) 생성 |
| `alert:acknowledged` | `incident:{id}` | FR-22 확인 처리 |
| `report:draft-created` | `user:{userId}` | FR-05 사후보고서 작성 알림 (alerts 테이블에는 남기지 않는 개인 푸시) |

## 알려진 함정

`alerts.alert_type` ENUM(§3.7)에는 "사후보고서 작성 알림"에 대응하는 값이 없다 — 그래서
`report-draft-created`는 DB에 쓰지 않고 WebSocket 푸시만 한다. 나중에 이 알림도 이력으로 남겨야
한다면 DB설계서에 `alert_type`을 추가하는 마이그레이션이 backend 쪽에 먼저 필요하다.

## 보안 점검(Phase 10)에서 발견한 미해결 의존성 취약점

`npm audit`이 26건(모더레이트 15 · 하이 7)을 보고한다 — 대부분 `@nestjs/core`/`@nestjs/platform-express`
런타임 체인(주입 취약점, body-parser/multer DoS)과 `@nestjs/cli` 빌드 도구 체인(webpack/glob/tmp)이
NestJS 10 → 11(메이저) 업그레이드로만 고쳐지는 것들이다. 이번 점검에서는 `npm audit fix`(비파괴적)로
고쳐지는 것만 반영했고, 나머지는 프레임워크 메이저 버전을 통째로 올려야 해 회귀 위험이 커서
자동으로 강행하지 않았다 — 별도 마이그레이션 작업으로 다뤄야 한다.
