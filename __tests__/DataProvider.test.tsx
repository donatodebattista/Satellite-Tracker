import {
  CelestrakProvider,
  CredentialVault,
  DataOrchestrator,
  DEFAULT_CACHE_TTL_HOURS,
  OrbitalCacheManager,
  OrbitalElementSet,
  PROVIDER_RATE_LIMITS,
  RateLimiter,
  RateLimitExceededError,
  executeWithRetry,
} from '../src';

describe('Phase 2: Data Provider Layer, Cache, Resilience & Fallback', () => {
  beforeEach(async () => {
    await OrbitalCacheManager.clearCache();
    await CredentialVault.clearSpaceTrackCredentials();
    await CredentialVault.clearN2yoApiKey();
  });

  describe('RateLimiter', () => {
    it('allows requests within limits and records timestamps', () => {
      const limiter = new RateLimiter('test-provider', {
        maxRequestsPerMinute: 2,
        maxRequestsPerHour: 10,
        minIntervalMs: 50,
      });

      expect(limiter.canExecute()).toBe(true);
      limiter.recordRequest(1000);

      // Immediately after, minInterval (50ms) hasn't passed
      expect(limiter.canExecute(1020)).toBe(false);
      expect(limiter.getTimeUntilNextSlotMs(1020)).toBe(30);

      // After 50ms, can execute second request
      expect(limiter.canExecute(1060)).toBe(true);
      limiter.recordRequest(1060);

      // Now per-minute limit (2 req/min) reached
      expect(limiter.canExecute(1080)).toBe(false);
      expect(limiter.getTimeUntilNextSlotMs(1080)).toBeGreaterThan(50_000);
    });

    it('throws RateLimitExceededError when waitIfThrottled is false', async () => {
      const limiter = new RateLimiter('throttled-test', {
        maxRequestsPerMinute: 1,
        maxRequestsPerHour: 5,
        minIntervalMs: 500,
      });

      limiter.recordRequest(Date.now());

      await expect(
        limiter.execute(async () => 'ok', false),
      ).rejects.toThrow(RateLimitExceededError);
    });
  });

  describe('RetryQueue', () => {
    it('executes operation successfully without retries if no error occurs', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await executeWithRetry(fn, { maxRetries: 2 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on transient error and succeeds', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error 503'))
        .mockResolvedValueOnce('recovered');

      const result = await executeWithRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        jitter: false,
      });

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('fails after exceeding max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Permanent 500 error'));

      await expect(
        executeWithRetry(fn, {
          maxRetries: 2,
          initialDelayMs: 5,
          jitter: false,
        }),
      ).rejects.toThrow('Permanent 500 error');

      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('OrbitalCacheManager & Freshness (RF-09, RF-16)', () => {
    const mockIss: OrbitalElementSet = {
      noradId: 25544,
      name: 'ISS (ZARYA)',
      objectId: '1998-067A',
      epochIso: new Date(Date.now() - 3600000 * 5).toISOString(), // 5 hours old epoch
      epochTimestampMs: Date.now() - 3600000 * 5,
      category: 'stations',
      source: 'celestrak',
      fetchedAtMs: Date.now(),
    };

    it('persists and retrieves catalogs and individual elements', async () => {
      await OrbitalCacheManager.saveCatalog('stations', [mockIss], 12);

      const catalogEnvelope = await OrbitalCacheManager.getCatalog('stations');
      expect(catalogEnvelope).not.toBeNull();
      expect(catalogEnvelope!.elements).toHaveLength(1);
      expect(catalogEnvelope!.elements[0].noradId).toBe(25544);
      expect(catalogEnvelope!.isExpired).toBe(false);

      const elementEnvelope = await OrbitalCacheManager.getElement(25544);
      expect(elementEnvelope).not.toBeNull();
      expect(elementEnvelope!.element.name).toBe('ISS (ZARYA)');
    });

    it('correctly calculates freshness levels (RF-16)', () => {
      const now = Date.now();

      // Fresh: epoch is 5 hours old
      const freshMeta = OrbitalCacheManager.computeFreshness(mockIss, 12, now);
      expect(freshMeta.level).toBe('FRESH');
      expect(freshMeta.epochAgeHours).toBeCloseTo(5, 1);
      expect(freshMeta.isCacheExpired).toBe(false);

      // Aging: epoch is 30 hours old (> 24h)
      const agingIss: OrbitalElementSet = {
        ...mockIss,
        epochTimestampMs: now - 3600000 * 30,
        epochIso: new Date(now - 3600000 * 30).toISOString(),
      };
      const agingMeta = OrbitalCacheManager.computeFreshness(agingIss, 12, now);
      expect(agingMeta.level).toBe('AGING');
      expect(agingMeta.warningMessage).toBeDefined();

      // Stale: epoch is 80 hours old (> 72h)
      const staleIss: OrbitalElementSet = {
        ...mockIss,
        epochTimestampMs: now - 3600000 * 80,
        epochIso: new Date(now - 3600000 * 80).toISOString(),
      };
      const staleMeta = OrbitalCacheManager.computeFreshness(staleIss, 12, now);
      expect(staleMeta.level).toBe('STALE');
      expect(staleMeta.warningMessage).toContain('desvíos');
    });

    it('searches cached satellites locally by name and NORAD ID (RF-01)', async () => {
      await OrbitalCacheManager.saveCatalog('stations', [mockIss], 12);

      const searchByName = await OrbitalCacheManager.searchLocal('zarya');
      expect(searchByName).toHaveLength(1);
      expect(searchByName[0].noradId).toBe(25544);

      const searchById = await OrbitalCacheManager.searchLocal('25544');
      expect(searchById).toHaveLength(1);

      const notFound = await OrbitalCacheManager.searchLocal('nonexistent_satellite');
      expect(notFound).toHaveLength(0);
    });
  });

  describe('CredentialVault (PRD Section 4.3)', () => {
    it('stores and retrieves Space-Track credentials in secure keychain', async () => {
      await CredentialVault.setSpaceTrackCredentials({
        identity: 'astronomer@example.edu',
        password: 'superSecretPassword123',
      });

      const creds = await CredentialVault.getSpaceTrackCredentials();
      expect(creds).not.toBeNull();
      expect(creds?.identity).toBe('astronomer@example.edu');
      expect(creds?.password).toBe('superSecretPassword123');

      await CredentialVault.clearSpaceTrackCredentials();
      const cleared = await CredentialVault.getSpaceTrackCredentials();
      expect(cleared).toBeNull();
    });

    it('stores and retrieves N2YO API key', async () => {
      await CredentialVault.setN2yoApiKey('N2YO-KEY-998877');
      const key = await CredentialVault.getN2yoApiKey();
      expect(key).toBe('N2YO-KEY-998877');
    });

    it('manages proxy configuration', async () => {
      const initial = await CredentialVault.getProxyConfig();
      expect(initial.enabled).toBe(false);

      await CredentialVault.setProxyConfig({
        enabled: true,
        baseUrl: 'http://192.168.1.100:3000',
      });

      const updated = await CredentialVault.getProxyConfig();
      expect(updated.enabled).toBe(true);
      expect(updated.baseUrl).toBe('http://192.168.1.100:3000');
    });
  });

  describe('CelestrakProvider OMM Normalization', () => {
    it('converts raw CelesTrak OMM JSON object into normalized OrbitalElementSet', () => {
      const provider = new CelestrakProvider();
      const rawCelesTrakOmm = {
        OBJECT_NAME: 'STARLINK-31001',
        OBJECT_ID: '2026-001A',
        EPOCH: '2026-11-08T06:30:00.000000',
        MEAN_MOTION: 15.02,
        ECCENTRICITY: 0.00012,
        INCLINATION: 53.2,
        RA_OF_ASC_NODE: 180.4,
        ARG_OF_PERICENTER: 90.1,
        MEAN_ANOMALY: 200.5,
        NORAD_CAT_ID: 60123, // 6-digit NORAD ID support
        ELEMENT_SET_NO: 999,
        REV_AT_EPOCH: 1200,
        BSTAR: 0.00003,
        MEAN_MOTION_DOT: 0.00001,
        MEAN_MOTION_DDOT: 0,
      };

      const normalized = provider.normalizeOmmRecord(
        rawCelesTrakOmm,
        'starlink-sup',
      );

      expect(normalized.noradId).toBe(60123);
      expect(normalized.name).toBe('STARLINK-31001');
      expect(normalized.category).toBe('starlink-sup');
      expect(normalized.source).toBe('celestrak');
      expect(normalized.omm?.INCLINATION).toBe(53.2);
    });
  });

  describe('DataOrchestrator Fallback & Offline Resilience (RF-14)', () => {
    it('returns cached data when fresh without invoking providers', async () => {
      const mockIss: OrbitalElementSet = {
        noradId: 25544,
        name: 'ISS (ZARYA)',
        objectId: '1998-067A',
        epochIso: new Date().toISOString(),
        epochTimestampMs: Date.now(),
        category: 'stations',
        source: 'celestrak',
        fetchedAtMs: Date.now(),
      };

      await OrbitalCacheManager.saveCatalog('stations', [mockIss], 12);

      const orchestrator = new DataOrchestrator();
      const result = await orchestrator.getCatalog('stations');

      expect(result.fromCache).toBe(true);
      expect(result.isExpired).toBe(false);
      expect(result.elements).toHaveLength(1);
    });

    it('falls back to Space-Track when CelesTrak fails', async () => {
      const mockPrimary: any = {
        id: 'celestrak',
        name: 'CelesTrak',
        getCatalog: jest.fn().mockRejectedValue(new Error('CelesTrak down 503')),
        getOrbitalData: jest.fn().mockRejectedValue(new Error('CelesTrak down')),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const mockSpaceTrackElement: OrbitalElementSet = {
        noradId: 25544,
        name: 'ISS (ZARYA) [SpaceTrack]',
        objectId: '1998-067A',
        epochIso: new Date().toISOString(),
        epochTimestampMs: Date.now(),
        category: 'stations',
        source: 'spacetrack',
        fetchedAtMs: Date.now(),
      };

      const mockFallback: any = {
        id: 'spacetrack',
        name: 'Space-Track',
        getCatalog: jest.fn().mockResolvedValue([mockSpaceTrackElement]),
        getOrbitalData: jest.fn().mockResolvedValue(mockSpaceTrackElement),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const orchestrator = new DataOrchestrator(
        mockPrimary,
        mockFallback,
        undefined,
        undefined,
      );

      const result = await orchestrator.getCatalog('stations');
      expect(result.fromCache).toBe(false);
      expect(result.source).toBe('spacetrack');
      expect(result.elements[0].name).toContain('SpaceTrack');
      expect(mockPrimary.getCatalog).toHaveBeenCalled();
      expect(mockFallback.getCatalog).toHaveBeenCalled();
    });

    it('falls back to offline seeds when all remote providers fail and cache is empty', async () => {
      const mockPrimary: any = {
        id: 'celestrak',
        name: 'CelesTrak',
        getCatalog: jest.fn().mockRejectedValue(new Error('Network error')),
        getOrbitalData: jest.fn().mockRejectedValue(new Error('Network error')),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const mockFallback: any = {
        id: 'spacetrack',
        name: 'Space-Track',
        getCatalog: jest.fn().mockRejectedValue(new Error('Network error')),
        getOrbitalData: jest.fn().mockRejectedValue(new Error('Network error')),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const orchestrator = new DataOrchestrator(
        mockPrimary,
        mockFallback,
        undefined,
        undefined,
      );

      const result = await orchestrator.getCatalog('stations');
      expect(result.source).toBe('local-seed');
      expect(result.elements.length).toBeGreaterThan(0);
      expect(result.elements[0].noradId).toBe(25544);
    });
  });
});
