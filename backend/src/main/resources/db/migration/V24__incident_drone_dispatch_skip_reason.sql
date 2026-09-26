-- FR-25 자동배정이 기상/비행금지구역 게이트나 가용 드론 부족으로 조용히 건너뛰어질 때, 그 사유를
-- incidents에 남겨 CMD-001/002 화면에서 "왜 드론이 안 떴는지" 보여줄 수 있게 한다. 이전까지는
-- DroneDispatchService가 로그만 남기고 아무 흔적도 남기지 않아 지휘관이 알 방법이 없었다.
ALTER TABLE incidents
  ADD COLUMN drone_dispatch_skip_reason VARCHAR(30),
  ADD COLUMN drone_dispatch_skipped_at TIMESTAMP;
