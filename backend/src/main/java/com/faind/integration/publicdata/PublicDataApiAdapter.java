package com.faind.integration.publicdata;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

// 소방청 공공데이터포털 API 연동. FR-02 사전분석의 주된 조회는 ai-server(pre_analysis_agent.py)가
// 직접 수행하지만(코드구조설계서 §3), Java 쪽에서도 건물/화재이력 정보를 보조적으로 조회해야 하는
// 경우(예: CMD-001 화면 재조회, 캐시 미스 시 폴백)를 위해 동일 계약의 어댑터를 여기 둔다.
//
// 외부 공공 API가 응답 없이 연결만 물고 있을 경우를 대비해 연결 2초/응답 3초 타임아웃을 명시한다
// (AiAnalysisHttpAdapter와 동일한 이유 — 무한 대기 방지).
@Component
public class PublicDataApiAdapter {

  private static final Logger log = LoggerFactory.getLogger(PublicDataApiAdapter.class);
  private static final DateTimeFormatter BASE_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");

  private final RestClient restClient;
  private final String serviceKey;

  public PublicDataApiAdapter(RestClient.Builder restClientBuilder, Environment env) {
    String baseUrl = env.getProperty("faind.integration.public-data.base-url", "https://apis.data.go.kr");
    this.serviceKey = env.getProperty("faind.integration.public-data.service-key", "");
    HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
    requestFactory.setReadTimeout(Duration.ofSeconds(3));
    this.restClient = restClientBuilder.baseUrl(baseUrl).requestFactory(requestFactory).build();
  }

  public Map<String, Object> fetchBuildingHazardInfo(String address) {
    if (serviceKey.isBlank()) {
      return Map.of();
    }
    return restClient.get()
        .uri(uriBuilder -> uriBuilder
            .path("/1613000/BldRgstService_v2/getBrTitleInfo")
            .queryParam("serviceKey", serviceKey)
            .queryParam("address", address)
            .build())
        .retrieve()
        .body(Map.class);
  }

  // FR-25 드론 비행 전 안전 게이트(악천후 시 출동 보류)의 데이터 소스. 기상청 초단기실황조회
  // (getUltraSrtNcst)는 위경도가 아니라 격자 좌표(nx, ny)를 받으므로 KmaGridConverter로 변환한다.
  // 관측은 매시 40분경 갱신되므로, 이번 정시 관측이 아직 안 올라왔을 수 있는 시각(0~44분)엔
  // 한 시간 전 관측을 요청한다.
  public Optional<WeatherSnapshot> fetchCurrentWeather(BigDecimal lat, BigDecimal lon) {
    if (serviceKey.isBlank() || lat == null || lon == null) {
      return Optional.empty();
    }
    try {
      KmaGridConverter.Grid grid = KmaGridConverter.toGrid(lat.doubleValue(), lon.doubleValue());
      LocalDateTime baseDateTime = LocalDateTime.now();
      if (baseDateTime.getMinute() < 45) {
        baseDateTime = baseDateTime.minusHours(1);
      }
      String baseDate = baseDateTime.format(BASE_DATE_FORMAT);
      String baseTime = "%02d00".formatted(baseDateTime.getHour());

      Map<?, ?> response = restClient.get()
          .uri(uriBuilder -> uriBuilder
              .path("/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst")
              .queryParam("serviceKey", serviceKey)
              .queryParam("dataType", "JSON")
              .queryParam("base_date", baseDate)
              .queryParam("base_time", baseTime)
              .queryParam("nx", grid.nx())
              .queryParam("ny", grid.ny())
              .build())
          .retrieve()
          .body(Map.class);

      return parseWeather(response);
    } catch (Exception e) {
      // 비행 여부를 가리는 안전장치일 뿐 핵심 배차 로직은 아니므로, 실패 시 배차 자체를 막지 않고
      // (호출부가 "관측 불가 = 판단 보류하지 않음"으로 처리) 조용히 비운다 — 로그만 남긴다.
      log.warn("기상 관측 조회 실패 — 안전 게이트를 건너뜁니다 (lat={}, lon={})", lat, lon, e);
      return Optional.empty();
    }
  }

  @SuppressWarnings("unchecked")
  private Optional<WeatherSnapshot> parseWeather(Map<?, ?> response) {
    Object body = navigate(response, "response", "body");
    Object items = navigate(body, "items", "item");
    if (!(items instanceof List<?> itemList)) {
      return Optional.empty();
    }

    Double windSpeedMs = null;
    Double precipitationMm = null;
    for (Object entry : itemList) {
      if (!(entry instanceof Map<?, ?> item)) {
        continue;
      }
      String category = String.valueOf(item.get("category"));
      Double value = parseDouble(item.get("obsrValue"));
      if ("WSD".equals(category)) {
        windSpeedMs = value;
      } else if ("RN1".equals(category)) {
        precipitationMm = value;
      }
    }

    if (windSpeedMs == null || precipitationMm == null) {
      return Optional.empty();
    }
    return Optional.of(new WeatherSnapshot(windSpeedMs, precipitationMm));
  }

  private Object navigate(Object node, String... path) {
    Object current = node;
    for (String key : path) {
      if (!(current instanceof Map<?, ?> map)) {
        return null;
      }
      current = map.get(key);
    }
    return current;
  }

  // RN1은 "강수없음" 같은 비수치 문자열로 올 수 있다 — 이 경우 강수 없음(0.0)으로 본다.
  private Double parseDouble(Object raw) {
    if (raw == null) {
      return null;
    }
    try {
      return Double.parseDouble(String.valueOf(raw).replaceAll("[^0-9.\\-]", ""));
    } catch (NumberFormatException e) {
      return 0.0;
    }
  }
}
