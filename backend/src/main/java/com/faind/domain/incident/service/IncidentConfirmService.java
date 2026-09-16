package com.faind.domain.incident.service;

import com.faind.domain.incident.dto.IncidentResponse;
import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.event.IncidentCreatedEvent;
import com.faind.domain.incident.repository.IncidentRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.global.security.AuthenticatedUser;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// FR-24 / NFR-08: CCTV의 AI_SUSPECTED를 사람이 최종 확정(DISPATCHED)하는 유일한 통로.
// "이 확인 권한은 화면 접근 제한이 아니라 API 레벨에서 role='ADMIN'으로 검증한다"는 NFR-08 원문을
// 그대로 이 서비스에서 강제한다 — 프론트가 이 API를 우회 호출해도 role 검증은 여기서 다시 걸린다.
@Service
public class IncidentConfirmService {

  private final IncidentRepository incidentRepository;
  private final ApplicationEventPublisher eventPublisher;

  public IncidentConfirmService(IncidentRepository incidentRepository, ApplicationEventPublisher eventPublisher) {
    this.incidentRepository = incidentRepository;
    this.eventPublisher = eventPublisher;
  }

  @Transactional
  public IncidentResponse confirm(UUID incidentId, AuthenticatedUser currentUser) {
    requireAdmin(currentUser);
    Incident incident = findIncident(incidentId);
    incident.confirmDispatch(currentUser.userId());
    // ADM-001 annot#2: "이 순간 비로소 IncidentCreated 이벤트가 발행되어 사전분석·드론출동이 시작됨"
    eventPublisher.publishEvent(new IncidentCreatedEvent(incidentId, true));
    return IncidentResponse.from(incident);
  }

  @Transactional
  public IncidentResponse rejectAsFalsePositive(UUID incidentId, AuthenticatedUser currentUser) {
    requireAdmin(currentUser);
    Incident incident = findIncident(incidentId);
    incident.rejectAsFalsePositive(currentUser.userId());
    return IncidentResponse.from(incident);
  }

  private void requireAdmin(AuthenticatedUser currentUser) {
    if (currentUser == null || !currentUser.isAdmin()) {
      throw new BusinessException(ErrorCode.ADMIN_ONLY);
    }
  }

  private Incident findIncident(UUID incidentId) {
    return incidentRepository.findById(incidentId).orElseThrow(() -> new BusinessException(ErrorCode.INCIDENT_NOT_FOUND));
  }
}
