package com.faind.listener;

import com.faind.domain.incident.event.CctvSuspectedDetectedEvent;
import com.faind.domain.incident.service.DroneDispatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

// FR-24/25 선제적 드론 배정: 관리자가 confirm()하기 전, AI_SUSPECTED 단계에서 이미 정찰용 드론을
// 띄운다. AFTER_COMMIT에서 실행해 CctvDetectionService.receiveDetection()의 핵심 트랜잭션(incident +
// AI 판단 로그 저장)이 드론 배정 실패로 롤백되지 않게 한다 — IncidentCreatedListener와 같은 이유.
@Component
public class CctvSuspectedDroneReconListener {

  private static final Logger log = LoggerFactory.getLogger(CctvSuspectedDroneReconListener.class);

  private final DroneDispatchService droneDispatchService;

  public CctvSuspectedDroneReconListener(DroneDispatchService droneDispatchService) {
    this.droneDispatchService = droneDispatchService;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onCctvSuspectedDetected(CctvSuspectedDetectedEvent event) {
    try {
      droneDispatchService.autoDispatch(event.incidentId());
    } catch (Exception e) {
      log.error("FR-25 선제적 드론 정찰 배정 실패 (incidentId={})", event.incidentId(), e);
    }
  }
}
