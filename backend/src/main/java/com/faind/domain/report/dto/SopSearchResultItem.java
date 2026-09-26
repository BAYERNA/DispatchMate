package com.faind.domain.report.dto;

import java.util.UUID;

// similarity는 코사인 유사도(1에 가까울수록 유사, -1에 가까울수록 반대) — 매칭 여부 판단(임계값
// 적용)은 이 결과를 소비하는 ai-server SopMatchAgent가 한다(백엔드는 순위만 매겨 돌려준다).
public record SopSearchResultItem(UUID sopId, String item, String reference, double similarity) {}
