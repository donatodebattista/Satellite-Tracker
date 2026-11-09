import React, { useEffect, useMemo, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CatalogCategory,
  DataFreshnessMetadata,
  DataOrchestrator,
  DEFAULT_OBSERVER_LOCATION,
  LocationService,
  LookAngles,
  OrbitalElementSet,
  PassNotificationService,
  PassPredictor,
  SatellitePassWindow,
  SEED_ORBITAL_ELEMENTS,
  Sgp4Propagator,
} from './src';
import { SatelliteMapView } from './src/layers/geo-map/SatelliteMapView';
import { CatalogSearchModal } from './src/layers/presentation/components/CatalogSearchModal';
import { CompassOverlay } from './src/layers/presentation/components/CompassOverlay';
import { DataFreshnessBadge } from './src/layers/presentation/components/DataFreshnessBadge';
import { PassPredictionModal } from './src/layers/presentation/components/PassPredictionModal';

function App() {
  const orchestrator = useMemo(() => new DataOrchestrator(), []);

  // Selected satellite (defaults to ISS NORAD 25544)
  const [selectedSatellite, setSelectedSatellite] = useState<OrbitalElementSet>(
    SEED_ORBITAL_ELEMENTS[0],
  );

  // Active catalog and starlink constellation
  const [catalog, setCatalog] = useState<OrbitalElementSet[]>(SEED_ORBITAL_ELEMENTS);
  const [constellation, setConstellation] = useState<OrbitalElementSet[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CatalogCategory>('stations');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Observer coordinates
  const [observer, setObserver] = useState(DEFAULT_OBSERVER_LOCATION);

  // Dynamic telemetry and passes
  const [predictedPasses, setPredictedPasses] = useState<SatellitePassWindow[]>([]);
  const [currentLookAngles, setCurrentLookAngles] = useState<LookAngles | null>(null);
  const [freshness, setFreshness] = useState<DataFreshnessMetadata | null>(null);

  // Modal display states
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCompassOpen, setIsCompassOpen] = useState(false);
  const [isPassesOpen, setIsPassesOpen] = useState(false);

  // 1. Initialize location
  useEffect(() => {
    let isMounted = true;
    LocationService.getCurrentLocation().then(loc => {
      if (isMounted) setObserver(loc);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch catalog by category
  const loadCategory = async (cat: CatalogCategory, forceRefresh = false) => {
    setIsLoadingCatalog(true);
    try {
      const result = await orchestrator.getCatalog(cat, forceRefresh);
      setCatalog(result.elements);
      setSelectedCategory(cat);
    } catch {
      // Fallback already handled inside DataOrchestrator
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    loadCategory('stations');
    // Also load starlink constellation for map overlay
    orchestrator.getCatalog('starlink-sup').then(res => {
      if (isMounted) setConstellation(res.elements);
    });
    return () => {
      isMounted = false;
    };
  }, [orchestrator]);

  // 3. Compute passes, propagator look angles, and freshness when satellite changes
  useEffect(() => {
    if (!selectedSatellite) return;

    // Freshness metadata (RF-16)
    const meta = orchestrator.getFreshness(selectedSatellite);
    setFreshness(meta);

    try {
      const prop = new Sgp4Propagator(selectedSatellite);

      // Current look angles
      const state = prop.propagateAt(Date.now(), observer);
      setCurrentLookAngles(state?.lookAngles ?? null);

      // Predicted passes (RF-04)
      const passes = PassPredictor.findNextPasses(prop, {
        observer,
        hoursAhead: 24,
        minElevationDeg: 10,
        maxPasses: 6,
      });
      setPredictedPasses(passes);
    } catch {
      setPredictedPasses([]);
    }
  }, [selectedSatellite, observer, orchestrator]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top Application Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.appTitle}>SATELLITE TRACKER</Text>
          <Text style={styles.satelliteNameText}>
            {selectedSatellite.name} (#{selectedSatellite.noradId})
          </Text>
        </View>

        {/* Action Quick Buttons */}
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsSearchOpen(true)}
            testID="search-catalog-btn"
          >
            <Text style={styles.iconBtnText}>🔍</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsPassesOpen(true)}
            testID="view-passes-btn"
          >
            <Text style={styles.iconBtnText}>⏱</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsCompassOpen(true)}
            testID="open-compass-btn"
          >
            <Text style={styles.iconBtnText}>🧭</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Freshness Badge (RF-16) */}
      <DataFreshnessBadge
        metadata={freshness}
        onRefreshPress={() => loadCategory(selectedCategory, true)}
      />

      {/* Interactive Map Tracking Layer (RF-10, RF-11, RF-12, RF-13) */}
      <SatelliteMapView
        selectedSatellite={selectedSatellite}
        observerLocation={observer}
        constellationSatellites={constellation}
        onSelectSatellite={setSelectedSatellite}
        style={styles.mapView}
      />

      {/* Catalog Search & Filter Modal (RF-01, RF-08) */}
      <CatalogSearchModal
        visible={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        satellites={catalog}
        selectedCategory={selectedCategory}
        onSelectCategory={loadCategory}
        onSelectSatellite={setSelectedSatellite}
        isLoading={isLoadingCatalog}
      />

      {/* Polar Sky Chart & Upcoming Passes Modal (RF-04, RF-05) */}
      <PassPredictionModal
        visible={isPassesOpen}
        onClose={() => setIsPassesOpen(false)}
        satelliteName={selectedSatellite.name}
        passes={predictedPasses}
        currentLookAngles={currentLookAngles}
        onScheduleNotification={async pass => {
          await PassNotificationService.schedulePassNotification(pass, 10);
        }}
      />

      {/* Assisted Compass Mode Overlay (RF-07) */}
      <CompassOverlay
        visible={isCompassOpen}
        onClose={() => setIsCompassOpen(false)}
        satelliteName={selectedSatellite.name}
        targetLookAngles={currentLookAngles}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e1a',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0a0e1a',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
  },
  topBarLeft: {
    flex: 1,
  },
  appTitle: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  satelliteNameText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: {
    fontSize: 16,
  },
  mapView: {
    flex: 1,
  },
});

export default App;
