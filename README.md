# SatelliteTrackerApp 🛰️

> **Aplicación Móvil Profesional de Rastreo, Predicción y Visualización de Satélites en Tiempo Real**  
> Desarrollo basado en React Native (CLI), TypeScript, motor orbital SGP4/SDP4 y arquitectura limpia modular orientada a observadores terrestres.

---

## 📋 Descripción del Proyecto

**SatelliteTrackerApp** es una solución móvil diseñada para el rastreo y cálculo astrodinámico de objetos en órbita terrestre (LEO, MEO, GEO). Integra propagación orbital matemática en dispositivo (*on-device*), adquisición y caché resiliente de conjuntos de dos líneas (TLE / OMM 3LE), proyección cartográfica interactiva, visualización de bóveda celeste (*Sky Chart* polar), predicción de pases sobre la estación observadora y notificaciones locales de avistamiento.

El sistema fue concebido bajo los requisitos técnicos y operacionales del trabajo práctico, cumpliendo con los estándares de astrodinámica del modelo SGP4 (Vallado et al., 2006) y garantizando resiliencia ante pérdida de conectividad o límites de tasa (*rate limits*) en APIs satelitales públicas.

---

## ✨ Características Principales

### 🔭 Motor Orbital y Predicción
- **Propagación SGP4/SDP4 en tiempo real:** Cálculo vectorial de estado ECI (TEME) a coordenadas geocéntricas fijas ECEF y geodésicas (latitud, longitud, altitud geodésica WGS-84 y velocidad orbital).
- **Cálculo de Trazas Terrestres (*Ground Track*):** Trayectorias previas y futuras con algoritmo de detección y partición por cruce de antimeridiano ($\pm 180^\circ$).
- **Cono de Cobertura Geográfica (*Footprint*):** Polígono esferoidal de huella de visibilidad a nivel de superficie en función de la altitud y ángulo de elevación mínima configurable.
- **Predicción de Pases Locales (AOS / TCA / LOS):** Estimación analítica y numérica de elevación máxima, acimut de entrada/salida y estado de iluminación solar/eclipsado del satélite.
- **Propagación en Lote de Constelaciones:** Motor optimizado en bucle desacoplado para procesar decenas de satélites en simultáneo (e.g., constelación Starlink).

### 🗺️ Visualización Cartográfica y Bóveda Celeste
- **Planisferio Orbital 2D Vectorial (NASA Mission Control):** Proyección equirectangular SVG autónoma (sin dependencias ni necesidad de facturación en Google Cloud) con grilla geodésica, contornos continentales, traza orbital, footprint y satélites Starlink interactivos.
- **Soporte Google Maps Nativo:** Alternancia en tiempo real mediante selector integrado.
- **Carta del Cielo (*Sky Chart* Polar):** Representación estereográfica de la bóveda celeste local (círculos de elevación concéntricos $0^\circ, 30^\circ, 60^\circ$ y radios de acimut cardinal N, E, S, W).
- **Brújula Sensorial Integrada:** Orientación de acimut en tiempo real vía magnetómetro y acelerómetro del dispositivo.

### 🌐 Red, Almacenamiento y Seguridad
- **Orquestador Multifuente de Datos:** Integración con Celestrak (primario), Space-Track (respaldo institucional), N2YO y WhereTheISS.
- **Proxy Backend de Seguridad:** Servidor intermediario Express con almacenamiento seguro de credenciales mediante *Keytar* o *react-native-keychain*.
- **Caché y Resiliencia Offline:** Políticas de caducidad de TLE con degradación elegante (*graceful degradation*), cola de reintentos con *exponential backoff* y limitador de tasa (*Rate Limiter* Token Bucket).
- **Notificaciones Locales Programadas:** Integración con `@notifee/react-native` para alertar pasos de satélites minutos antes del AOS con canal de alta prioridad.

---

## 🏛️ Arquitectura del Sistema

El software sigue una arquitectura en capas desacopladas organizada en `src/`:

```
src/
├── shared/                         # Tipos globales, constantes WGS-84 y bóveda segura
│   ├── constants/orbitalConstants.ts
│   ├── security/CredentialVault.ts
│   └── types/orbital.ts
└── layers/
    ├── data-provider/              # Capa 1 & 2: Orquestación, caché y proveedores
    │   ├── cache/OrbitalCacheManager.ts
    │   ├── providers/              # Celestrak, SpaceTrack, N2YO, WhereTheISS
    │   └── resilience/             # RateLimiter, RetryQueue
    ├── orbital-engine/             # Capa 3: Propagador SGP4, GroundTrack, Footprint
    │   ├── Sgp4Propagator.ts
    │   ├── GroundTrackCalc.ts
    │   ├── FootprintCalc.ts
    │   └── ConstellationBatch.ts
    ├── observer/                   # Capa 4: GPS y sensores inerciales
    │   ├── LocationService.ts
    │   └── OrientationService.ts
    ├── prediction/                 # Capa 5: Pasos de satélites y visibilidad
    │   └── PassPredictor.ts
    ├── geo-map/                    # Capa 6: MapView interactivo y capas SVG/Constelación
    │   ├── SatelliteMapView.tsx
    │   └── ConstellationLayer.tsx
    ├── notification/               # Capa 7: Notificaciones locales y sincronización
    │   ├── PassNotificationService.ts
    │   └── BackgroundSyncTask.ts
    ├── validation/                 # Capa 8: Validación de precisión y comparación
    │   └── ValidationService.ts
    └── presentation/               # Interfaz de usuario (HUD, SkyChart, Modales)
        └── components/
```

---

## 🚀 Requisitos Previos e Instalación

### Requisitos del Entorno
- **Node.js:** Versión `>= 18.x`
- **npm** o **yarn**
- **Java Development Kit (JDK):** Versión 17
- **Android SDK:** Platform 34+, Android Build-Tools configurado en `$ANDROID_HOME`
- Dispositivo Android con **Depuración USB** activada o Emulador Android configurado

### Instalación de Dependencias

1. Clonar el repositorio o ingresar a la carpeta del proyecto:
   ```bash
   cd SatelliteTrackerApp
   ```

2. Instalar los paquetes de Node:
   ```bash
   npm install
   ```

> [!NOTE]
> El proyecto cuenta con un script post-instalación automático (`scripts/patch-sensors.js`) que corrige la compatibilidad de Gradle en repositorios modernos de Android para librerías de sensores.

---

## 📱 Ejecución en Dispositivo Android (Paso a Paso)

1. **Conectar el teléfono mediante cable USB** asegurando que:
   - Las *Opciones de Desarrollador* y la *Depuración por USB* estén activas.
   - La conexión USB esté configurada en *Transferencia de archivos (MTP)*.

2. **Verificar reconocimiento en ADB:**
   ```bash
   adb devices
   ```
   *(Deberá listarse el identificador de tu dispositivo en estado `device`).*

3. **Mapear el puerto de Metro Bundler hacia el teléfono:**
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```

4. **Compilar e instalar la aplicación:**
   ```bash
   npm run android
   ```
   *O de forma directa sin regenerar el proceso de Metro:*
   ```bash
   npx react-native run-android --no-packager
   ```

---

## 🧪 Pruebas Unitarias y Verificación de Tipos

El proyecto cuenta con una batería de tests unitarios exhaustivos que validan propagación matemática, cálculos geodésicos, resiliencia de red y renderizado de componentes.

```bash
# Comprobación de tipos estáticos TypeScript
npm run typecheck

# Ejecución de la suite completa de pruebas unitarias Jest
npm test -- --watchAll=false
```

**Resultado de las pruebas:**
- **7 suites de pruebas aprobadas** (`100% PASS`).
- **54 tests unitarios validados** que abarcan todas las capas del sistema.

---

## 📖 Documentación Técnica Adicional

En el directorio [`docs/`](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/docs) se encuentran los informes técnicos requeridos:

- [📄 Modelo de Propagación SGP4 (`MODELO_PROPAGACION_SGP4.md`)](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/docs/MODELO_PROPAGACION_SGP4.md): Análisis matemático de perturbaciones orbitales, transformaciones ECI a geodésicas y limitaciones del modelo.
- [📄 Informe de Validación de Precisión (`INFORME_VALIDACION.md`)](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/docs/INFORME_VALIDACION.md): Comparativa empírica entre el motor SGP4 local y la API en tiempo real de WhereTheISS (diferencias $< 0.1\%$ en coordenadas).
- [📄 Fuentes de Datos y Resiliencia (`FUENTES_DATOS_Y_RESILIENCIA.md`)](file:///home/donato/4to%20sistemas/mobile-dev/tp7/SatelliteTrackerApp/docs/FUENTES_DATOS_Y_RESILIENCIA.md): Estrategia de fallback multifuente, gestión de caché y arquitectura segura del servidor proxy.

---

## 🛠️ Tecnologías Empleadas

| Área | Tecnología |
| :--- | :--- |
| **Framework Base** | React Native 0.88.1 (CLI, New Architecture ready) |
| **Lenguaje** | TypeScript 5.8 |
| **Cálculo Astrodinámico** | `satellite.js` 7.1.0 (Implementación SGP4/SDP4 de Vallado) |
| **Cartografía & Gráficos** | `react-native-maps`, `react-native-svg` |
| **Sensores & Posicionamiento** | `react-native-geolocation-service`, `react-native-sensors` |
| **Persistencia & Seguridad** | `@react-native-async-storage/async-storage`, `react-native-keychain` |
| **Notificaciones** | `@notifee/react-native` |
| **Pruebas** | Jest 29, `react-test-renderer` |
