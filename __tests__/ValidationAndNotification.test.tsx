import {
  BackgroundSyncTask,
  ExternalValidationSample,
  GeodeticCoordinate,
  OrbitalElementSet,
  PassNotificationService,
  SatellitePassWindow,
  SEED_ORBITAL_ELEMENTS,
  ValidationService,
} from '../src';

describe('Phase 7: Validation Layer & Notifications (RF-06, RF-09, RF-15)', () => {
  const issElement: OrbitalElementSet = SEED_ORBITAL_ELEMENTS[0];

  describe('ValidationService (RF-15)', () => {
    it('computes spherical Haversine distances accurately', () => {
      // Identical coordinates
      const zeroDist = ValidationService.calculateHaversineDistanceKm(
        -32.4833,
        -58.2333,
        -32.4833,
        -58.2333,
      );
      expect(zeroDist).toBeCloseTo(0, 3);

      // Distance between Buenos Aires and Concepción del Uruguay (~236 km)
      const dist = ValidationService.calculateHaversineDistanceKm(
        -34.6037,
        -58.3816,
        -32.4833,
        -58.2333,
      );
      expect(dist).toBeGreaterThan(230);
      expect(dist).toBeLessThan(245);
    });

    it('converts WGS84 geodetic coordinates to 3D Cartesian ECEF vectors', () => {
      // Equator prime meridian (0, 0, 0 km alt) -> x = a (6378.137 km)
      const equatorPoint: GeodeticCoordinate = {
        latitudeDeg: 0,
        longitudeDeg: 0,
        altitudeKm: 0,
      };
      const pEquator = ValidationService.geodeticToCartesianEcefKm(equatorPoint);
      expect(pEquator.x).toBeCloseTo(6378.137, 2);
      expect(pEquator.y).toBeCloseTo(0, 2);
      expect(pEquator.z).toBeCloseTo(0, 2);

      // North Pole (90, 0, 0 km alt) -> z = b (approx 6356.75 km)
      const northPole: GeodeticCoordinate = {
        latitudeDeg: 90,
        longitudeDeg: 0,
        altitudeKm: 0,
      };
      const pPole = ValidationService.geodeticToCartesianEcefKm(northPole);
      expect(pPole.x).toBeCloseTo(0, 2);
      expect(pPole.y).toBeCloseTo(0, 2);
      expect(pPole.z).toBeGreaterThan(6356);
      expect(pPole.z).toBeLessThan(6357);
    });

    it('performs cross-validation comparison against reference sample', () => {
      // Mock reference sample matching expected ISS location closely
      const sample: ExternalValidationSample = {
        provider: 'wheretheiss',
        noradId: 25544,
        satelliteName: 'ISS (ZARYA)',
        timestampMs: issElement.epochTimestampMs,
        position: {
          latitudeDeg: 51.64,
          longitudeDeg: 124.51,
          altitudeKm: 420.0,
        },
        velocityKmPerSec: 7.66,
      };

      const result = ValidationService.compare(issElement, sample, undefined, 20.0);
      expect(result).toBeDefined();
      expect(result.noradId).toBe(25544);
      expect(result.provider).toBe('wheretheiss');
      expect(typeof result.surfaceErrorKm).toBe('number');
      expect(typeof result.altitudeErrorKm).toBe('number');
      expect(typeof result.euclidean3dErrorKm).toBe('number');
      expect(result.orbitalDataAgeHours).toBeCloseTo(0, 1);

      const report = ValidationService.formatReport(result);
      expect(report).toContain('Validación SGP4 vs WHERETHEISS');
      expect(report).toContain('Error Superficial');
    });
  });

  describe('PassNotificationService (RF-06)', () => {
    const mockPass: SatellitePassWindow = {
      id: 'pass_test_1',
      noradId: 25544,
      satelliteName: 'ISS (ZARYA)',
      aosTimeMs: Date.now() + 1800000, // in 30 minutes
      aosAzimuthDeg: 180,
      tcaTimeMs: Date.now() + 2100000,
      maxElevationDeg: 75,
      tcaAzimuthDeg: 120,
      losTimeMs: Date.now() + 2400000,
      losAzimuthDeg: 60,
      durationSeconds: 600,
      minElevationThresholdDeg: 10,
      trajectory: [],
    };

    it('initializes notification channel', async () => {
      const channelId = await PassNotificationService.initChannel();
      expect(channelId).toBe('satellite-passes');
    });

    it('schedules a trigger notification 10 minutes prior to AOS', async () => {
      const notifId = await PassNotificationService.schedulePassNotification(
        mockPass,
        10,
      );
      expect(notifId).toContain('pass_alert_25544');
    });

    it('cancels scheduled notifications cleanly', async () => {
      await expect(
        PassNotificationService.cancelNotification('pass_alert_25544_123'),
      ).resolves.not.toThrow();

      await expect(
        PassNotificationService.cancelAllNotifications(),
      ).resolves.not.toThrow();
    });
  });

  describe('BackgroundSyncTask (RF-09)', () => {
    it('initializes background sync periodic task', async () => {
      await expect(BackgroundSyncTask.init()).resolves.not.toThrow();
      const status = await BackgroundSyncTask.getStatus();
      expect(typeof status).toBe('number');
    });
  });
});
