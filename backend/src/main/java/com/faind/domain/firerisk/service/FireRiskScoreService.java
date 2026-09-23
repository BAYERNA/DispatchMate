package com.faind.domain.firerisk.service;

import com.faind.domain.firerisk.dto.FireRiskRegionInput;
import com.faind.domain.firerisk.dto.FireRiskRegionResponse;
import com.faind.domain.firerisk.entity.FireRiskRegion;
import com.faind.domain.firerisk.repository.FireRiskRegionRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Fire Risk Score: 지역(시군구) 단위 화재 위험도를 6개 지표의 min-max 정규화 가중합으로 계량화한다.
// FAIND 사업계획서(드론 자동배차 기획)의 위험도 산출 개념을 소프트웨어로 옮긴 것 — 소방청
// 화재이력 데이터를 자동 수집하는 파이프라인은 아직 없어, 관리자가 집계된 지표를 제출하면
// 이 서비스가 정규화·가중합·등급화만 수행한다.
//
// 정규화는 이번 recompute() 호출에 포함된 지역들 사이의 상대 비교다 — 등급(상/중/하)은 그
// 배치 안에서의 상대 순위이지, 전국 절대 기준이 아니다. 제출한 지역 전체를 한 번에 넘기는 것을
// 전제로 한다.
@Service
@Transactional
public class FireRiskScoreService {

  // 6개 지표 가중치 — 사업계획서와 동일하게 균등 가중(1/6)으로 시작한다. 실데이터로 캘리브레이션
  // 전까지는 임의의 우선순위를 매기지 않는 게 더 정직하다.
  private static final double WEIGHT = 1.0 / 6;

  private final FireRiskRegionRepository repository;

  public FireRiskScoreService(FireRiskRegionRepository repository) {
    this.repository = repository;
  }

  public List<FireRiskRegionResponse> recompute(List<FireRiskRegionInput> inputs) {
    if (inputs.size() < 2) {
      // min-max 정규화는 비교 대상이 최소 2개는 있어야 의미가 있다(1개뿐이면 분모가 0이 되어
      // 나눗셈이 불가능하다).
      throw new BusinessException(ErrorCode.INVALID_INPUT, "위험도를 계량화하려면 최소 2개 지역의 데이터가 필요합니다.");
    }
    // 코드 리뷰 finding: 비율 필드가 비어 있으면 아래 mapToDouble()의 doubleValue() 호출에서
    // 곧바로 NPE가 나 500으로 새어나갔다 — 다른 입력 검증과 같은 방식으로 먼저 걸러낸다.
    if (inputs.stream().anyMatch(FireRiskScoreService::hasMissingField)) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "지역코드·지역명·화재 위험도 비율 지표는 모두 채워야 합니다.");
    }

    double[] fireCounts = inputs.stream().mapToDouble(FireRiskRegionInput::fireCount5y).toArray();
    double[] responseTimes = inputs.stream().mapToDouble(FireRiskRegionInput::responseTimeP90Seconds).toArray();
    double[] casualties = inputs.stream().mapToDouble(FireRiskRegionInput::casualtyTotal).toArray();
    double[] nightRatios = inputs.stream().mapToDouble(i -> i.nightFireRatio().doubleValue()).toArray();
    double[] structureRatios = inputs.stream().mapToDouble(i -> i.highRiskStructureRatio().doubleValue()).toArray();
    double[] negligenceRatios = inputs.stream().mapToDouble(i -> i.negligenceFireRatio().doubleValue()).toArray();

    List<FireRiskRegion> saved = new ArrayList<>();
    for (int i = 0; i < inputs.size(); i++) {
      FireRiskRegionInput input = inputs.get(i);
      double normalizedSum =
          normalize(fireCounts[i], fireCounts)
              + normalize(responseTimes[i], responseTimes)
              + normalize(casualties[i], casualties)
              + normalize(nightRatios[i], nightRatios)
              + normalize(structureRatios[i], structureRatios)
              + normalize(negligenceRatios[i], negligenceRatios);
      BigDecimal riskScore = BigDecimal.valueOf(normalizedSum * WEIGHT * 100).setScale(1, RoundingMode.HALF_UP);
      String grade = grade(riskScore.doubleValue());

      FireRiskRegion region = new FireRiskRegion(
          input.regionCode(),
          input.regionName(),
          input.fireCount5y(),
          input.responseTimeP90Seconds(),
          input.casualtyTotal(),
          input.nightFireRatio(),
          input.highRiskStructureRatio(),
          input.negligenceFireRatio(),
          riskScore,
          grade);
      saved.add(repository.save(region));
    }

    return toRankedResponses(saved);
  }

  @Transactional(readOnly = true)
  public List<FireRiskRegionResponse> getRanked() {
    return toRankedResponses(repository.findAll());
  }

  private double normalize(double value, double[] all) {
    double min = Arrays.stream(all).min().orElse(value);
    double max = Arrays.stream(all).max().orElse(value);
    if (max == min) {
      return 0.5; // 배치 안 전 지역이 동일한 값이면 우열을 가릴 수 없으므로 중간값으로 둔다.
    }
    return (value - min) / (max - min);
  }

  private String grade(double score) {
    if (score >= 66.7) return "상";
    if (score >= 33.3) return "중";
    return "하";
  }

  private static boolean hasMissingField(FireRiskRegionInput input) {
    return input.regionCode() == null
        || input.regionCode().isBlank()
        || input.regionName() == null
        || input.regionName().isBlank()
        || input.nightFireRatio() == null
        || input.highRiskStructureRatio() == null
        || input.negligenceFireRatio() == null;
  }

  private List<FireRiskRegionResponse> toRankedResponses(List<FireRiskRegion> regions) {
    List<FireRiskRegion> sorted =
        regions.stream().sorted(Comparator.comparing(FireRiskRegion::getRiskScore).reversed()).toList();
    List<FireRiskRegionResponse> responses = new ArrayList<>();
    for (int i = 0; i < sorted.size(); i++) {
      FireRiskRegion r = sorted.get(i);
      responses.add(new FireRiskRegionResponse(r.getRegionCode(), r.getRegionName(), r.getRiskScore(), r.getRiskGrade(), i + 1));
    }
    return responses;
  }
}
