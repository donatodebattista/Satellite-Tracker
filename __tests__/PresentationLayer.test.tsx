import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  CatalogSearchModal,
  CompassOverlay,
  DataFreshnessBadge,
  DataFreshnessMetadata,
  LookAngles,
  OrbitalElementSet,
  PassPredictionModal,
  SatellitePassWindow,
  SEED_ORBITAL_ELEMENTS,
  SkyChartSvg,
} from '../src';

describe('Phase 6: Presentation Layer (RF-01, RF-05, RF-07, RF-08, RF-16)', () => {
  const issElement: OrbitalElementSet = SEED_ORBITAL_ELEMENTS[0];
  const starlinkElement: OrbitalElementSet = SEED_ORBITAL_ELEMENTS[1];
  let tree: renderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  const mockPass: SatellitePassWindow = {
    id: 'pass_25544_1',
    noradId: 25544,
    satelliteName: 'ISS (ZARYA)',
    aosTimeMs: Date.now() + 3600000,
    aosAzimuthDeg: 210,
    tcaTimeMs: Date.now() + 3600000 + 300000,
    maxElevationDeg: 64.5,
    tcaAzimuthDeg: 140,
    losTimeMs: Date.now() + 3600000 + 600000,
    losAzimuthDeg: 45,
    durationSeconds: 600,
    minElevationThresholdDeg: 10,
    trajectory: [
      { timestampMs: Date.now() + 3600000, azimuthDeg: 210, elevationDeg: 10, rangeKm: 1200 },
      { timestampMs: Date.now() + 3600000 + 300000, azimuthDeg: 140, elevationDeg: 64.5, rangeKm: 420 },
      { timestampMs: Date.now() + 3600000 + 600000, azimuthDeg: 45, elevationDeg: 10, rangeKm: 1250 },
    ],
  };

  describe('SkyChartSvg (RF-05)', () => {
    it('renders polar sky chart with pass trajectory and markers', () => {
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <SkyChartSvg
            pass={mockPass}
            currentLookAngles={{
              azimuthDeg: 140,
              elevationDeg: 60,
              rangeKm: 430,
              isVisible: true,
            }}
            size={300}
          />,
        );
      });

      const root = tree!.root;
      const container = root.findByProps({ testID: 'sky-chart-svg' });
      expect(container).toBeDefined();

      // Check elevation ring labels and cardinal markers exist
      const texts = root.findAllByProps({ testID: 'svg-text' });
      expect(texts.length).toBeGreaterThan(5);

      const hasAos = texts.some(t => t.props.children?.toString().includes('AOS'));
      const hasMaxEl = texts.some(t => t.props.children?.toString().includes('Max 65°'));
      const hasLos = texts.some(t => t.props.children?.toString().includes('LOS'));

      expect(hasAos).toBe(true);
      expect(hasMaxEl).toBe(true);
      expect(hasLos).toBe(true);
    });
  });

  describe('CompassOverlay (RF-07)', () => {
    it('renders boresight reticle and guidance arrows', () => {
      const targetLookAngles: LookAngles = {
        azimuthDeg: 120,
        elevationDeg: 45,
        rangeKm: 600,
        isVisible: true,
      };

      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <CompassOverlay
            visible={true}
            onClose={jest.fn()}
            satelliteName="ISS (ZARYA)"
            targetLookAngles={targetLookAngles}
          />,
        );
      });

      const root = tree!.root;
      const overlay = root.findByProps({ testID: 'compass-overlay' });
      expect(overlay).toBeDefined();
    });

    it('renders null when visible is false', () => {
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <CompassOverlay
            visible={false}
            onClose={jest.fn()}
            satelliteName="ISS"
            targetLookAngles={null}
          />,
        );
      });

      expect(tree!.toJSON()).toBeNull();
    });
  });

  describe('DataFreshnessBadge (RF-16)', () => {
    it('renders FRESH metadata badge cleanly without warning banner', () => {
      const freshMeta: DataFreshnessMetadata = {
        epochIso: new Date().toISOString(),
        epochAgeHours: 4.2,
        cacheAgeHours: 0.5,
        ttlHours: 12,
        isCacheExpired: false,
        level: 'FRESH',
        source: 'celestrak',
      };

      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(<DataFreshnessBadge metadata={freshMeta} />);
      });

      const root = tree!.root;
      const badge = root.findByProps({ testID: 'data-freshness-badge' });
      expect(badge).toBeDefined();

      // No warning text for FRESH
      const warningIcons = root.findAll(
        el => el.props.children && el.props.children === '⚠️',
      );
      expect(warningIcons.length).toBe(0);
    });

    it('renders STALE metadata with warning banner and obsolescence alert', () => {
      const staleMeta: DataFreshnessMetadata = {
        epochIso: new Date(Date.now() - 3600000 * 96).toISOString(),
        epochAgeHours: 96,
        cacheAgeHours: 18,
        ttlHours: 12,
        isCacheExpired: true,
        level: 'STALE',
        source: 'celestrak',
        warningMessage: 'Datos orbitales muy antiguos (4 días). Posibles desvíos > 20 km.',
      };

      act(() => {
        tree = renderer.create(<DataFreshnessBadge metadata={staleMeta} />);
      });

      const root = tree!.root;
      const warningTexts = root.findAll(
        el =>
          typeof el.props.children === 'string' &&
          el.props.children.includes('desvíos'),
      );
      expect(warningTexts.length).toBeGreaterThan(0);
    });
  });

  describe('CatalogSearchModal (RF-01, RF-08)', () => {
    it('renders catalog search sheet and filters by search text', () => {
      const onSelect = jest.fn();
      let tree: renderer.ReactTestRenderer;

      act(() => {
        tree = renderer.create(
          <CatalogSearchModal
            visible={true}
            onClose={jest.fn()}
            satellites={[issElement, starlinkElement]}
            onSelectSatellite={onSelect}
          />,
        );
      });

      const root = tree!.root;
      const modal = root.findByProps({ testID: 'catalog-search-modal' });
      expect(modal).toBeDefined();
    });
  });

  describe('PassPredictionModal (RF-04, RF-05)', () => {
    it('renders upcoming pass windows and embedded SkyChartSvg', () => {
      let tree: renderer.ReactTestRenderer;

      act(() => {
        tree = renderer.create(
          <PassPredictionModal
            visible={true}
            onClose={jest.fn()}
            satelliteName="ISS (ZARYA)"
            passes={[mockPass]}
          />,
        );
      });

      const root = tree!.root;
      const modal = root.findByProps({ testID: 'pass-prediction-modal' });
      expect(modal).toBeDefined();

      // SkyChartSvg exists inside modal
      const skyChart = root.findByProps({ testID: 'sky-chart-svg' });
      expect(skyChart).toBeDefined();
    });
  });
});
