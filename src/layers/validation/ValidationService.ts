import {
  DEG_TO_RAD,
  EARTH_EQUATORIAL_RADIUS_KM,
  EARTH_RADIUS_KM,
  ExternalValidationSample,
  GeodeticCoordinate,
  ObserverLocation,
  OrbitalElementSet,
  RAD_TO_DEG,
  ValidationComparisonResult,
} from '../../shared';
import { Sgp4Propagator } from '../orbital-engine/Sgp4Propagator';

/**
 * Cross-validation service comparing local SGP4 propagation against independent external sources (RF-15).
 * Validates positions against N2YO and "Where the ISS at?" in km and degrees.
 */
export class ValidationService {
  /**
   * Calculates surface distance in km between two geodetic coordinates using the Haversine formula.
   */
  public static calculateHaversineDistanceKm(
    lat1Deg: number,
    lon1Deg: number,
    lat2Deg: number,
    lon2Deg: number,
  ): number {
    const lat1Rad = lat1Deg * DEG_TO_RAD;
    const lat2Rad = lat2Deg * DEG_TO_RAD;
    const deltaLatRad = (lat2Deg - lat1Deg) * DEG_TO_RAD;
    const deltaLonRad = (lon2Deg - lon1Deg) * DEG_TO_RAD;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLonRad / 2) *
        Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  /**
   * Converts WGS84 Geodetic coordinate (lat, lon, alt) to 3D Earth-Centered Earth-Fixed (ECEF) coordinates in km.
   */
  public static geodeticToCartesianEcefKm(coord: GeodeticCoordinate): {
    x: number;
    y: number;
    z: number;
  } {
    const a = EARTH_EQUATORIAL_RADIUS_KM; // 6378.137 km
    const e2 = 0.00669437999014; // WGS84 first eccentricity squared

    const latRad = coord.latitudeDeg * DEG_TO_RAD;
    const lonRad = coord.longitudeDeg * DEG_TO_RAD;
    const h = coord.altitudeKm;

    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);

    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);

    return {
      x: (N + h) * cosLat * cosLon,
      y: (N + h) * cosLat * sinLon,
      z: (N * (1 - e2) + h) * sinLat,
    };
  }

  /**
   * Calculates total 3D Euclidean distance in km between two geodetic positions.
   */
  public static calculate3dDistanceKm(
    coord1: GeodeticCoordinate,
    coord2: GeodeticCoordinate,
  ): number {
    const p1 = ValidationService.geodeticToCartesianEcefKm(coord1);
    const p2 = ValidationService.geodeticToCartesianEcefKm(coord2);

    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Performs cross-validation comparison between local SGP4 and an external sample (RF-15).
   */
  public static compare(
    element: OrbitalElementSet,
    sample: ExternalValidationSample,
    observer?: ObserverLocation,
    nominalToleranceKm = 10.0,
  ): ValidationComparisonResult {
    const propagator = new Sgp4Propagator(element);
    const localState = propagator.propagateAt(sample.timestampMs, observer);

    if (!localState) {
      throw new Error(
        `Failed to propagate SGP4 state for satellite ${element.noradId} at timestamp ${sample.timestampMs}`,
      );
    }

    const localPos = localState.subsatellitePoint;
    const refPos = sample.position;

    // 1. Surface error via Haversine (km)
    const surfaceErrorKm = ValidationService.calculateHaversineDistanceKm(
      localPos.latitudeDeg,
      localPos.longitudeDeg,
      refPos.latitudeDeg,
      refPos.longitudeDeg,
    );

    // 2. Altitude error (km)
    const altitudeErrorKm = Math.abs(localPos.altitudeKm - refPos.altitudeKm);

    // 3. Total 3D Cartesian error (km)
    const euclidean3dErrorKm = ValidationService.calculate3dDistanceKm(
      localPos,
      refPos,
    );

    // 4. Look angles errors if available
    let azimuthErrorDeg: number | undefined;
    let elevationErrorDeg: number | undefined;

    if (localState.lookAngles && sample.lookAngles) {
      const azDiff = Math.abs(
        localState.lookAngles.azimuthDeg - sample.lookAngles.azimuthDeg,
      );
      azimuthErrorDeg = azDiff > 180 ? 360 - azDiff : azDiff;
      elevationErrorDeg = Math.abs(
        localState.lookAngles.elevationDeg - sample.lookAngles.elevationDeg,
      );
    }

    const orbitalDataAgeHours = Math.max(
      0,
      (sample.timestampMs - element.epochTimestampMs) / 3_600_000,
    );

    const withinNominalTolerance = surfaceErrorKm <= nominalToleranceKm;

    return {
      noradId: element.noradId,
      satelliteName: element.name,
      provider: sample.provider,
      timestampMs: sample.timestampMs,
      localPosition: localPos,
      referencePosition: refPos,
      surfaceErrorKm,
      altitudeErrorKm,
      euclidean3dErrorKm,
      azimuthErrorDeg,
      elevationErrorDeg,
      orbitalDataAgeHours,
      withinNominalTolerance,
    };
  }

  /**
   * Generates a formatted text summary of the validation result.
   */
  public static formatReport(result: ValidationComparisonResult): string {
    return [
      `Validación SGP4 vs ${result.provider.toUpperCase()} — ${result.satelliteName} (NORAD ${result.noradId})`,
      `  • Error Superficial (Haversine): ${result.surfaceErrorKm.toFixed(3)} km`,
      `  • Error de Altitud (Δh):         ${result.altitudeErrorKm.toFixed(3)} km`,
      `  • Error Euclidiano 3D:           ${result.euclidean3dErrorKm.toFixed(3)} km`,
      result.azimuthErrorDeg !== undefined
        ? `  • Error de Azimut:               ${result.azimuthErrorDeg.toFixed(2)}°`
        : '',
      result.elevationErrorDeg !== undefined
        ? `  • Error de Elevación:            ${result.elevationErrorDeg.toFixed(2)}°`
        : '',
      `  • Antigüedad del Elemento:       ${result.orbitalDataAgeHours.toFixed(1)} h`,
      `  • Estado de Tolerancia (< 10 km): ${result.withinNominalTolerance ? 'NOMINAL (OK)' : 'DESVÍO DETECTADO'}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
