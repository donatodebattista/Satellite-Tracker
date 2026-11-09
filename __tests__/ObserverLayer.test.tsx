import {
  DEFAULT_OBSERVER_LOCATION,
  LocationService,
  LookAngles,
  ObserverLocation,
  OrientationService,
} from '../src';

describe('Phase 4: Observer Layer & Assisted Orientation (RF-03, RF-07)', () => {
  afterEach(() => {
    LocationService.clearManualLocation();
  });

  describe('LocationService (RF-03)', () => {
    it('returns GPS observer location when active', async () => {
      const loc = await LocationService.getCurrentLocation();
      expect(loc).toBeDefined();
      expect(loc.latitudeDeg).toBeCloseTo(-32.4833, 2);
      expect(loc.longitudeDeg).toBeCloseTo(-58.2333, 2);
      expect(loc.isManual).toBe(false);
    });

    it('supports setting and clearing manual location override', async () => {
      const customStation: ObserverLocation = {
        latitudeDeg: -34.6037,
        longitudeDeg: -58.3816,
        altitudeMeters: 50,
        label: 'Buenos Aires Earth Station',
      };

      LocationService.setManualLocation(customStation);
      expect(LocationService.getManualLocation()?.isManual).toBe(true);

      const loc = await LocationService.getCurrentLocation();
      expect(loc.latitudeDeg).toBe(-34.6037);
      expect(loc.longitudeDeg).toBe(-58.3816);
      expect(loc.isManual).toBe(true);

      LocationService.clearManualLocation();
      expect(LocationService.getManualLocation()).toBeNull();

      const restoredLoc = await LocationService.getCurrentLocation();
      expect(restoredLoc.isManual).toBe(false);
    });

    it('subscribes to location watch and unregisters cleanly', done => {
      let unsubscribe: (() => void) | undefined;
      unsubscribe = LocationService.watchLocation(loc => {
        expect(loc).toBeDefined();
        expect(loc.latitudeDeg).toBeDefined();
        if (unsubscribe) {
          unsubscribe();
        } else {
          setTimeout(() => unsubscribe?.(), 0);
        }
        done();
      });
    });
  });

  describe('OrientationService (RF-07)', () => {
    it('normalizes angle differences correctly across 0/360 boundary', () => {
      // Small turn to the right: 350 deg to 10 deg -> +20 deg
      expect(OrientationService.normalizeAngleDiff(10 - 350)).toBeCloseTo(20, 2);

      // Small turn to the left: 10 deg to 350 deg -> -20 deg
      expect(OrientationService.normalizeAngleDiff(350 - 10)).toBeCloseTo(-20, 2);

      // Half circle: 0 deg to 180 deg -> 180 deg
      expect(OrientationService.normalizeAngleDiff(180)).toBeCloseTo(180, 2);
    });

    it('filters angles with exponential moving average without wrap-around jitter', () => {
      // Moving from 359 to 1 deg with alpha 0.5 should land on 0 deg (North), not 180 deg
      const filtered = OrientationService.filterAngle(359, 1, 0.5);
      expect(filtered).toBeCloseTo(0, 1);
    });

    it('computes 3D angular separation on celestial sphere accurately', () => {
      // Identical directions
      const zeroSep = OrientationService.computeAngularSeparation(45, 30, 45, 30);
      expect(zeroSep).toBeCloseTo(0, 2);

      // Orthogonal directions along azimuth
      const ninetyAz = OrientationService.computeAngularSeparation(0, 0, 90, 0);
      expect(ninetyAz).toBeCloseTo(90, 2);

      // Orthogonal directions along elevation
      const ninetyEl = OrientationService.computeAngularSeparation(0, 0, 0, 90);
      expect(ninetyEl).toBeCloseTo(90, 2);

      // Opposite directions
      const opposite = OrientationService.computeAngularSeparation(0, 0, 180, 0);
      expect(opposite).toBeCloseTo(180, 2);
    });

    it('calculates guidance vectors indicating turn and tilt directions', () => {
      const orientation = {
        headingDeg: 10,
        pitchDeg: 20,
        rollDeg: 0,
        timestampMs: Date.now(),
      };

      const targetSat: LookAngles = {
        azimuthDeg: 45,
        elevationDeg: 60,
        rangeKm: 850,
        isVisible: true,
      };

      const guidance = OrientationService.calculateGuidance(orientation, targetSat);

      // Turn right by 35 deg: 45 - 10 = +35
      expect(guidance.deltaAzimuthDeg).toBeCloseTo(35, 1);

      // Tilt up by 40 deg: 60 - 20 = +40
      expect(guidance.deltaElevationDeg).toBeCloseTo(40, 1);

      expect(guidance.isAligned).toBe(false);
      expect(guidance.angularSeparationDeg).toBeGreaterThan(40);
    });

    it('detects alignment when phone is pointed directly at satellite within tolerance', () => {
      const orientation = {
        headingDeg: 124.2,
        pitchDeg: 45.1,
        rollDeg: 0,
        timestampMs: Date.now(),
      };

      const targetSat: LookAngles = {
        azimuthDeg: 125.0,
        elevationDeg: 45.0,
        rangeKm: 600,
        isVisible: true,
      };

      const guidance = OrientationService.calculateGuidance(
        orientation,
        targetSat,
        3.0, // 3 deg tolerance
      );

      expect(guidance.angularSeparationDeg).toBeLessThan(1.5);
      expect(guidance.isAligned).toBe(true);
    });

    it('streams orientation updates and unregisters cleanly', done => {
      let unsubscribe: (() => void) | undefined;
      unsubscribe = OrientationService.startOrientationUpdates(state => {
        expect(state).toBeDefined();
        expect(typeof state.headingDeg).toBe('number');
        expect(typeof state.pitchDeg).toBe('number');
        if (unsubscribe) {
          unsubscribe();
        } else {
          setTimeout(() => unsubscribe?.(), 0);
        }
        done();
      });
    });
  });
});
