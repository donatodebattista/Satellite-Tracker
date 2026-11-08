import { json2satrec, twoline2satrec } from 'satellite.js';
import {
  CATALOG_CATEGORIES,
  DEFAULT_OBSERVER_LOCATION,
  EARTH_RADIUS_KM,
  ISS_NORAD_ID,
  OmmRecord,
  PROVIDER_RATE_LIMITS,
} from '../src/shared';

describe('Phase 1 Scaffolding & Domain Base Verification', () => {
  it('exposes astrophysical constants and provider rate limits matching PRD Section 4.2', () => {
    expect(EARTH_RADIUS_KM).toBeCloseTo(6371.0088, 3);
    expect(ISS_NORAD_ID).toBe(25544);
    expect(DEFAULT_OBSERVER_LOCATION.latitudeDeg).toBeCloseTo(-32.4833, 3);
    expect(PROVIDER_RATE_LIMITS.spacetrack.maxRequestsPerMinute).toBeLessThan(30);
    expect(PROVIDER_RATE_LIMITS.spacetrack.maxRequestsPerHour).toBeLessThan(300);
    expect(CATALOG_CATEGORIES['starlink-sup'].isSupplemental).toBe(true);
  });

  it('initializes satellite.js SatRec from both OMM JSON and classic TLE', () => {
    const sampleIssOmm: OmmRecord = {
      OBJECT_NAME: 'ISS (ZARYA)',
      OBJECT_ID: '1998-067A',
      EPOCH: '2026-11-08T12:00:00.000000',
      MEAN_MOTION: 15.49812531,
      ECCENTRICITY: 0.0005123,
      INCLINATION: 51.6412,
      RA_OF_ASC_NODE: 124.5123,
      ARG_OF_PERICENTER: 88.2341,
      MEAN_ANOMALY: 271.9124,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: 25544,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 48120,
      BSTAR: 0.0001245,
      MEAN_MOTION_DOT: 0.00006812,
      MEAN_MOTION_DDOT: 0,
    };

    const satrecFromOmm = json2satrec(sampleIssOmm);
    expect(satrecFromOmm).toBeDefined();
    expect(satrecFromOmm.satnum).toBe('25544');

    const line1 =
      '1 25544U 98067A   26312.50000000  .00006812  00000+0  12450-3 0  9992';
    const line2 =
      '2 25544  51.6412 124.5123 0005123  88.2341 271.9124 15.49812531481209';
    const satrecFromTle = twoline2satrec(line1, line2);
    expect(satrecFromTle).toBeDefined();
    expect(satrecFromTle.satnum).toBe('25544');
  });
});
