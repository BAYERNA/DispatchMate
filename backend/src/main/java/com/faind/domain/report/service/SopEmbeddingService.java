package com.faind.domain.report.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

// FR-08 SOP 대조를 키워드 substring 매칭에서 벡터 유사도 검색으로 교체(RAG)하며 임베딩이
// 필요해졌다. 기술스택에 GPT/HuggingFace Transformers를 넣지 않기로 한 결정과 Claude가
// 임베딩 API를 제공하지 않는다는 제약 안에서, 외부 모델 호출 없이 결정적으로 계산 가능한
// hashing trick(feature hashing) 벡터를 쓴다 — 신경망 임베딩보다 의미 유사도 품질은 낮지만,
// 네트워크 의존성·GPU·별도 모델 서빙 없이 pgvector 유사도 검색 인프라(테이블·인덱스·쿼리)
// 자체는 동일하게 구축·검증할 수 있다. 나중에 실제 임베딩 API가 도입되면 embed()의 구현만
// 교체하면 되고, 저장·검색 계약은 그대로 유지된다.
@Component
public class SopEmbeddingService {

  public static final int DIMENSIONS = 128;

  // 한국어는 교착어라 "무전"/"무전으로"/"무전은"처럼 같은 어간에 조사·어미만 붙어도 단어 단위
  // 토큰이 전혀 겹치지 않는다(직접 테스트로 확인: 관련 문장인데도 공통 단어가 0~1개뿐이었음).
  // 형태소 분석기(예: MeCab-ko)를 새 의존성으로 들이는 대신, 문자 2-gram으로 쪼개면 "무전으로"와
  // "무전"이 "무전"이라는 조각을 공유해 유사도가 실제로 올라간다 — 언어에 무관하게 동작하는
  // 대신 정밀도는 형태소 분석보다 낮다는 트레이드오프를 감수한다.
  public float[] embed(String text) {
    float[] vector = new float[DIMENSIONS];
    if (text == null || text.isBlank()) {
      return vector;
    }
    String cleaned = text.toLowerCase(Locale.ROOT).replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}]+", " ").trim();
    for (String word : cleaned.split("\\s+")) {
      if (word.isBlank()) {
        continue;
      }
      for (String ngram : charNgrams(word, 2)) {
        int index = Math.floorMod(ngram.hashCode(), DIMENSIONS);
        vector[index] += 1.0f;
      }
    }
    normalize(vector);
    return vector;
  }

  private List<String> charNgrams(String word, int n) {
    List<String> grams = new ArrayList<>();
    if (word.length() <= n) {
      grams.add(word);
      return grams;
    }
    for (int i = 0; i <= word.length() - n; i++) {
      grams.add(word.substring(i, i + n));
    }
    return grams;
  }

  private void normalize(float[] vector) {
    double sumSquares = 0;
    for (float value : vector) {
      sumSquares += (double) value * value;
    }
    if (sumSquares == 0) {
      return;
    }
    float norm = (float) Math.sqrt(sumSquares);
    for (int i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }

  public String toPgVectorLiteral(float[] vector) {
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < vector.length; i++) {
      if (i > 0) {
        sb.append(',');
      }
      sb.append(vector[i]);
    }
    return sb.append(']').toString();
  }
}
