-- 코드 리뷰 finding: DroneDispatchService.autoDispatch()의 멱등성 가드(같은 incident_id로 두 번
-- 호출되지 않도록 배정 이력을 먼저 조회)는 check-then-act라 원자적이지 않다 — CCTV 의심감지
-- 단계와 confirm() 단계가 거의 동시에 이 메서드를 호출하면 두 트랜잭션 모두 "배정 이력 없음"을
-- 보고 통과해 같은 사건에 드론이 두 대 배정될 수 있다. 애초에 한 사건당 자동배정은 최대 1건이라는
-- 게 이 서비스의 전제(재배정 기능이 없다)이므로, 이 유니크 제약이 최종 방어선이 된다 — 경합에서
-- 진 트랜잭션은 INSERT 시점에 즉시 실패해 롤백된다(claimDroneForDispatch()로 선점했던 드론도
-- 트랜잭션과 함께 되돌아간다).
ALTER TABLE drone_dispatches ADD CONSTRAINT uq_drone_dispatches_incident_id UNIQUE (incident_id);
