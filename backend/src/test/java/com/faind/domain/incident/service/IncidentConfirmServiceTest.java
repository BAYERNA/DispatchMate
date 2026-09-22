package com.faind.domain.incident.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.entity.IncidentType;
import com.faind.domain.incident.repository.IncidentRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.security.AuthenticatedUser;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

// NFR-08 회귀 방지: "AI 의심감지 → 정식 출동 확정은 API 레벨에서 role=ADMIN으로 강제한다"를
// 서비스 레벨에서 검증한다 — 컨트롤러에 @PreAuthorize가 없어도(DispatchController.confirm이
// 실제로 그렇다) 이 서비스가 한 번 더 막아야 한다는 게 이 클래스의 존재 이유다.
@ExtendWith(MockitoExtension.class)
class IncidentConfirmServiceTest {

  @Mock private IncidentRepository incidentRepository;
  @Mock private ApplicationEventPublisher eventPublisher;

  private IncidentConfirmService confirmService;

  @BeforeEach
  void setUp() {
    confirmService = new IncidentConfirmService(incidentRepository, eventPublisher);
  }

  private static final UUID ORG_ID = UUID.randomUUID();

  private Incident aiSuspectedIncident() {
    return Incident.cctvSuspected(ORG_ID, "2026-0001", "CCTV-014", null, null, LocalDateTime.now());
  }

  @Test
  void ADMIN이_아니면_확정할_수_없다() {
    AuthenticatedUser commander = new AuthenticatedUser(UUID.randomUUID(), "COMMANDER", ORG_ID);

    assertThatThrownBy(() -> confirmService.confirm(UUID.randomUUID(), commander))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void 인증정보가_없으면_확정할_수_없다() {
    assertThatThrownBy(() -> confirmService.confirm(UUID.randomUUID(), null))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void ADMIN은_AI_의심감지를_출동으로_확정할_수_있다() {
    UUID incidentId = UUID.randomUUID();
    AuthenticatedUser admin = new AuthenticatedUser(UUID.randomUUID(), "ADMIN", ORG_ID);
    Incident incident = aiSuspectedIncident();
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));

    var response = confirmService.confirm(incidentId, admin);

    assertThat(response.status()).isEqualTo("DISPATCHED");
  }

  @Test
  void ADMIN이_아니면_오탐_처리도_할_수_없다() {
    AuthenticatedUser responder = new AuthenticatedUser(UUID.randomUUID(), "RESPONDER", ORG_ID);

    assertThatThrownBy(() -> confirmService.rejectAsFalsePositive(UUID.randomUUID(), responder))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void ADMIN은_오탐_처리를_할_수_있다() {
    UUID incidentId = UUID.randomUUID();
    AuthenticatedUser admin = new AuthenticatedUser(UUID.randomUUID(), "ADMIN", ORG_ID);
    Incident incident = aiSuspectedIncident();
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));

    var response = confirmService.rejectAsFalsePositive(incidentId, admin);

    assertThat(response.status()).isEqualTo("CLOSED");
    // chk_incidents_confirmed_by_gate: AI_SUSPECTED를 벗어나는 CCTV_AUTO_DETECTION 출동은
    // confirmed_by가 반드시 채워져야 한다 — 안 채우면 실제 DB에서 이 저장이 거부된다.
    assertThat(incident.getConfirmedBy()).isEqualTo(admin.userId());
  }
}
