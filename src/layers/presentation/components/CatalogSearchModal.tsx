import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CATALOG_CATEGORIES,
  CatalogCategory,
  OrbitalElementSet,
} from '../../../shared';

export interface CatalogSearchModalProps {
  visible: boolean;
  onClose: () => void;
  satellites: OrbitalElementSet[];
  onSelectSatellite: (satellite: OrbitalElementSet) => void;
  onSelectCategory?: (category: CatalogCategory) => void;
  selectedCategory?: CatalogCategory;
  isLoading?: boolean;
}

/**
 * Satellite Catalog Search and Filter Modal (RF-01, RF-08).
 */
export const CatalogSearchModal: React.FC<CatalogSearchModalProps> = ({
  visible,
  onClose,
  satellites,
  onSelectSatellite,
  onSelectCategory,
  selectedCategory = 'stations',
  isLoading = false,
}) => {
  const [query, setQuery] = useState('');

  const filteredSatellites = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return satellites;

    return satellites.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.noradId.toString().includes(q) ||
        s.objectId.toLowerCase().includes(q),
    );
  }, [satellites, query]);

  const categories = Object.values(CATALOG_CATEGORIES);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop} testID="catalog-search-modal">
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Catálogo de Satélites</Text>
              <Text style={styles.subtitle}>
                {filteredSatellites.length} objetos disponibles
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar (RF-01) */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre o NORAD ID (ej: ISS, 25544, Starlink)..."
              placeholderTextColor="#64748b"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Category Filter Tabs (RF-08) */}
          <View style={styles.categoryScroll}>
            {categories.map(cat => {
              const isSelected = cat.id === selectedCategory;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    isSelected && styles.selectedCategoryChip,
                  ]}
                  onPress={() => onSelectCategory && onSelectCategory(cat.id)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      isSelected && styles.selectedCategoryText,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Satellite List */}
          {isLoading ? (
            <View style={styles.centerContainer}>
              <Text style={styles.loadingText}>Cargando catálogo orbital...</Text>
            </View>
          ) : filteredSatellites.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                No se encontraron satélites para "{query}"
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredSatellites}
              keyExtractor={item => `sat_${item.noradId}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.satRow}
                  onPress={() => {
                    onSelectSatellite(item);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.satRowLeft}>
                    <Text style={styles.satIcon}>🛰</Text>
                    <View>
                      <Text style={styles.satName}>{item.name}</Text>
                      <Text style={styles.satMeta}>
                        NORAD ID: {item.noradId} | {item.objectId || 'N/A'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.satRowRight}>
                    <View style={styles.sourceTag}>
                      <Text style={styles.sourceTagText}>
                        {item.source === 'local-seed' ? 'SEED' : item.source.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              style={styles.list}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    height: '82%',
    backgroundColor: '#0a0e1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#90a4ae',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 14,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
  },
  clearText: {
    color: '#94a3b8',
    fontSize: 14,
    paddingHorizontal: 6,
  },
  categoryScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  categoryChip: {
    backgroundColor: '#131b2e',
    borderColor: '#1e293b',
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  selectedCategoryChip: {
    backgroundColor: '#00b0ff',
    borderColor: '#40c4ff',
  },
  categoryChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  selectedCategoryText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  satRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  satRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  satIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  satName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  satMeta: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  satRowRight: {
    alignItems: 'flex-end',
  },
  sourceTag: {
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderColor: 'rgba(0, 229, 255, 0.4)',
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  sourceTagText: {
    color: '#00e5ff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#00e5ff',
    fontSize: 14,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },
});
