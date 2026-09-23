package com.faind.domain.incident.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.faind.domain.incident.dto.AssignmentRequest;
import com.faind.domain.incident.dto.ResponderStatusRequest;
import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.entity.IncidentAssignment;
import com.faind.domain.incident.entity.IncidentType;
import com.faind.domain.incident.repository.AiJudgmentLogRepository;
import com.faind.domain.incident.repository.DroneDispatchRepository;
import com.faind.domain.incident.repository.IncidentAssignmentRepository;
import com.faind.domain.incident.repository.IncidentRepository;
import com.faind.domain.incident.repository.PreAnalysisResultRepository;
import com.faind.domain.incident.repository.ResponderStatusLogRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

// 전체 점검(security audit)에서 발견/수정한 두 결함의 회귀 방지 테스트:
//  1) assign() — 두 번째 이후 배정자까지 선발대로 표시되던 버그
//  2) recordResponderStatus() — DISPATCHED→IN_PROGRESS 전환이 死코드였던 문제
@ExtendWith(MockitoExtension.class)
class IncidentServiceTest {

  @Mock private IncidentRepository incidentRepository;
  @Mock private IncidentAssignmentRepository assignmentRepository;
  @Mock private PreAnalysisResultRepository preAnalysisResultRepository;
  @Mock private ResponderStatusLogRepository responderStatusLogRepository;
  @Mock private DroneDispatchRepository droneDispatchRepository;
  @Mock private IncidentNumberGenerator incidentNumberGenerator;
  @Mock private ApplicationEventPublisher eventPublisher;
  @Mock private com.faind.domain.auth.service.AccountService accountService;
  @Mock private com.faind.domain.device.service.DeviceService deviceService;
  @Mock private AiJudgmentLogRepository aiJudgmentLogRepository;
  @Mock private RoutingApiClient routingApiClient;

  private IncidentService incidentService;

  @BeforeEach
  void setUp() {
    incidentService = new IncidentService(
        incidentRepository, assignmentRepository, preAnalysisResultRepository, responderStatusLogRepository,
        droneDispatchRepository, incidentNumberGenerator, eventPublisher, accountService, deviceService,
        aiJudgmentLogRepository, routingApiClient);
  }

  private static final UUID ORG_ID = UUID.randomUUID();

  private Incident dispatchedIncident() {
    return Incident.manualReport(
        ORG_ID, "2026-0001", IncidentType.FIRE, "서울 강남구", null, null, LocalDateTime.now(), UUID.randomUUID());
  }

  @Test
  void 최초_배정자만_선발대로_표시된다() {
    UUID incidentId = UUID.randomUUID();
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(dispatchedIncident()));
    when(assignmentRepository.existsByIncidentId(incidentId)).thenReturn(false);

    var response = incidentService.assign(ORG_ID, incidentId, new AssignmentRequest(UUID.randomUUID(), "화점진압"));

    assertThat(response.firstWave()).isTrue();
    assertThat(response.commsLead()).isTrue();
  }

  @Test
  void 두번째_이후_배정자는_선발대가_아니다() {
    UUID incidentId = UUID.randomUUID();
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(dispatchedIncident()));
    when(assignmentRepository.existsByIncidentId(incidentId)).thenReturn(true); // 이미 배정자가 있음

    var response = incidentService.assign(ORG_ID, incidentId, new AssignmentRequest(UUID.randomUUID(), "지원"));

    assertThat(response.firstWave()).isFalse();
    assertThat(response.commsLead()).isFalse();
  }

  @Test
  void 첫_상태보고_시점에_출동중에서_진행중으로_전환된다() {
    UUID incidentId = UUID.randomUUID();
    UUID userId = UUID.randomUUID();
    Incident incident = dispatchedIncident();
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));

    incidentService.recordResponderStatus(
        ORG_ID, incidentId, new ResponderStatusRequest(userId, null, null, "NORMAL", "CONNECTED"), userId);

    assertThat(incident.getStatus().name()).isEqualTo("IN_PROGRESS");
  }

  @Test
  void 이미_진행중이면_다시_전환을_시도하지_않는다() {
    UUID incidentId = UUID.randomUUID();
    UUID userId = UUID.randomUUID();
    Incident incident = dispatchedIncident();
    incident.markInProgress(); // 이미 IN_PROGRESS
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));

    // markInProgress()를 DISPATCHED가 아닐 때 다시 호출하면 예외가 나므로, 이 호출이
    // 예외 없이 끝난다는 것 자체가 "조건부로만 호출한다"는 로직이 지켜지고 있다는 증거다.
    incidentService.recordResponderStatus(
        ORG_ID, incidentId, new ResponderStatusRequest(userId, null, null, "NORMAL", "CONNECTED"), userId);

    assertThat(incident.getStatus().name()).isEqualTo("IN_PROGRESS");
  }

  @Test
  void 본인이_아닌_명의로_상태보고하면_거부된다() {
    UUID incidentId = UUID.randomUUID();
    UUID reporterUserId = UUID.randomUUID();
    UUID otherUserId = UUID.randomUUID();

    org.junit.jupiter.api.Assertions.assertThrows(
        com.faind.global.error.BusinessException.class,
        () -> incidentService.recordResponderStatus(
            ORG_ID, incidentId, new ResponderStatusRequest(otherUserId, null, null, "NORMAL", "CONNECTED"), reporterUserId));
  }

  @Test
  void 배정된_대원은_isResponderAssigned가_true다() {
    UUID incidentId = UUID.randomUUID();
    UUID userId = UUID.randomUUID();
    when(assignmentRepository.findByIncidentIdAndUserId(incidentId, userId))
        .thenReturn(Optional.of(new IncidentAssignment(incidentId, userId, "진압")));

    assertThat(incidentService.isResponderAssigned(incidentId, userId)).isTrue();
  }

  @Test
  void 배정되지_않은_대원은_isResponderAssigned가_false다() {
    UUID incidentId = UUID.randomUUID();
    UUID userId = UUID.randomUUID();
    when(assignmentRepository.findByIncidentIdAndUserId(incidentId, userId)).thenReturn(Optional.empty());

    assertThat(incidentService.isResponderAssigned(incidentId, userId)).isFalse();
  }

  // 멀티테넌시 1단계(V17) 회귀 방지: 다른 조직의 incident_id를 알거나 추측해도 조회·종료가
  // 되지 않아야 한다.
  @Test
  void 다른_조직의_출동은_조회할_수_없다() {
    UUID incidentId = UUID.randomUUID();
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(dispatchedIncident()));

    assertThat(
        org.junit.jupiter.api.Assertions.assertThrows(
                com.faind.global.error.BusinessException.class,
                () -> incidentService.getIncident(UUID.randomUUID(), incidentId))
            .getErrorCode())
        .isEqualTo(com.faind.global.error.ErrorCode.INCIDENT_NOT_FOUND);
  }

  @Test
  void 다른_조직의_출동은_종료할_수_없다() {
    UUID incidentId = UUID.randomUUID();
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(dispatchedIncident()));

    org.junit.jupiter.api.Assertions.assertThrows(
        com.faind.global.error.BusinessException.class,
        () -> incidentService.close(UUID.randomUUID(), incidentId));
  }
}
