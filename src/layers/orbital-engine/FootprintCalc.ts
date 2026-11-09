import {
  DEG_TO_RAD,
  EARTH_RADIUS_KM,
  FootprintGeometry,
  GeodeticCoordinate,
  RAD_TO_DEG,
} from '../../shared';

export interface FootprintOptions {
  minElevationDeg?: number;
  verticesCount?: number;
}

/**
 * Calculates geometric coverage footprint circles and boundary polygons (RF-12).
 */
export class FootprintCalc {
  /**
   * Computes footprint radius and perimeter polygon points for a given subsatellite coordinate and altitude.
   */
  public static computeFootprint(
    center: GeodeticCoordinate,
    options?: FootprintOptions,
  ): FootprintGeometry {
    const minElevationDeg = options?.minElevationDeg ?? 10;
    const verticesCount = options?.verticesCount ?? 48;

    const minElRad = minElevationDeg * DEG_TO_RAD;
    const ratio =
      (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + center.altitudeKm)) *
      Math.cos(minElRad);
    const clampedRatio = Math.max(-1, Math.min(1, ratio));

    // Geocentric central angular radius in radians
    const centralAngleRad = Math.max(0, Math.acos(clampedRatio) - minElRad);
    const surfaceRadiusKm = EARTH_RADIUS_KM * centralAngleRad;
    const centralAngleDeg = centralAngleRad * RAD_TO_DEG;

    const polygonCoordinates: Array<{ latitude: number; longitude: number }> = [];

    const centerLatRad = center.latitudeDeg * DEG_TO_RAD;
    const centerLonRad = center.longitudeDeg * DEG_TO_RAD;

    // Generate boundary vertices along bearings from 0 to 360 degrees
    for (let i = 0; i <= verticesCount; i++) {
      const bearingRad = (i * 2 * Math.PI) / verticesCount;

      const sinLat =
        Math.sin(centerLatRad) * Math.cos(centralAngleRad) +
        Math.cos(centerLatRad) * Math.sin(centralAngleRad) * Math.cos(bearingRad);

      const latRad = Math.asin(Math.max(-1, Math.min(1, sinLat)));

      const y = Math.sin(bearingRad) * Math.sin(centralAngleRad) * Math.cos(centerLatRad);
      const x = Math.cos(centralAngleRad) - Math.sin(centerLatRad) * Math.sin(latRad);
      const lonRad = centerLonRad + Math.atan2(y, x);

      let lonDeg = lonRad * RAD_TO_DEG;

      // Normalize longitude to [-180, 180]
      while (lonDeg > 180) lonDeg -= 360;
      while (lonDeg < -180) lonDeg += 360;

      polygonCoordinates.push({
        latitude: latRad * RAD_TO_DEG,
        longitude: lonDeg,
      });
    }

    return {
      center,
      surfaceRadiusKm,
      centralAngleDeg,
      minElevationDeg,
      polygonCoordinates,
    };
  }
}
