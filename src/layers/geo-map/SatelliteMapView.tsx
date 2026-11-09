import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import {
  DEFAULT_MIN_ELEVATION_DEG,
  DEFAULT_OBSERVER_LOCATION,
  FootprintGeometry,
  GroundTrackSegment,
  ObserverLocation,
  OrbitalElementSet,
  PropagatedSatelliteState,
  REALTIME_REFRESH_INTERVAL_MS,
} from '../../shared';
import { FootprintCalc } from '../orbital-engine/FootprintCalc';
import { GroundTrackCalc } from '../orbital-engine/GroundTrackCalc';
import { Sgp4Propagator } from '../orbital-engine/Sgp4Propagator';
import { ConstellationLayer } from './ConstellationLayer';

export interface SatelliteMapViewProps {
  selectedSatellite: OrbitalElementSet | null;
  observerLocation?: ObserverLocation;
  constellationSatellites?: OrbitalElementSet[];
  minElevationDeg?: number;
  refreshIntervalMs?: number;
  onSelectSatellite?: (satellite: OrbitalElementSet) => void;
  style?: object;
}

/**
 * Interactive cartographic tracking layer for satellites and constellations (RF-10, RF-11, RF-12, RF-13).
 */
export const SatelliteMapView: React.FC<SatelliteMapViewProps> = ({
  selectedSatellite,
  observerLocation = DEFAULT_OBSERVER_LOCATION,
  constellationSatellites = [],
  minElevationDeg = DEFAULT_MIN_ELEVATION_DEG,
  refreshIntervalMs = REALTIME_REFRESH_INTERVAL_MS,
  onSelectSatellite,
  style,
}) => {
  const mapRef = useRef<MapView>(null);

  // Layer display toggles
  const [showGroundTrack, setShowGroundTrack] = useState(true);
  const [showFootprint, setShowFootprint] = useState(true);
  const [showConstellation, setShowConstellation] = useState(true);

  // Propagator instance for the selected satellite
  const propagator = useMemo(() => {
    if (!selectedSatellite) return null;
    try {
      return new Sgp4Propagator(selectedSatellite);
    } catch {
      return null;
    }
  }, [selectedSatellite]);

  // Real-time calculated state
  const [satelliteState, setSatelliteState] = useState<PropagatedSatelliteState | null>(
    null,
  );
  const [groundTrackSegments, setGroundTrackSegments] = useState<GroundTrackSegment[]>(
    [],
  );
  const [footprint, setFootprint] = useState<FootprintGeometry | null>(null);

  // Local calculation loop (RF-10)
  useEffect(() => {
    if (!propagator) {
      setSatelliteState(null);
      setGroundTrackSegments([]);
      setFootprint(null);
      return;
    }

    const computeRealtime = () => {
      const now = Date.now();
      const state = propagator.propagateAt(now, observerLocation);
      if (state) {
        setSatelliteState(state);

        // Compute footprint polygon (RF-12)
        if (showFootprint) {
          const fp = FootprintCalc.computeFootprint(state.subsatellitePoint, {
            minElevationDeg,
          });
          setFootprint(fp);
        }
      }
    };

    // Initial calculation
    computeRealtime();

    // Compute ground track on satellite change or periodically
    if (showGroundTrack) {
      const segments = GroundTrackCalc.computeSegments(propagator, Date.now(), {
        stepSeconds: 45,
        orbitsPast: 1,
        orbitsFuture: 1,
      });
      setGroundTrackSegments(segments);
    }

    const timer = setInterval(computeRealtime, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [
    propagator,
    observerLocation,
    showFootprint,
    showGroundTrack,
    minElevationDeg,
    refreshIntervalMs,
  ]);

  const centerOnSatellite = () => {
    if (!satelliteState || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: satelliteState.subsatellitePoint.latitudeDeg,
        longitude: satelliteState.subsatellitePoint.longitudeDeg,
        latitudeDelta: 40,
        longitudeDelta: 40,
      },
      800,
    );
  };

  const centerOnObserver = () => {
    if (!mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: observerLocation.latitudeDeg,
        longitude: observerLocation.longitudeDeg,
        latitudeDelta: 30,
        longitudeDelta: 30,
      },
      800,
    );
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        testID="satellite-map-view"
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: observerLocation.latitudeDeg,
          longitude: observerLocation.longitudeDeg,
          latitudeDelta: 70,
          longitudeDelta: 70,
        }}
      >
        {/* RF-12: Coverage Footprint Polygon */}
        {showFootprint && footprint && footprint.polygonCoordinates.length > 2 && (
          <Polygon
            coordinates={footprint.polygonCoordinates}
            strokeColor="rgba(0, 229, 255, 0.9)"
            fillColor="rgba(0, 229, 255, 0.15)"
            strokeWidth={1.5}
          />
        )}

        {/* RF-11: Ground Track Segments with Antimeridian Split */}
        {showGroundTrack &&
          groundTrackSegments.map(seg => (
            <Polyline
              key={seg.id}
              coordinates={seg.coordinates}
              strokeColor={seg.isFuture ? '#ffeb3b' : 'rgba(77, 208, 225, 0.7)'}
              strokeWidth={seg.isFuture ? 2.5 : 1.8}
              lineDashPattern={seg.isFuture ? undefined : [6, 4]}
            />
          ))}

        {/* RF-13: Dense Constellation Layer */}
        <ConstellationLayer
          satellites={constellationSatellites}
          visible={showConstellation}
          selectedNoradId={selectedSatellite?.noradId}
          onSelectSatellite={onSelectSatellite}
        />

        {/* Observer Ground Station Marker */}
        <Marker
          testID="observer-marker"
          coordinate={{
            latitude: observerLocation.latitudeDeg,
            longitude: observerLocation.longitudeDeg,
          }}
          title={observerLocation.label ?? 'Estación de Observación'}
          description={`Lat: ${observerLocation.latitudeDeg.toFixed(
            3,
          )}° | Lon: ${observerLocation.longitudeDeg.toFixed(3)}°`}
        >
          <View style={styles.observerMarker}>
            <Text style={styles.observerIcon}>⌖</Text>
          </View>
        </Marker>

        {/* RF-10: Real-time Selected Satellite Marker */}
        {satelliteState && (
          <Marker
            testID="satellite-marker"
            coordinate={{
              latitude: satelliteState.subsatellitePoint.latitudeDeg,
              longitude: satelliteState.subsatellitePoint.longitudeDeg,
            }}
            title={satelliteState.name}
            description={`Alt: ${Math.round(
              satelliteState.subsatellitePoint.altitudeKm,
            )} km | Vel: ${satelliteState.velocityKmPerSec.toFixed(2)} km/s`}
          >
            <View style={styles.satelliteMarker}>
              <Text style={styles.satelliteIcon}>🛰</Text>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Floating Telemetry HUD */}
      {satelliteState && (
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryHeader}>
            <Text style={styles.satelliteTitle}>{satelliteState.name}</Text>
            <View
              style={[
                styles.visibilityBadge,
                satelliteState.lookAngles?.isVisible
                  ? styles.visibleBadge
                  : styles.hiddenBadge,
              ]}
            >
              <Text style={styles.badgeText}>
                {satelliteState.lookAngles?.isVisible ? 'VISIBLE (AOS)' : 'BAJO HORIZONTE'}
              </Text>
            </View>
          </View>

          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Text style={styles.itemLabel}>LATITUD</Text>
              <Text style={styles.itemValue}>
                {satelliteState.subsatellitePoint.latitudeDeg.toFixed(2)}°
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.itemLabel}>LONGITUD</Text>
              <Text style={styles.itemValue}>
                {satelliteState.subsatellitePoint.longitudeDeg.toFixed(2)}°
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.itemLabel}>ALTITUD</Text>
              <Text style={styles.itemValue}>
                {Math.round(satelliteState.subsatellitePoint.altitudeKm)} km
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.itemLabel}>VELOCIDAD</Text>
              <Text style={styles.itemValue}>
                {satelliteState.velocityKmPerSec.toFixed(2)} km/s
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.itemLabel}>AZIMUT</Text>
              <Text style={styles.itemValue}>
                {satelliteState.lookAngles?.azimuthDeg.toFixed(1) ?? '—'}°
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.itemLabel}>ELEVACIÓN</Text>
              <Text style={styles.itemValue}>
                {satelliteState.lookAngles?.elevationDeg.toFixed(1) ?? '—'}°
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Control Buttons Overlay */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.controlButton, showGroundTrack && styles.activeButton]}
          onPress={() => setShowGroundTrack(!showGroundTrack)}
        >
          <Text style={styles.controlText}>Órbita</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, showFootprint && styles.activeButton]}
          onPress={() => setShowFootprint(!showFootprint)}
        >
          <Text style={styles.controlText}>Footprint</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, showConstellation && styles.activeButton]}
          onPress={() => setShowConstellation(!showConstellation)}
        >
          <Text style={styles.controlText}>Starlink</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={centerOnSatellite}>
          <Text style={styles.actionText}>🛰 Centrar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={centerOnObserver}>
          <Text style={styles.actionText}>⌖ Usuario</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e1a',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  satelliteMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(26, 35, 126, 0.9)',
    borderColor: '#ffeb3b',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#ffeb3b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  satelliteIcon: {
    fontSize: 18,
  },
  observerMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e91e63',
    borderColor: '#ffffff',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  observerIcon: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  telemetryCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(10, 14, 26, 0.92)',
    borderRadius: 12,
    padding: 12,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  satelliteTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  visibilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  visibleBadge: {
    backgroundColor: '#2e7d32',
  },
  hiddenBadge: {
    backgroundColor: '#424242',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  telemetryItem: {
    width: '32%',
    marginBottom: 6,
  },
  itemLabel: {
    color: '#90a4ae',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  itemValue: {
    color: '#00e5ff',
    fontSize: 13,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 24,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controlButton: {
    backgroundColor: 'rgba(18, 25, 44, 0.88)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderColor: '#37474f',
    borderWidth: 1,
  },
  activeButton: {
    backgroundColor: '#00b0ff',
    borderColor: '#40c4ff',
  },
  controlText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#37474f',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
});
