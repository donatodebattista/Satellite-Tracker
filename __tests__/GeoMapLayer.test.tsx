import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Marker, Polygon, Polyline } from 'react-native-maps';
import {
  ConstellationLayer,
  DEFAULT_OBSERVER_LOCATION,
  OrbitalElementSet,
  SatelliteMapView,
  SEED_ORBITAL_ELEMENTS,
} from '../src';

describe('Phase 5: Geo/Map Layer (RF-10, RF-11, RF-12, RF-13)', () => {
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

  describe('SatelliteMapView Component (RF-10, RF-11, RF-12)', () => {
    it('renders map with observer marker and selected satellite marker', () => {
      act(() => {
        tree = renderer.create(
          <SatelliteMapView
            selectedSatellite={issElement}
            observerLocation={DEFAULT_OBSERVER_LOCATION}
            minElevationDeg={10}
          />,
        );
      });

      const root = tree!.root;

      // MapView component exists
      const mapView = root.findByProps({ testID: 'satellite-map-view' });
      expect(mapView).toBeDefined();

      // Observer marker exists
      const observerMarker = root.findByProps({ testID: 'observer-marker' });
      expect(observerMarker).toBeDefined();

      // Satellite marker exists and has coordinates
      const satMarker = root.findByProps({ testID: 'satellite-marker' });
      expect(satMarker).toBeDefined();
      expect(satMarker.props.coordinate.latitude).toBeDefined();
      expect(satMarker.props.coordinate.longitude).toBeDefined();
    });

    it('renders ground track polylines and footprint polygon', () => {
      act(() => {
        tree = renderer.create(
          <SatelliteMapView
            selectedSatellite={issElement}
            observerLocation={DEFAULT_OBSERVER_LOCATION}
          />,
        );
      });

      const root = tree!.root;

      // Footprint polygon exists
      const polygons = root.findAllByType(Polygon);
      expect(polygons.length).toBeGreaterThan(0);
      expect(polygons[0].props.coordinates.length).toBeGreaterThan(10);

      // Ground track polylines exist
      const polylines = root.findAllByType(Polyline);
      expect(polylines.length).toBeGreaterThan(0);
    });
  });

  describe('ConstellationLayer Component (RF-13)', () => {
    it('renders multiple satellite markers when visible', () => {
      const satellites = [issElement, starlinkElement, SEED_ORBITAL_ELEMENTS[2]];

      act(() => {
        tree = renderer.create(
          <ConstellationLayer
            satellites={satellites}
            visible={true}
            maxCount={10}
          />,
        );
      });

      const root = tree!.root;
      const markers = root.findAllByType(Marker);
      expect(markers.length).toBe(3);
    });

    it('renders nothing when visible is false', () => {
      const satellites = [issElement, starlinkElement];

      act(() => {
        tree = renderer.create(
          <ConstellationLayer
            satellites={satellites}
            visible={false}
          />,
        );
      });

      expect(tree!.toJSON()).toBeNull();
    });

    it('triggers onSelectSatellite callback when a marker is pressed', () => {
      const onSelect = jest.fn();

      act(() => {
        tree = renderer.create(
          <ConstellationLayer
            satellites={[starlinkElement]}
            visible={true}
            onSelectSatellite={onSelect}
          />,
        );
      });

      const root = tree!.root;
      const markers = root.findAllByType(Marker);
      expect(markers.length).toBe(1);

      act(() => {
        markers[0].props.onPress();
      });

      expect(onSelect).toHaveBeenCalledWith(starlinkElement);
    });
  });
});
