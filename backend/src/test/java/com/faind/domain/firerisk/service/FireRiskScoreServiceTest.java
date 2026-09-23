package com.faind.domain.firerisk.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.faind.domain.firerisk.dto.FireRiskRegionInput;
import com.faind.domain.firerisk.dto.FireRiskRegionResponse;
import com.faind.domain.firerisk.entity.FireRiskRegion;
import com.faind.domain.firerisk.repository.FireRiskRegionRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FireRiskScoreServiceTest {

  @Mock private FireRiskRegionRepository repository;

  private FireRiskScoreService service;

  @BeforeEach
  void setUp() {
    service = new FireRiskScoreService(repository);
  }

  private FireRiskRegionInput input(
      String code, int fireCount, int responseTime, int casualty, String nightRatio, String structureRatio, String negligenceRatio) {
    return new FireRiskRegionInput(
        code, code + "_name", fireCount, responseTime, casualty,
        new BigDecimal(nightRatio), new BigDecimal(structureRatio), new BigDecimal(negligenceRatio));
  }

  @Test
  void 지역이_1개뿐이면_계량화할_수_없어_예외를_던진다() {
    List<FireRiskRegionInput> inputs = List.of(input("A", 10, 300, 1, "20", "10", "30"));

    assertThatThrownBy(() -> service.recompute(inputs))
        .isInstanceOf(BusinessException.class)
        .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
  }

  @Test
  void 모든_지표가_더_나쁜_지역이_더_높은_점수와_1위를_받는다() {
    when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    FireRiskRegionInput safer = input("SAFE", 5, 200, 0, "10", "5", "10");
    FireRiskRegionInput riskier = input("RISKY", 50, 900, 10, "70", "60", "80");

    List<FireRiskRegionResponse> ranked = service.recompute(List.of(safer, riskier));

    assertThat(ranked).hasSize(2);
    FireRiskRegionResponse first = ranked.get(0);
    assertThat(first.regionCode()).isEqualTo("RISKY");
    assertThat(first.rank()).isEqualTo(1);
    assertThat(first.riskScore()).isEqualByComparingTo("100.0");
    assertThat(first.riskGrade()).isEqualTo("상");

    FireRiskRegionResponse second = ranked.get(1);
    assertThat(second.regionCode()).isEqualTo("SAFE");
    assertThat(second.rank()).isEqualTo(2);
    assertThat(second.riskScore()).isEqualByComparingTo("0.0");
    assertThat(second.riskGrade()).isEqualTo("하");
  }

  @Test
  void 모든_지역의_지표가_동일하면_중간_점수와_중_등급을_받는다() {
    when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    FireRiskRegionInput a = input("A", 20, 400, 2, "30", "20", "40");
    FireRiskRegionInput b = input("B", 20, 400, 2, "30", "20", "40");

    List<FireRiskRegionResponse> ranked = service.recompute(List.of(a, b));

    assertThat(ranked).allSatisfy(r -> {
      assertThat(r.riskScore()).isEqualByComparingTo("50.0");
      assertThat(r.riskGrade()).isEqualTo("중");
    });
  }

  @Test
  void 저장된_지역들을_점수_내림차순으로_반환한다() {
    FireRiskRegion low = new FireRiskRegion(
        "LOW", "LOW_name", 5, 200, 0, new BigDecimal("10"), new BigDecimal("5"), new BigDecimal("10"),
        new BigDecimal("20.0"), "하");
    FireRiskRegion high = new FireRiskRegion(
        "HIGH", "HIGH_name", 50, 900, 10, new BigDecimal("70"), new BigDecimal("60"), new BigDecimal("80"),
        new BigDecimal("90.0"), "상");
    when(repository.findAll()).thenReturn(List.of(low, high));

    List<FireRiskRegionResponse> ranked = service.getRanked();

    assertThat(ranked).extracting(FireRiskRegionResponse::regionCode).containsExactly("HIGH", "LOW");
    assertThat(ranked).extracting(FireRiskRegionResponse::rank).containsExactly(1, 2);
  }
}
