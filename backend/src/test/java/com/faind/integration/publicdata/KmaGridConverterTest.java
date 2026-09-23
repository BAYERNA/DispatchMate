package com.faind.integration.publicdata;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

// 기상청 공식 변환식을 그대로 옮긴 것이므로, 공개적으로 잘 알려진 기준점(서울시청)으로 실제
// 기상청 API가 쓰는 격자 좌표와 일치하는지 검증한다.
class KmaGridConverterTest {

  @Test
  void 서울시청_좌표는_기상청_격자_60_127로_변환된다() {
    var grid = KmaGridConverter.toGrid(37.5665, 126.9780);

    assertThat(grid.nx()).isEqualTo(60);
    assertThat(grid.ny()).isEqualTo(127);
  }

  @Test
  void 부산시청_좌표는_기상청_격자_98_76으로_변환된다() {
    var grid = KmaGridConverter.toGrid(35.1796, 129.0756);

    assertThat(grid.nx()).isEqualTo(98);
    assertThat(grid.ny()).isEqualTo(76);
  }
}
