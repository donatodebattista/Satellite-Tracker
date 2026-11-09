import {
  degreesLat,
  degreesLong,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  radiansLat,
  radiansLong,
  twoline2satrec,
} from 'satellite.js';
import type { EciVec3, Kilometer, SatRec } from 'satellite.js';
import {
  DEG_TO_RAD,
  EARTH_RADIUS_KM,
  GeodeticCoordinate,
  LookAngles,
  ObserverLocation,
  OrbitalElementSet,
  OrbitRegime,
  PropagatedSatelliteState,
  RAD_TO_DEG,
} from '../../shared';

export class Sgp4Propagator {
  private satrec: SatRec;
  public readonly noradId: number;
  public readonly name: string;

  constructor(public readonly elementSet: OrbitalElementSet) {
    this.noradId = elementSet.noradId;
    this.name = elementSet.name;

    if (elementSet.omm) {
      this.satrec = json2satrec(elementSet.omm);
    } else if (elementSet.tle) {
      this.satrec = twoline2satrec(elementSet.tle.line1, elementSet.tle.line2);
    } else {
      throw new Error(
        `Cannot initialize SGP4 propagator: no OMM or TLE record found for sat ${elementSet.noradId}`,
      );
    }
  }

  /**
   * Directly get internal SatRec.
   */
  public getSatRec(): SatRec {
    return this.satrec;
  }

  /**
   * Calculates the orbital period in minutes.
   */
  public getOrbitalPeriodMinutes(): number {
    if (this.satrec.no && this.satrec.no > 0) {
      // satrec.no is in radians per minute
      return (2 * Math.PI) / this.satrec.no;
    }
    if (this.elementSet.omm?.MEAN_MOTION) {
      return 1440 / this.elementSet.omm.MEAN_MOTION;
    }
    return 95.0; // fallback standard LEO period
  }

  /**
   * Classifies the orbital regime based on altitude and eccentricity.
   */
  public classifyRegime(altitudeKm: number): OrbitRegime {
    const ecc = this.satrec.ecco ?? this.elementSet.omm?.ECCENTRICITY ?? 0;
    if (ecc > 0.25) return 'HEO';
    if (altitudeKm < 2000) return 'LEO';
    if (altitudeKm >= 2000 && altitudeKm < 35000) return 'MEO';
    return 'GEO';
  }

  /**
   * Calculates the geometric footprint coverage radius on the Earth surface in km (RF-12).
   */
  public static calculateFootprintRadiusKm(
    altitudeKm: number,
    minElevationDeg = 10,
  ): number {
    const minElRad = minElevationDeg * DEG_TO_RAD;
    const ratio = (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm)) * Math.cos(minElRad);
    const clampedRatio = Math.max(-1, Math.min(1, ratio));
    const centralAngleRad = Math.acos(clampedRatio) - minElRad;
    return Math.max(0, EARTH_RADIUS_KM * centralAngleRad);
  }

  /**
   * Propagates the satellite state to a specific Date or timestamp.
   */
  public propagateAt(
    targetDate: Date | number,
    observer?: ObserverLocation,
  ): PropagatedSatelliteState | null {
    const date = typeof targetDate === 'number' ? new Date(targetDate) : targetDate;
    const timestampMs = date.getTime();

    const pv = propagate(this.satrec, date);
    if (!pv || !pv.position || typeof pv.position !== 'object' || !pv.velocity) {
      return null;
    }

    const posEci = pv.position as EciVec3<Kilometer>;
    const velEci = pv.velocity as EciVec3<Kilometer>;

    // Velocity magnitude in km/s
    const velocityKmPerSec = Math.sqrt(
      velEci.x * velEci.x + velEci.y * velEci.y + velEci.z * velEci.z,
    );

    // Coordinate conversions
    const gmstTime = gstime(date);
    const geodetic = eciToGeodetic(posEci, gmstTime);

    const latitudeDeg = degreesLat(geodetic.latitude);
    const longitudeDeg = degreesLong(geodetic.longitude);
    const altitudeKm = geodetic.height;

    const subsatellitePoint: GeodeticCoordinate = {
      latitudeDeg,
      longitudeDeg,
      altitudeKm,
    };

    // Calculate Topocentric Look Angles if observer location is provided (RF-03)
    let lookAngles: LookAngles | undefined;
    if (observer) {
      lookAngles = this.calculateLookAnglesAt(posEci, gmstTime, observer);
    }

    const orbitalPeriodMinutes = this.getOrbitalPeriodMinutes();
    const orbitRegime = this.classifyRegime(altitudeKm);
    const footprintRadiusKm = Sgp4Propagator.calculateFootprintRadiusKm(altitudeKm);

    return {
      noradId: this.noradId,
      name: this.name,
      timestampMs,
      subsatellitePoint,
      velocityKmPerSec,
      eciPositionKm: { x: posEci.x, y: posEci.y, z: posEci.z },
      eciVelocityKmPerSec: { x: velEci.x, y: velEci.y, z: velEci.z },
      orbitalPeriodMinutes,
      orbitRegime,
      lookAngles,
      footprintRadiusKm,
    };
  }

  /**
   * Calculates topocentric look angles (azimuth, elevation, range) from an observer (RF-03).
   */
  public calculateLookAnglesAt(
    posEci: EciVec3<Kilometer>,
    gmstTime: number,
    observer: ObserverLocation,
  ): LookAngles {
    const observerGeodetic = {
      longitude: radiansLong(observer.longitudeDeg),
      latitude: radiansLat(observer.latitudeDeg),
      height: observer.altitudeMeters / 1000, // meters to km
    };

    const satelliteEcf = eciToEcf(posEci, gmstTime);
    const rawAngles = ecfToLookAngles(observerGeodetic, satelliteEcf);

    let azimuthDeg = rawAngles.azimuth * RAD_TO_DEG;
    if (azimuthDeg < 0) azimuthDeg += 360;
    if (azimuthDeg >= 360) azimuthDeg -= 360;

    const elevationDeg = rawAngles.elevation * RAD_TO_DEG;
    const rangeKm = rawAngles.rangeSat;

    return {
      azimuthDeg,
      elevationDeg,
      rangeKm,
      isVisible: elevationDeg > 0,
    };
  }
}
