package com.faind.domain.noflyzone.dto;

import com.faind.domain.noflyzone.entity.NoFlyZone;
import java.math.BigDecimal;
import java.util.UUID;

public record NoFlyZoneResponse(
    UUID zoneId,
    String zoneName,
    String zoneType,
    BigDecimal centerLatitude,
    BigDecimal centerLongitude,
    BigDecimal radiusKm,
    boolean active) {

  public static NoFlyZoneResponse from(NoFlyZone zone) {
    return new NoFlyZoneResponse(
        zone.getZoneId(),
        zone.getZoneName(),
        zone.getZoneType(),
        zone.getCenterLatitude(),
        zone.getCenterLongitude(),
        zone.getRadiusKm(),
        zone.isActive());
  }
}
