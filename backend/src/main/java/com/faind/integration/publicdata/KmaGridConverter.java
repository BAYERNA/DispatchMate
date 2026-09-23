package com.faind.integration.publicdata;

// 기상청 단기예보 API는 위경도가 아니라 LCC(Lambert Conformal Conic) 격자 좌표(nx, ny)를 받는다.
// 기상청이 공개한 변환 공식(격자 간격 5km, 표준위도 30°/60°, 기준점 (126.0E, 38.0N) → (43, 136))을
// 그대로 옮긴 것 — 임의로 만든 수식이 아니라 공식 문서의 표준 변환식이다.
final class KmaGridConverter {

  private static final double RE = 6371.00877;
  private static final double GRID = 5.0;
  private static final double SLAT1 = 30.0;
  private static final double SLAT2 = 60.0;
  private static final double OLON = 126.0;
  private static final double OLAT = 38.0;
  private static final double XO = 43;
  private static final double YO = 136;
  private static final double DEGRAD = Math.PI / 180.0;

  private KmaGridConverter() {}

  record Grid(int nx, int ny) {}

  static Grid toGrid(double lat, double lon) {
    double re = RE / GRID;
    double slat1 = SLAT1 * DEGRAD;
    double slat2 = SLAT2 * DEGRAD;
    double olon = OLON * DEGRAD;
    double olat = OLAT * DEGRAD;

    double sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    double sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
    double ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);

    double ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
    ra = re * sf / Math.pow(ra, sn);
    double theta = lon * DEGRAD - olon;
    if (theta > Math.PI) {
      theta -= 2.0 * Math.PI;
    }
    if (theta < -Math.PI) {
      theta += 2.0 * Math.PI;
    }
    theta *= sn;

    int nx = (int) Math.floor(ra * Math.sin(theta) + XO + 0.5);
    int ny = (int) Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
    return new Grid(nx, ny);
  }
}
