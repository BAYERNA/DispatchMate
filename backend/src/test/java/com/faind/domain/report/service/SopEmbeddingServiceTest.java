package com.faind.domain.report.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SopEmbeddingServiceTest {

  private final SopEmbeddingService service = new SopEmbeddingService();

  @Test
  void 같은_텍스트는_항상_같은_벡터를_만든다() {
    float[] a = service.embed("화재를 인지한 즉시 무전으로 상황을 보고했다");
    float[] b = service.embed("화재를 인지한 즉시 무전으로 상황을 보고했다");
    assertThat(a).isEqualTo(b);
  }

  @Test
  void 빈_텍스트는_0벡터다() {
    assertThat(service.embed("")).containsOnly(0f);
    assertThat(service.embed(null)).containsOnly(0f);
  }

  @Test
  void 벡터는_L2_정규화된다() {
    float[] vector = service.embed("무전 보고 인명 검색 진압 대피");
    double sumSquares = 0;
    for (float v : vector) {
      sumSquares += (double) v * v;
    }
    assertThat(Math.sqrt(sumSquares)).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-5));
  }

  @Test
  void 겹치는_단어가_많을수록_코사인_유사도가_높다() {
    float[] report = service.embed("화재를 인지한 즉시 무전으로 상황을 보고했다. 초기 진압을 위해 방수했다.");
    float[] related = service.embed("무전 보고 원칙에 따라 상황을 신속히 보고한다");
    float[] unrelated = service.embed("잔화 확인 후 안전하게 철수한다");

    assertThat(cosine(report, related)).isGreaterThan(cosine(report, unrelated));
  }

  @Test
  void pgvector_리터럴_형식으로_변환된다() {
    float[] vector = new float[]{0.5f, -0.25f, 0f};
    assertThat(service.toPgVectorLiteral(vector)).isEqualTo("[0.5,-0.25,0.0]");
  }

  private double cosine(float[] a, float[] b) {
    double dot = 0;
    for (int i = 0; i < a.length; i++) {
      dot += (double) a[i] * b[i];
    }
    return dot;
  }
}
