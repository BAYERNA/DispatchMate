package com.faind.integration.db;

import static org.assertj.core.api.Assertions.assertThat;

import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.entity.IncidentStatus;
import com.faind.domain.incident.entity.IncidentType;
import com.faind.domain.incident.repository.IncidentRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

// Mockito 단위테스트는 레포지토리를 항상 mock으로 대체하기 때문에, 엔티티 매핑이 실제 Flyway
// 마이그레이션 결과와 어긋나도(컬럼 길이·타입·제약조건 불일치) 잡히지 않는다. 이 테스트는 진짜
// PostgreSQL 컨테이너를 띄워 V1~V15 마이그레이션을 그대로 적용한 뒤 엔티티를 저장/조회한다 —
// application.yml의 jpa.hibernate.ddl-auto=validate가 이 스키마 위에서 실제로 통과하는지까지 검증한다.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class IncidentRepositoryContainerTest {

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

  @org.springframework.beans.factory.annotation.Autowired private IncidentRepository incidentRepository;

  @Test
  void 실제_마이그레이션된_스키마에_사건을_저장하고_조회할_수_있다() {
    Incident incident = Incident.manualReport(
        "2026-CT-0001", IncidentType.FIRE, "서울시 테스트구 테스트로 1",
        new BigDecimal("37.5665"), new BigDecimal("126.9780"), LocalDateTime.now(), null);

    Incident saved = incidentRepository.save(incident);

    assertThat(saved.getIncidentId()).isNotNull();
    assertThat(incidentRepository.findByIncidentNumber("2026-CT-0001"))
        .isPresent()
        .get()
        .extracting(Incident::getStatus)
        .isEqualTo(IncidentStatus.DISPATCHED);
  }
}
