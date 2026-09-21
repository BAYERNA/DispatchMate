package com.faind.domain.report.repository;

import com.faind.domain.report.dto.SopSearchResultItem;
import com.faind.domain.report.service.SopEmbeddingService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// sop_documents.embedding은 pgvector 타입이라 JPA/Hibernate가 기본으로 매핑하지 못한다 —
// 커넥션풀(HikariCP)에 안전하게 동작하도록 JDBC 드라이버 타입 등록(PGvector.addVectorType) 대신,
// pgvector가 지원하는 텍스트 리터럴 형식("[0.1,0.2,...]"::vector)으로 직접 문자열을 만들어 쓴다.
@Repository
public class SopDocumentRepository {

  private final JdbcTemplate jdbcTemplate;
  private final SopEmbeddingService embeddingService;

  public SopDocumentRepository(JdbcTemplate jdbcTemplate, SopEmbeddingService embeddingService) {
    this.jdbcTemplate = jdbcTemplate;
    this.embeddingService = embeddingService;
  }

  public List<Map<String, Object>> findRowsMissingEmbedding() {
    return jdbcTemplate.queryForList("SELECT sop_id, content FROM sop_documents WHERE embedding IS NULL");
  }

  public void updateEmbedding(UUID sopId, float[] embedding) {
    jdbcTemplate.update(
        "UPDATE sop_documents SET embedding = ?::vector WHERE sop_id = ?",
        embeddingService.toPgVectorLiteral(embedding),
        sopId);
  }

  // 코사인 거리(<=>)가 작을수록 유사 — similarity = 1 - distance로 뒤집어 "클수록 유사"로 맞춘다.
  // 표본이 적어(seed 5건) 임계값(threshold)은 호출 측(SopMatchAgent)에서 판단하도록 전부 반환한다.
  public List<SopSearchResultItem> searchBySimilarity(float[] queryEmbedding) {
    String literal = embeddingService.toPgVectorLiteral(queryEmbedding);
    return jdbcTemplate.query(
        """
        SELECT sop_id, item, reference,
               1 - (embedding <=> ?::vector) AS similarity
        FROM sop_documents
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ?::vector
        """,
        (rs, rowNum) -> new SopSearchResultItem(
            (UUID) rs.getObject("sop_id"),
            rs.getString("item"),
            rs.getString("reference"),
            rs.getDouble("similarity")),
        literal,
        literal);
  }
}
