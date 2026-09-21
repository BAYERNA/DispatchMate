package com.faind.integration.notification;

import com.faind.integration.notification.dto.ReportDraftCreatedWebhookDto;
import com.faind.integration.notification.dto.RiskWarningWebhookDto;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

// notification-server(Node/NestJS)의 인바운드 웹훅(common/webhook)을 호출하는 구현체.
// FR-05 QA 재검증 대상: 이 호출이 IncidentClosedListener(AFTER_COMMIT)에서 실제로 나가는지가
// "종료 확정 시 알림 미발송" 결함의 재발 방지 포인트다.
//
// AiAnalysisHttpAdapter와 같은 이유로 명시적 타임아웃을 둔다 — 알림서버가 응답 없이 연결만
// 물고 있으면 요청 스레드가 무한 대기하며 AFTER_COMMIT 리스너 전체가 멈춰버릴 수 있었다.
@Component
public class NotificationHttpAdapter implements NotificationPort {

  private static final Logger log = LoggerFactory.getLogger(NotificationHttpAdapter.class);

  private final RestClient restClient;

  public NotificationHttpAdapter(RestClient.Builder restClientBuilder, Environment env) {
    String baseUrl = env.getProperty("faind.integration.notification-server.base-url", "http://localhost:3001");
    HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(2))
        .version(HttpClient.Version.HTTP_1_1)
        .build();
    JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
    requestFactory.setReadTimeout(Duration.ofSeconds(5));
    var builder = restClientBuilder.baseUrl(baseUrl).requestFactory(requestFactory);
    String token = env.getProperty("faind.integration.notification-server.token", "");
    if (org.springframework.util.StringUtils.hasText(token)) {
      builder.defaultHeader("Authorization", "Bearer " + token);
    }
    this.restClient = builder.build();
  }

  @Override
  @CircuitBreaker(name = "notificationServer", fallbackMethod = "notifyReportDraftCreatedFallback")
  public void notifyReportDraftCreated(UUID incidentId, List<UUID> responderIds, List<UUID> reportIds) {
    restClient.post()
        .uri("/webhook/report-draft-created")
        .body(new ReportDraftCreatedWebhookDto(incidentId, responderIds, reportIds))
        .retrieve()
        .toBodilessEntity();
  }

  @Override
  @CircuitBreaker(name = "notificationServer", fallbackMethod = "broadcastRiskWarningFallback")
  public void broadcastRiskWarning(UUID incidentId, String message) {
    restClient.post()
        .uri("/webhook/risk-warning")
        .body(new RiskWarningWebhookDto(incidentId, message))
        .retrieve()
        .toBodilessEntity();
  }

  @SuppressWarnings("unused")
  private void notifyReportDraftCreatedFallback(
      UUID incidentId, List<UUID> responderIds, List<UUID> reportIds, Throwable throwable) {
    log.error(
        "notification-server 호출 실패 — 대원 {}명에게 보고서 작성 알림이 발송되지 않았습니다 (incidentId={})",
        responderIds.size(), incidentId, throwable);
  }

  @SuppressWarnings("unused")
  private void broadcastRiskWarningFallback(UUID incidentId, String message, Throwable throwable) {
    log.error("notification-server 호출 실패 — 위험정보 알림이 발송되지 않았습니다 (incidentId={})", incidentId, throwable);
  }
}
