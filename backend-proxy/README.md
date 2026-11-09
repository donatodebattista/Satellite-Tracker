# Satellite Tracker — Backend Proxy (PRD Sección 4.3)

Este proxy liviano en Node.js cumple con el requerimiento de **Seguridad de Credenciales** establecido en la Sección 4.3 del PRD:
> *"Credenciales (Space-Track, API Key de N2YO) fuera del código fuente y del bundle. Se recomienda un backend proxy liviano (Node.js) o, en su defecto, almacenamiento seguro con Keychain/Keystore."*

## Características
1. **Protección de Secretos:** Mantiene las credenciales de Space-Track y la API Key de N2YO en el entorno del servidor sin incluirlas en el bundle de React Native.
2. **Manejo de Sesión mTLS / Cookies:** Mantiene la cookie de sesión autenticada con Space-Track (`/ajaxauth/login`) para no re-autenticar en cada consulta.
3. **Control de Cuotas y CORS:** Permite a la app móvil (Android Emulator `http://10.0.2.2:3000` o dispositivo físico) consumir datos de forma limpia.

## Puesta en marcha

```bash
cd backend-proxy
cp .env.example .env
# Completar SPACETRACK_IDENTITY, SPACETRACK_PASSWORD y N2YO_API_KEY en .env
node server.js
```
