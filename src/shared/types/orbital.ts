/**
 * Core domain models and interfaces for the Satellite Tracker architecture.
 * Covers RF-01 through RF-16 across all 8 architectural layers.
 */

export type CatalogCategory =
  | 'stations'
  | 'starlink-sup'
  | 'gps-ops'
  | 'weather'
  | 'active';

export type DataSourceId =
  | 'celestrak'
  | 'spacetrack'
  | 'n2yo'
  | 'wheretheiss'
  | 'local-seed';

export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';

export type DataFreshnessLevel = 'FRESH' | 'AGING' | 'STALE';

/**
 * CCSDS Orbit Mean-Elements Message (OMM) JSON representation
 * distributed by CelesTrak GP & SupGP and Space-Track.
 * Supports both 5-digit and 6-digit NORAD catalog numbers.
 */
export interface OmmRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE?: 0;
  CLASSIFICATION_TYPE?: 'U' | 'C';
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH?: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
  [key: string]: unknown;
}

/**
 * Classic 2-Line / 3-Line Element Set (TLE).
 */
export interface TleRecord {
  name: string;
  line1: string;
  line2: string;
}

/**
 * Normalized orbital element record used across the Data Provider Layer,
 * Cache Manager, and Orbital Engine.
 */
export interface OrbitalElementSet {
  noradId: number;
  name: string;
  objectId: string;
  epochIso: string;
  epochTimestampMs: number;
  category: CatalogCategory;
  source: DataSourceId;
  fetchedAtMs: number;
  omm?: OmmRecord;
  tle?: TleRecord;
}

/**
 * Freshness & TTL metadata for RF-09 and RF-16.
 */
export interface DataFreshnessMetadata {
  epochIso: string;
  epochAgeHours: number;
  cacheAgeHours: number;
  ttlHours: number;
  isCacheExpired: boolean;
  level: DataFreshnessLevel;
  source: DataSourceId;
  warningMessage?: string;
}

/**
 * Geodetic subsatellite or observer coordinate on WGS84.
 */
export interface GeodeticCoordinate {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
}

/**
 * 3D Cartesian vector in Earth-Centered Inertial (ECI) frame.
 */
export interface EciVectorKm {
  x: number;
  y: number;
  z: number;
}

/**
 * Observer position on Earth (RF-03).
 */
export interface ObserverLocation {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeMeters: number;
  label?: string;
  isManual?: boolean;
}

/**
 * Topocentric look angles from the observer to the satellite (RF-03).
 */
export interface LookAngles {
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
  rangeRateKmPerSec?: number;
  isVisible: boolean;
}

/**
 * Complete real-time propagated state of a satellite (RF-02, RF-03, RF-10).
 */
export interface PropagatedSatelliteState {
  noradId: number;
  name: string;
  timestampMs: number;
  subsatellitePoint: GeodeticCoordinate;
  velocityKmPerSec: number;
  eciPositionKm: EciVectorKm;
  eciVelocityKmPerSec: EciVectorKm;
  orbitalPeriodMinutes: number;
  orbitRegime: OrbitRegime;
  lookAngles?: LookAngles;
  footprintRadiusKm: number;
}

/**
 * Sampled point along the satellite ground track (RF-11).
 */
export interface GroundTrackPoint extends GeodeticCoordinate {
  timestampMs: number;
  isFuture: boolean;
}

/**
 * Continuous polyline segment on the map, split at the antimeridian (+/- 180 deg) (RF-11).
 */
export interface GroundTrackSegment {
  id: string;
  isFuture: boolean;
  coordinates: Array<{
    latitude: number;
    longitude: number;
  }>;
}

/**
 * Geometric coverage footprint on the Earth's surface (RF-12).
 */
export interface FootprintGeometry {
  center: GeodeticCoordinate;
  surfaceRadiusKm: number;
  centralAngleDeg: number;
  minElevationDeg: number;
  polygonCoordinates: Array<{
    latitude: number;
    longitude: number;
  }>;
}

/**
 * Polar coordinate sample for the Sky Chart trajectory (RF-05).
 */
export interface SkyTrajectoryPoint {
  timestampMs: number;
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
}

/**
 * Predicted visibility window (AOS -> TCA/MaxEl -> LOS) (RF-04, RF-05, RF-06).
 */
export interface SatellitePassWindow {
  id: string;
  noradId: number;
  satelliteName: string;
  aosTimeMs: number;
  aosAzimuthDeg: number;
  tcaTimeMs: number;
  maxElevationDeg: number;
  tcaAzimuthDeg: number;
  losTimeMs: number;
  losAzimuthDeg: number;
  durationSeconds: number;
  minElevationThresholdDeg: number;
  trajectory: SkyTrajectoryPoint[];
}

/**
 * Device orientation angles from magnetometer + accelerometer/gyroscope (RF-07).
 */
export interface DeviceOrientationState {
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  timestampMs: number;
}

/**
 * Guidance deltas for the Assisted Compass Mode (RF-07).
 */
export interface CompassGuidanceVector {
  targetAzimuthDeg: number;
  targetElevationDeg: number;
  currentHeadingDeg: number;
  currentPitchDeg: number;
  deltaAzimuthDeg: number;
  deltaElevationDeg: number;
  angularSeparationDeg: number;
  isAligned: boolean;
}

/**
 * Independent reference sample from N2YO or Where the ISS at? (RF-15).
 */
export interface ExternalValidationSample {
  provider: 'n2yo' | 'wheretheiss';
  noradId: number;
  satelliteName: string;
  timestampMs: number;
  position: GeodeticCoordinate;
  lookAngles?: LookAngles;
  velocityKmPerSec?: number;
}

/**
 * Cross-validation accuracy report comparing local SGP4 against external APIs (RF-15).
 */
export interface ValidationComparisonResult {
  noradId: number;
  satelliteName: string;
  provider: 'n2yo' | 'wheretheiss';
  timestampMs: number;
  localPosition: GeodeticCoordinate;
  referencePosition: GeodeticCoordinate;
  surfaceErrorKm: number;
  altitudeErrorKm: number;
  euclidean3dErrorKm: number;
  azimuthErrorDeg?: number;
  elevationErrorDeg?: number;
  orbitalDataAgeHours: number;
  withinNominalTolerance: boolean;
}
