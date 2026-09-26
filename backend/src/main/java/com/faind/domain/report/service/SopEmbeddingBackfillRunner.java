package com.faind.domain.report.service;

import com.faind.domain.report.repository.SopDocumentRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

// Flyway SQL 마이그레이션(V16)은 sop_documents 행을 embedding 없이 심어둔다 — 임베딩 계산은
// Java 코드(SopEmbeddingService)라 SQL만으로는 채울 수 없다. 기동할 때마다 채워지지 않은 행을
// 찾아 채운다(멱등 — 이미 채워진 행은 WHERE embedding IS NULL에 안 걸려 다시 계산하지 않는다).
@Component
public class SopEmbeddingBackfillRunner implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(SopEmbeddingBackfillRunner.class);

  private final SopDocumentRepository sopDocumentRepository;
  private final SopEmbeddingService embeddingService;

  public SopEmbeddingBackfillRunner(SopDocumentRepository sopDocumentRepository, SopEmbeddingService embeddingService) {
    this.sopDocumentRepository = sopDocumentRepository;
    this.embeddingService = embeddingService;
  }

  @Override
  public void run(ApplicationArguments args) {
    List<Map<String, Object>> rows = sopDocumentRepository.findRowsMissingEmbedding();
    for (Map<String, Object> row : rows) {
      UUID sopId = (UUID) row.get("sop_id");
      String content = (String) row.get("content");
      sopDocumentRepository.updateEmbedding(sopId, embeddingService.embed(content));
    }
    if (!rows.isEmpty()) {
      log.info("SOP 문서 임베딩 {}건 생성 완료", rows.size());
    }
  }
}
