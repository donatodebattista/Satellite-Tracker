# Decisiones de Diseño: Fuentes de Datos, Resiliencia y Seguridad
**Trabajo Práctico N° 7 — Programación Móviles (2026)**  
**Institución:** FCyT - Sede Concepción del Uruguay | Licenciatura en Sistemas de Información  
**Requisitos PRD:** RF-08, RF-09, RF-14, RF-16 y Entregable N° 5  

---

## 1. Caso de Estudio: Constelación Starlink

Uno de los principales desafíos planteados en el PRD es el seguimiento de la mega-constelación Starlink (SpaceX), que cuenta con miles de satélites activos en órbitas LEO bajas ($\approx 550\text{ km}$).

### 1.1 Inexistencia de API Pública Directa de SpaceX
SpaceX no provee una API pública abierta para el seguimiento ciudadano de su constelación:
* **Starlink Enterprise APIs:** Exigen cuenta comercial corporativa y están orientadas a la gestión de telemetría de terminales de usuario (*dishes*), routers y telemetría de red, no a las efemérides orbitales completas de la constelación.
* **Space Traffic Coordination API:** Permite a operadores de satélites coordinar maniobras de evasión de colisiones en órbita. Sin embargo, su acceso está severamente restringido: exige firma de acuerdos de confidencialidad (NDA), aprobación previa de SpaceX y autenticación mTLS (*mutual TLS*) con certificados criptográficos firmados por SpaceX.

### 1.2 Estrategia Técnica Adoptada: CelesTrak SupGP
Para resolver esta restricción sin violar políticas de acceso, la aplicación utiliza los **datos suplementarios (SupGP)** publicados por el Dr. T.S. Kelso a través de **CelesTrak**:
* SpaceX publica periódicamente sus efemérides orbitales directas en formato de texto/ephemeris.
* CelesTrak procesa estas efemérides oficiales del operador y genera elementos orbitales de propósito general suplementarios (`sup-gp.php?FILE=starlink`), distribuyéndolos en formato estándar **OMM JSON**.
* **Ventaja técnica:** Permite obtener elementos orbitales precisos de toda la flota Starlink incluso durante las fases de elevación de órbita (*orbit raising*) posteriores al lanzamiento, antes de que el catálogo militar de Space-Track les asigne números definitivos.

---

## 2. Mapa de Proveedores de Datos y Cuotas de Uso

La aplicación abstrae las fuentes detrás del contrato común [`DataProvider`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/src/layers/data-provider/interfaces/DataProvider.ts), aplicando límites estrictos para no saturar los servicios externos:

| Proveedor | Rol en la App | Autenticación | Formato Primario | Límites y Restricciones | TTL Caché Sugerido |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **CelesTrak** | Fuente primaria de catálogos GP y Starlink SupGP | Sin autenticación | **OMM / JSON** | Se actualiza ~1 vez al día. Límite de cortesía: 10 req/min. | **12 a 24 horas** |
| **Space-Track.org** | Catálogo oficial alternativo y fallback | Usuario y contraseña (`/ajaxauth/login`) | **JSON / TLE** | **< 30 req/min y < 300 req/hora**. Bloqueo de IP ante ráfagas. | **12 a 24 horas** |
| **N2YO** | Validación cruzada y TLE individual | API Key personal | **JSON / TLE** | 1.000 transacciones/hora (posiciones/TLE); 100 transacciones/hora (pases). | **12 a 24 horas** |
| **Where the ISS at?** | Validación en tiempo real de la ISS | Sin autenticación | **JSON REST** | $\approx 1\text{ req/segundo}$. Exclusivo para NORAD 25544. | **1 hora** |

---

## 3. Arquitectura de Resiliencia y Control de Tráfico

Para garantizar el funcionamiento fluido en el dispositivo móvil y la tolerancia a cortes de conectividad, se implementaron cuatro patrones de resiliencia:

```
[ Solicitud de Catálogo / Satélite ]
                 │
                 ▼
     [ 1. OrbitalCacheManager ] ──(¿Válido y fresco?)──► [ Retorno Inmediato (Caché) ]
                 │ (No / Expirado)
                 ▼
      [ 2. DataOrchestrator ]
                 │
        ┌────────┴──────────────────────────┐
        ▼                                   ▼
[ CelesTrakProvider ] (RateLimiter)  [ SpaceTrackProvider ] (Fallback)
        │                                   │
        ▼ (¿Error de red o cuota?)          ▼ (¿Error o sin credenciales?)
[ RetryQueue con Backoff ]           [ Reintento y Fallback ]
        │                                   │
        └─────────────────┬─────────────────┘
                          │ (Todos los proveedores fallaron)
                          ▼
            [ Retorno Caché Expirado ] ──► Alerta visual RF-16 (Offline Mode)
                          │ (Caché vacío)
                          ▼
            [ Seeds Locales de Emergencia ]
```

### 3.1 Separación entre Cálculo Local y Consultas de Red
* El cálculo de posiciones orbitales, azimut, elevación, ground track y footprint se ejecuta **100% en local mediante SGP4**.
* Las APIs remotas se consultan **únicamente** para refrescar los elementos orbitales periódicamente o durante una validación puntual. Nunca se realiza una petición HTTP en el hilo de renderizado o en cada frame del mapa.

### 3.2 Caché Offline con TTL (`OrbitalCacheManager`)
* Persistencia local en disco con `@react-native-async-storage/async-storage`.
* Cada categoría (`stations`, `starlink-sup`, `gps-ops`, `weather`) y cada elemento individual se guarda en un sobre (*envelope*) con marca temporal `fetchedAtMs` y `ttlHours`.
* Si no hay conectividad a Internet, la app continúa funcionando con los últimos datos guardados, alertando al usuario sobre la antigüedad de la época mediante el [`DataFreshnessBadge`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/src/layers/presentation/components/DataFreshnessBadge.tsx).

### 3.3 Rate Limiter y Cola de Reintentos
* **Ventana Deslizante (Sliding Window):** El componente [`RateLimiter`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/src/layers/data-provider/resilience/RateLimiter.ts) monitorea las peticiones realizadas en ventanas de 1 minuto y 1 hora, impidiendo que el cliente exceda los cupos de Space-Track (< 30 req/min) o N2YO.
* **Intervalo Mínimo:** Garantiza un espaciado temporal mínimo entre llamadas consecutivas (ej. 2000 ms).
* **Exponential Backoff con Jitter:** [`RetryQueue`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/src/layers/data-provider/resilience/RetryQueue.ts) reintenta peticiones fallidas multiplicando el retardo por un factor exponencial con variación aleatoria (*jitter* del 80% al 120%) para evitar sincronización de reintentos.

### 3.4 Conmutación en Cascada (Fallback)
Si CelesTrak presenta una caída de servicio (HTTP 503) o error de red, [`DataOrchestrator`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/src/layers/data-provider/DataOrchestrator.ts) conmuta de forma transparente hacia Space-Track. Si ambas fallan y el dispositivo no tiene conexión, la app entrega el catálogo en caché o los elementos de arranque iniciales (*seeds*) garantizando que la aplicación nunca quede inoperativa.

---

## 4. Seguridad de Credenciales (PRD Sección 4.3)

Para evitar la fuga de contraseñas de Space-Track o API Keys de N2YO en el código fuente o en el bundle binario de la aplicación móvil, se diseñaron dos mecanismos complementarios:

1. **Bóveda Criptográfica en Hardware ([`CredentialVault`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/src/shared/security/CredentialVault.ts)):**
   * Almacenamiento cifrado en el llavero nativo del sistema operativo (**Android Keystore** / **iOS Keychain**) mediante `react-native-keychain`.
   * Accesible únicamente cuando el dispositivo está desbloqueado por el usuario (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`).

2. **Backend Proxy Liviano ([`backend-proxy/`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/backend-proxy/server.js)):**
   * Servidor Node.js independiente que almacena los secretos en variables de entorno (`.env`).
   * Gestiona el inicio de sesión con Space-Track (`/ajaxauth/login`) y conserva la cookie de sesión autenticada en memoria del servidor.
   * La app móvil simplemente apunta al proxy local (`http://10.0.2.2:3000` en emulador Android), consumiendo los endpoints sin almacenar ninguna credencial en el dispositivo móvil.
