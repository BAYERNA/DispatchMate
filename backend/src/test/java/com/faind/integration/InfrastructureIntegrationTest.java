package com.faind.integration;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class InfrastructureIntegrationTest {

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"))
          .withDatabaseName("faind")
          .withUsername("faind")
          .withPassword("faind");

  @Container
  static final GenericContainer<?> REDIS =
      new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);

  @DynamicPropertySource
  static void infrastructureProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
    registry.add("spring.data.redis.host", REDIS::getHost);
    registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
  }

  @Autowired DataSource dataSource;
  @Autowired StringRedisTemplate redis;

  @Test
  void appliesEveryFlywayMigrationToPostgres() {
    var jdbc = new JdbcTemplate(dataSource);

    Integer failed =
        jdbc.queryForObject(
            "select count(*) from flyway_schema_history where success = false", Integer.class);
    String latestVersion =
        jdbc.queryForObject(
            "select version from flyway_schema_history where success = true "
                + "order by installed_rank desc limit 1",
            String.class);

    assertThat(failed).isZero();
    assertThat(latestVersion).isEqualTo("27");
  }

  @Test
  void readsAndWritesThroughRedisTemplate() {
    String key = "test:infrastructure:health";
    redis.opsForValue().set(key, "ready");

    assertThat(redis.opsForValue().get(key)).isEqualTo("ready");
    redis.delete(key);
  }
}
