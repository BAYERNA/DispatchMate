package com.faind.domain.report.controller;

import com.faind.domain.report.dto.SopSearchRequest;
import com.faind.domain.report.dto.SopSearchResultItem;
import com.faind.domain.report.repository.SopDocumentRepository;
import com.faind.domain.report.service.SopEmbeddingService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// FR-08: ai-server(sop_match_agent.py)가 제출된 사후보고서 원문으로 SOP 문서 벡터 유사도 검색을
// 요청하는 콜백. 로그인 사용자 JWT 대신 InternalServiceAuthFilter가 검증한다(다른 ai-server
// 콜백들과 동일한 패턴) — INTERNAL_PATHS에 이 경로를 등록해야 동작한다.
@RestController
@RequestMapping("/api/v1/sop")
public class SopSearchController {

  private final SopEmbeddingService embeddingService;
  private final SopDocumentRepository sopDocumentRepository;

  public SopSearchController(SopEmbeddingService embeddingService, SopDocumentRepository sopDocumentRepository) {
    this.embeddingService = embeddingService;
    this.sopDocumentRepository = sopDocumentRepository;
  }

  @PostMapping("/search")
  public List<SopSearchResultItem> search(@Valid @RequestBody SopSearchRequest request) {
    float[] queryEmbedding = embeddingService.embed(request.content());
    return sopDocumentRepository.searchBySimilarity(queryEmbedding);
  }
}
