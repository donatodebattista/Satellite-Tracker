import {
  ConstellationBatch,
  DEFAULT_OBSERVER_LOCATION,
  FootprintCalc,
  GroundTrackCalc,
  OrbitalElementSet,
  PassPredictor,
  SEED_ORBITAL_ELEMENTS,
  Sgp4Propagator,
} from '../src';

describe('Phase 3: Orbital Engine (SGP4), Ground Track & Prediction Service', () => {
  const issElement: OrbitalElementSet = SEED_ORBITAL_ELEMENTS[0]; // ISS (ZARYA) 25544
  const starlinkElement: OrbitalElementSet = SEED_ORBITAL_ELEMENTS[1]; // STARLINK-1008 44714

  describe('Sgp4Propagator (RF-02, RF-03)', () => {
    it('initializes propagator and computes orbital period and regime', () => {
      const propagator = new Sgp4Propagator(issElement);
      expect(propagator.noradId).toBe(25544);
      expect(propagator.name).toBe('ISS (ZARYA)');

      const period = propagator.getOrbitalPeriodMinutes();
      expect(period).toBeGreaterThan(90);
      expect(period).toBeLessThan(95);

      const regime = propagator.classifyRegime(420);
      expect(regime).toBe('LEO');
    });

    it('propagates state at epoch returning valid geodetics and velocity', () => {
      const propagator = new Sgp4Propagator(issElement);
      const targetDate = new Date(issElement.epochTimestampMs);

      const state = propagator.propagateAt(targetDate, DEFAULT_OBSERVER_LOCATION);
      expect(state).not.toBeNull();
      if (!state) return;

      expect(state.noradId).toBe(25544);
      expect(state.subsatellitePoint.latitudeDeg).toBeGreaterThanOrEqual(-90);
      expect(state.subsatellitePoint.latitudeDeg).toBeLessThanOrEqual(90);
      expect(state.subsatellitePoint.longitudeDeg).toBeGreaterThanOrEqual(-180);
      expect(state.subsatellitePoint.longitudeDeg).toBeLessThanOrEqual(180);

      // ISS typical altitude is between 400 and 435 km
      expect(state.subsatellitePoint.altitudeKm).toBeGreaterThan(380);
      expect(state.subsatellitePoint.altitudeKm).toBeLessThan(450);

      // ISS typical orbital speed is ~7.66 km/s
      expect(state.velocityKmPerSec).toBeGreaterThan(7.0);
      expect(state.velocityKmPerSec).toBeLessThan(8.0);

      // Look angles to observer
      expect(state.lookAngles).toBeDefined();
      expect(state.lookAngles!.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(state.lookAngles!.azimuthDeg).toBeLessThan(360);
      expect(state.lookAngles!.elevationDeg).toBeGreaterThanOrEqual(-90);
      expect(state.lookAngles!.elevationDeg).toBeLessThanOrEqual(90);
      expect(state.lookAngles!.rangeKm).toBeGreaterThan(300);
    });

    it('calculates coverage footprint radius according to RF-12 formula', () => {
      const radiusAt10Deg = Sgp4Propagator.calculateFootprintRadiusKm(420, 10);
      expect(radiusAt10Deg).toBeGreaterThan(1300);
      expect(radiusAt10Deg).toBeLessThan(1450);

      const radiusAt0Deg = Sgp4Propagator.calculateFootprintRadiusKm(420, 0);
      expect(radiusAt0Deg).toBeGreaterThan(2100);
      expect(radiusAt0Deg).toBeLessThan(2400);
    });
  });

  describe('GroundTrackCalc & Antimeridian Splitting (RF-11)', () => {
    it('computes continuous past and future ground track segments', () => {
      const propagator = new Sgp4Propagator(issElement);
      const segments = GroundTrackCalc.computeSegments(
        propagator,
        issElement.epochTimestampMs,
        { stepSeconds: 60, orbitsPast: 1, orbitsFuture: 1 },
      );

      expect(segments.length).toBeGreaterThan(1);

      // Verify at least one past and one future segment exist
      const hasPast = segments.some(s => !s.isFuture);
      const hasFuture = segments.some(s => s.isFuture);
      expect(hasPast).toBe(true);
      expect(hasFuture).toBe(true);

      // Verify that no individual segment has an antimeridian jump (> 180 deg longitude jump)
      for (const seg of segments) {
        expect(seg.coordinates.length).toBeGreaterThan(0);
        for (let i = 1; i < seg.coordinates.length; i++) {
          const lonDiff = Math.abs(
            seg.coordinates[i].longitude - seg.coordinates[i - 1].longitude,
          );
          expect(lonDiff).toBeLessThanOrEqual(180);
        }
      }
    });
  });

  describe('FootprintCalc (RF-12)', () => {
    it('generates closed boundary polygon coordinates', () => {
      const center = {
        latitudeDeg: -32.4833,
        longitudeDeg: -58.2333,
        altitudeKm: 420,
      };

      const footprint = FootprintCalc.computeFootprint(center, {
        minElevationDeg: 10,
        verticesCount: 36,
      });

      expect(footprint.surfaceRadiusKm).toBeGreaterThan(1300);
      expect(footprint.surfaceRadiusKm).toBeLessThan(1450);
      expect(footprint.polygonCoordinates.length).toBe(37); // 36 vertices + closing point

      // All points should lie within valid latitude and longitude ranges
      for (const pt of footprint.polygonCoordinates) {
        expect(pt.latitude).toBeGreaterThanOrEqual(-90);
        expect(pt.latitude).toBeLessThanOrEqual(90);
        expect(pt.longitude).toBeGreaterThanOrEqual(-180);
        expect(pt.longitude).toBeLessThanOrEqual(180);
      }
    });
  });

  describe('PassPredictor Coarse-Fine Algorithm (RF-04, RF-05)', () => {
    it('predicts visible passes with refined AOS, TCA, LOS and sky trajectory', () => {
      const propagator = new Sgp4Propagator(issElement);
      const baseDate = new Date(issElement.epochTimestampMs);

      // Search passes over 48 hours to guarantee multiple passes
      const passes = PassPredictor.findNextPasses(propagator, {
        startDate: baseDate,
        hoursAhead: 48,
        minElevationDeg: 10,
        coarseStepSeconds: 30,
        observer: DEFAULT_OBSERVER_LOCATION,
        maxPasses: 4,
      });

      expect(passes.length).toBeGreaterThan(0);

      const firstPass = passes[0];
      expect(firstPass.noradId).toBe(25544);
      expect(firstPass.aosTimeMs).toBeLessThan(firstPass.tcaTimeMs);
      expect(firstPass.tcaTimeMs).toBeLessThan(firstPass.losTimeMs);

      // Elevation properties
      expect(firstPass.maxElevationDeg).toBeGreaterThanOrEqual(10);
      expect(firstPass.durationSeconds).toBeGreaterThan(60); // Passes typically last 2 to 10 min
      expect(firstPass.durationSeconds).toBeLessThan(900);

      // Trajectory points for Sky Chart
      expect(firstPass.trajectory.length).toBeGreaterThan(5);
      const peakSample = firstPass.trajectory.find(
        p => Math.abs(p.elevationDeg - firstPass.maxElevationDeg) < 3,
      );
      expect(peakSample).toBeDefined();
    });

    it('runs asynchronous pass prediction without blocking', async () => {
      const propagator = new Sgp4Propagator(issElement);
      const passes = await PassPredictor.findNextPassesAsync(propagator, {
        startDate: new Date(issElement.epochTimestampMs),
        hoursAhead: 24,
        minElevationDeg: 15,
      });

      expect(Array.isArray(passes)).toBe(true);
    });
  });

  describe('ConstellationBatch (RF-13)', () => {
    it('propagates a batch of satellites synchronously and asynchronously', async () => {
      const batch = new ConstellationBatch();
      const elements = [issElement, starlinkElement, SEED_ORBITAL_ELEMENTS[2]];

      const positions = batch.propagateBatch(
        elements,
        new Date(issElement.epochTimestampMs),
        10,
      );
      expect(positions).toHaveLength(3);
      expect(positions[0].noradId).toBe(25544);
      expect(positions[1].noradId).toBe(44714);

      const asyncPositions = await batch.propagateBatchAsync(
        elements,
        new Date(issElement.epochTimestampMs),
        2,
        10,
      );
      expect(asyncPositions).toHaveLength(3);
    });
  });
});
