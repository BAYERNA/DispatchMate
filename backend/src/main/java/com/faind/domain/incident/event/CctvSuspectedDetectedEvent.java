package com.faind.domain.incident.event;

import java.util.UUID;

// FR-24/25 선제적 드론 배정: CCTV AI가 화재를 의심 감지한 순간(관리자 확인 전, status=AI_SUSPECTED)
// 발행된다. IncidentCreatedEvent와 달리 "정식 출동이 확정됐다"는 의미는 전혀 없다 — NFR-08 가드레일을
// 건드리지 않는다. 리스너는 정찰(recon) 목적의 드론 자동배정만 수행하고, incidents.status를
// 바꾸거나 대원을 소집하거나 공식 출동 기록을 만들지 않는다. 관리자가 confirm()하면 그때 별도로
// IncidentCreatedEvent가 발행되지만, 드론은 이미 이 시점에 현장으로 향하고 있어 확인 판단에
// 참고할 실시간 영상을 더 빨리 제공한다.
public record CctvSuspectedDetectedEvent(UUID incidentId) {}
