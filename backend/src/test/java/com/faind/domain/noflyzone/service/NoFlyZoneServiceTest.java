package com.faind.domain.noflyzone.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.faind.domain.noflyzone.dto.NoFlyZoneRequest;
import com.faind.domain.noflyzone.entity.NoFlyZone;
import com.faind.domain.noflyzone.repository.NoFlyZoneRepository;
import com.faind.global.error.BusinessException;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class NoFlyZoneServiceTest {

  @Mock private NoFlyZoneRepository repository;

  private NoFlyZoneService service;

  @BeforeEach
  void setUp() {
    service = new NoFlyZoneService(repository);
  }

  private NoFlyZone zone(double lat, double lon, double radiusKm, boolean active) {
    NoFlyZone zone = new NoFlyZone("테스트 구역", "DEMO", BigDecimal.valueOf(lat), BigDecimal.valueOf(lon), BigDecimal.valueOf(radiusKm));
    if (!active) {
      org.springframework.test.util.ReflectionTestUtils.setField(zone, "active", false);
    }
    return zone;
  }

  @Test
  void 좌표가_구역_반경_안이면_비행금지로_판단한다() {
    when(repository.findByActiveTrue()).thenReturn(List.of(zone(37.5, 127.0, 3.0, true)));

    boolean result = service.isRestricted(BigDecimal.valueOf(37.51), BigDecimal.valueOf(127.0));

    assertThat(result).isTrue();
  }

  @Test
  void 좌표가_구역_반경_밖이면_비행금지가_아니다() {
    when(repository.findByActiveTrue()).thenReturn(List.of(zone(37.5, 127.0, 1.0, true)));

    boolean result = service.isRestricted(BigDecimal.valueOf(38.5), BigDecimal.valueOf(129.0));

    assertThat(result).isFalse();
  }

  @Test
  void 좌표가_없으면_판단_근거가_없어_막지_않는다() {
    boolean result = service.isRestricted(null, null);

    assertThat(result).isFalse();
  }

  @Test
  void 반경이_0_이하면_등록할_수_없다() {
    var request = new NoFlyZoneRequest("잘못된 구역", "DEMO", BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0), BigDecimal.ZERO);

    assertThatThrownBy(() -> service.register(request)).isInstanceOf(BusinessException.class);
  }

  // 코드 리뷰 finding: 구역명·유형이 비어 있으면 zone_name/zone_type NOT NULL 제약을 그대로
  // 때려 원시 DB 예외로 샜다.
  @Test
  void 구역명이_없으면_등록할_수_없다() {
    var request = new NoFlyZoneRequest(" ", "DEMO", BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0), BigDecimal.ONE);

    assertThatThrownBy(() -> service.register(request)).isInstanceOf(BusinessException.class);
  }

  @Test
  void 구역_유형이_없으면_등록할_수_없다() {
    var request = new NoFlyZoneRequest("구역", null, BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0), BigDecimal.ONE);

    assertThatThrownBy(() -> service.register(request)).isInstanceOf(BusinessException.class);
  }
}
