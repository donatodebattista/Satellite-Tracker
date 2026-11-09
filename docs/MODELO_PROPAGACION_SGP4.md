# Documento Técnico: Modelo de Propagación Orbital SGP4 / SDP4
**Trabajo Práctico N° 7 — Programación Móviles (2026)**  
**Institución:** FCyT - Sede Concepción del Uruguay | Licenciatura en Sistemas de Información  
**Área:** Redes de Datos, Telecomunicaciones y Telecomunicaciones Satelitales  

---

## 1. Introducción al Modelo SGP4 / SDP4

El seguimiento de satélites artificiales en tiempo real requiere predecir con alta exactitud la posición tridimensional de un vehículo espacial a partir de un conjunto de elementos orbitales medios conocidos como **TLE (Two-Line Elements)** o en su formato estandarizado CCSDS **OMM (Orbit Mean-Elements Message)**.

Para este fin, la industria aeroespacial y de telecomunicaciones utiliza la familia de algoritmos analíticos **SGP4 (Simplified General Perturbations 4)** para satélites en órbita terrestre baja (**LEO**, período $T \le 225\text{ min}$) y **SDP4 (Simplified Deep Space Perturbations 4)** para satélites en órbitas medias y altas (**MEO, GEO, HEO**, período $T > 225\text{ min}$).

Implementado en esta aplicación a través de la librería estándar `satellite.js` (con soporte para OMM JSON y TLE clásico), el algoritmo resuelve de forma analítica las ecuaciones del movimiento considerando las principales fuerzas gravitacionales y no gravitacionales que perturban la órbita kepleriana ideal.

---

## 2. Marcos de Referencia y Cadena de Transformaciones

Para representar la posición del satélite sobre la superficie terrestre (geoposición) y determinar si es visible desde la estación terrena del observador, se realiza una cadena estricta de transformaciones de sistemas de coordenadas:

```
[ Elementos OMM / TLE ]
         │
         ▼ (Propagador SGP4 analítico)
[ Vector de Estado en Marco TEME ]  (r_x, r_y, r_z, v_x, v_y, v_z)
         │
         ▼ (Rotación Sidérea GMST)
[ Vector Cartesiano ECEF / ECF ]   (X, Y, Z respecto al centro de la Tierra)
         │
         ├───────────────────────────────────────────┐
         ▼ (Elipsoide WGS84)                         ▼ (Topocéntrico SEZ)
[ Geodésicas Subsatelitales ]               [ Ángulos de Apuntado (Look Angles) ]
   • Latitud geodética (φ)                      • Azimut (0° a 360° desde el Norte)
   • Longitud geodética (λ)                     • Elevación (-90° a +90° s/horizonte)
   • Altitud elipsoidal (h, km)                 • Distancia / Slant Range (km)
```

### 2.1 Marco TEME (True Equator, Mean Equinox)
El algoritmo SGP4 produce vectores cartesianos de posición $\vec{r}$ y velocidad $\vec{v}$ en el sistema de coordenadas **TEME** para el instante de tiempo UTC consultado. Es un marco inercial específico fijado al ecuador verdadero y equinoccio medio de la fecha.

### 2.2 Conversión a ECEF mediante GMST
La Tierra rota bajo la órbita del satélite. Para correlacionar la posición inercial con la superficie terrestre, se calcula el **Tiempo Sidéreo Medio de Greenwich (GMST)** para el instante juliano $t$:

$$\theta_{\text{GMST}} = 280.46061837 + 360.98564736629 \cdot (JD - 2451545.0) + \dots \pmod{360^\circ}$$

La rotación de coordenadas cartesianas hacia el marco fijado a la Tierra (ECEF) se define como:

$$\begin{pmatrix} X_{\text{ECEF}} \\ Y_{\text{ECEF}} \\ Z_{\text{ECEF}} \end{pmatrix} = \begin{pmatrix} \cos\theta_{\text{GMST}} & \sin\theta_{\text{GMST}} & 0 \\ -\sin\theta_{\text{GMST}} & \cos\theta_{\text{GMST}} & 0 \\ 0 & 0 & 1 \end{pmatrix} \begin{pmatrix} x_{\text{TEME}} \\ y_{\text{TEME}} \\ z_{\text{TEME}} \end{pmatrix}$$

### 2.3 Transformación Geodésica sobre el Elipsoide WGS84
La Tierra no es una esfera perfecta sino un esferoide oblato. El elipsoide WGS84 adoptado tiene:
* **Semieje mayor ecuatorial:** $a = 6378.137\text{ km}$
* **Achatamiento:** $f = 1 / 298.257223563$
* **Primera excentricidad al cuadrado:** $e^2 = 2f - f^2 \approx 0.00669437999014$

A partir del vector $(X, Y, Z)$, la longitud y latitud geodéticas se calculan mediante:

$$\lambda = \operatorname{atan2}(Y, X)$$

El radio de curvatura normal $N(\phi)$ y la latitud geodética $\phi$ se resuelven iterativamente (o mediante la aproximación cerrada de Bowring):

$$N(\phi) = \frac{a}{\sqrt{1 - e^2 \sin^2\phi}}$$

$$h = \frac{\sqrt{X^2 + Y^2}}{\cos\phi} - N(\phi)$$

### 2.4 Ángulos Topocéntricos del Observador (Look Angles)
Conocida la posición del observador $(\phi_{\text{obs}}, \lambda_{\text{obs}}, h_{\text{obs}})$ y la posición ECEF del satélite, se construye el vector diferencia $\vec{\rho} = \vec{r}_{\text{sat}} - \vec{r}_{\text{obs}}$. Proyectado sobre el plano tangente local en los ejes **Sur-Este-Cénit (SEZ)**:

$$\text{Azimut} = \operatorname{atan2}(\rho_{\text{Este}}, -\rho_{\text{Sur}}) \pmod{360^\circ}$$

$$\text{Elevación} = \arcsin\left(\frac{\rho_{\text{Cénit}}}{\|\vec{\rho}\|}\right)$$

Un satélite se encuentra en **Línea de Vista (LOS)** y disponible para enlace de telecomunicaciones cuando $\text{Elevación} \ge \varepsilon_{\min}$ (típicamente $10^\circ$).

---

## 3. Perturbaciones Modeladas por SGP4

El modelo analítico SGP4 incorpora:
1. **Gravitacionales terrestres:** Armónicos zonales $J_2$ (achatamiento ecuatorial, responsable de la regresión de nodos y avance del perigeo), $J_3$ (asimetría norte-sur en forma de pera) y $J_4$.
2. **Resistencia atmosférica (Drag):** Pérdida de energía cinética modelada a través del parámetro $B^*$ (*B-star drag term*), definido como:
   $$B^* = \frac{1}{2}\frac{\rho_0 C_D A}{m}$$
3. **Perturbaciones de Espacio Profundo (SDP4):** Efectos gravitacionales de tercer cuerpo debidos a la atracción de la Luna y el Sol, así como efectos de resonancia terrestre (teserales y sectoriales) en órbitas geosincrónicas (GEO) y semidiurnas (GPS / MEO).

---

## 4. Supuestos y Limitaciones Técnicas del Proyecto

Para la aplicación móvil de seguimiento satelital se establecieron los siguientes supuestos y límites de precisión:

1. **Omisión de Refracción Troposférica Fina:**
   La refracción atmosférica desvía ópticamente la señal satelital en elevaciones muy bajas ($< 5^\circ$), haciendo que el satélite aparente estar entre $0.1^\circ$ y $0.5^\circ$ más alto. Dado que el umbral de enlace mínimo configurado es $\varepsilon_{\min} = 10^\circ$, este efecto tiene un impacto despreciable en la orientación de terminales VSAT o backhaul.
2. **Variabilidad de la Densidad Termosférica:**
   El parámetro $B^*$ asume un modelo exponencial estático de densidad atmosférica. En períodos de alta actividad solar o tormentas geomagnéticas ($K_p > 5$), la termosfera se expande, incrementando el frenado orbital de satélites en LEO muy bajo ($< 450\text{ km}$, como la ISS o Starlink). Esto justifica la necesidad de refrescar los datos orbitales cada 12–24 horas (RF-09).
3. **Degradación Temporal de los Elementos (Epoch Age):**
   A medida que transcurren días desde la época del TLE/OMM, el error de fase acumulado a lo largo de la trayectoria (*in-track error*) crece exponencialmente:
   * **Época $< 24\text{ h}$ (FRESH):** Error superficial típico $< 2\text{–}5\text{ km}$.
   * **Época $24\text{–}72\text{ h}$ (AGING):** Error superficial típico $5\text{–}20\text{ km}$.
   * **Época $> 72\text{ h}$ (STALE):** Error acumulado puede superar $50\text{–}100\text{ km}$, afectando la exactitud de los tiempos de AOS/LOS en varios segundos.
