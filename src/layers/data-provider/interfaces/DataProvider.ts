import {
  CatalogCategory,
  DataSourceId,
  ExternalValidationSample,
  ObserverLocation,
  OrbitalElementSet,
} from '../../../shared';

export interface DataProvider {
  readonly id: DataSourceId;
  readonly name: string;

  /**
   * Retrieves a catalog of orbital element sets by category.
   */
  getCatalog(category: CatalogCategory): Promise<OrbitalElementSet[]>;

  /**
   * Retrieves orbital data for a specific NORAD ID.
   */
  getOrbitalData(noradId: number): Promise<OrbitalElementSet | null>;

  /**
   * Optional method to fetch an independent position sample for validation (RF-15).
   */
  getValidationPosition?(
    noradId: number,
    observer?: ObserverLocation,
  ): Promise<ExternalValidationSample | null>;

  /**
   * Checks whether the provider is currently configured and operational.
   */
  isAvailable(): Promise<boolean>;
}
