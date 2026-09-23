package com.faind.domain.noflyzone.dto;

import java.math.BigDecimal;

public record NoFlyZoneRequest(
    String zoneName, String zoneType, BigDecimal centerLatitude, BigDecimal centerLongitude, BigDecimal radiusKm) {}
