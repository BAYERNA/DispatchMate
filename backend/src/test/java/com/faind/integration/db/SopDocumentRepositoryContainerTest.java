package com.faind.integration.db;

import static org.assertj.core.api.Assertions.assertThat;

import com.faind.domain.report.dto.SopSearchResultItem;
import com.faind.domain.report.repository.SopDocumentRepository;
import com.faind.domain.report.service.SopEmbeddingBackfillRunner;
import com.faind.domain.report.service.SopEmbeddingService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

// FR-08 RAG 파이프라인 전체(임베딩 백필 → pgvector 유사도 검색)를 실제 PostgreSQL(pgvector
// 확장 포함)에 대고 검증한다. sop_match_agent.py의 키워드 매칭을 대체하는 핵심 경로라
// 벡터 인덱스·거리 연산자(<=>)가 실제로 동작하는지가 이 기능의 존재 이유다 — 단위테스트로는
// pgvector 확장 유무·SQL 문법 오류를 잡을 수 없다.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class SopDocumentRepositoryContainerTest {

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"))
          .withDatabaseName("faind").withUsername("faind").withPassword("faind");

  @DynamicPropertySource
  static void datasourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 기동시_백필된_임베딩으로_관련_SOP가_1순위로_검색된다() throws Exception {
    SopEmbeddingService embeddingService = new SopEmbeddingService();
    SopDocumentRepository repository = new SopDocumentRepository(jdbcTemplate, embeddingService);

    new SopEmbeddingBackfillRunner(repository, embeddingService).run(new DefaultApplicationArguments());

    Integer stillMissing =
        jdbcTemplate.queryForObject("SELECT count(*) FROM sop_documents WHERE embedding IS NULL", Integer.class);
    assertThat(stillMissing).isZero();

    float[] query = embeddingService.embed("화재 발생을 확인하자마자 즉시 무전으로 현장 상황을 보고했습니다.");
    List<SopSearchResultItem> results = repository.searchBySimilarity(query);

    assertThat(results).hasSize(5);
    assertThat(results.get(0).item()).isEqualTo("화재 인지 → 무전 보고");
    assertThat(results.get(0).similarity()).isGreaterThan(results.get(4).similarity());
  }
}
