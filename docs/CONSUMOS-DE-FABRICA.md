# Consumos de fábrica — investigación con fuentes

Investigado el **05/10/2026**. Objetivo: tener una referencia de fábrica para la primera meta de
cada equipo, en vez de la planilla "Consumos Estimados", que está medida 39,5 % lejos del consumo
real (mediana del desvío absoluto, 68 equipos).

> **Regla de este documento: cada cifra lleva su fuente, y lo que no se encontró se dice.** Donde
> no hay dato de fábrica publicado, está escrito que no hay — no se completa con una estimación
> disfrazada de especificación.

## Lo primero, porque cambia cómo se lee todo lo demás

**No todas las categorías admiten la misma comparación.** El dato de fábrica y el número que
publica la app miden lo mismo solo en algunos casos:

| Categoría | ¿Comparable con lo que mide la app? |
|---|---|
| Vehículos livianos (L/100 km) | **Sí.** Hay consumo homologado oficial. Ciclo de ruta contra uso de trabajo, pero la magnitud es la misma. |
| Grupos electrógenos (L/hora) | **Sí, y es el más preciso.** Los fabricantes publican la curva de consumo por nivel de carga. |
| Máquinas Caterpillar (L/hora) | **Sí.** CAT publica bandas por factor de carga en su Performance Handbook. |
| Mixers y bombas (L/hora) | **No.** Ver abajo: no existe cifra de fábrica comparable. |
| Camiones y tractores (L/100 km) | Parcial. El dato de fábrica es de ruta a carga nominal; estos trabajan en obra. |

---

## 1. Vehículos livianos — el dato existe y cierra

| Equipos | Modelo | Fábrica | Fuente | Real medido | Planilla |
|---|---|---|---|---|---|
| CM34, CM35, CM40, CM42 | Ford Ranger DC 4x4 XL 2.2 TDCi 160 CV | **7,0 L/100 km** (NEDC combinado, CO₂ 184 g/km) | [km77](https://www.km77.com/coches/ford/ranger/2016/doble-cabina/xl/ranger-doble-cabina-xl-22-tdci-118-kw-160-cv-4x4-startstop/datos) | **7,77** | 9 |
| CM43, CM48 | Toyota Hilux 4x4 DC SR 2.8 TDI 6 MT | **7,4 L/100 km** (mixto; urbano 8,8 / extraurbano 6,7) | [Mercado Libre — ficha de consumos](https://www.mercadolibre.com.ar/blog/mo-consumo-toyota-hilux-consumo) | **64,45** ⚠ | 8,5 |
| CM30, CM31 | VW Amarok DC 2.0 TDI 180 CV 4Motion | **7,6 L/100 km** (combinado, manual) | [Motorgiga](https://motorgiga.com/volkswagen/amarok/amarok-doble-cabina-canyon-20-tdi-180-cv-4motion-conectable2/2011/precio-ficha-tecnica) | sin dato | 8,5 |

**Lo que dice esto:** la Ranger 2.2 consume **7,77 contra 7,0 de fábrica — un 11 % arriba**, que es
exactamente lo que se espera de uso de trabajo contra ciclo homologado. La planilla decía 9: era
conservadora de más, y por eso varias Ranger figuraban "bajo la meta" sin mérito.

**CM43 y CM48 a 64,45 L/100 km no es consumo, es el dato roto** que ya detectó
`cargas-imposibles.js` (23 cargas en dos días imputadas a CM43). Contra los 7,4 de fábrica, la
magnitud del error queda a la vista: **9 veces**.

### Pendiente de investigar en esta categoría
- Ford Ranger 3.0 L (CM09, CM10, CM44) — motor distinto al 2.2, no se buscó.
- Toyota Hilux 4x2 CS DX 2.4 TDI (CM47). Su real medido es **4,75**, sospechosamente bajo para una
  Hilux; conviene mirarlo igual que CM43 pero en el otro sentido.
- Peugeot Partner Confort 1.6 HDi 92 (FG02). Real 5,2, planilla 6.

---

## 2. Grupos electrógenos — el dato más preciso, y el hallazgo más grave

Los fabricantes publican la curva completa por nivel de carga. Para el Cummins C150 D5 (GE01),
motor 6BTAA5.9-G6, 150 kVA standby / 136 kVA prime:

| Carga | Consumo |
|---|---|
| 1/4 | **12,5 L/h** |
| 1/2 | **17,5 L/h** |
| 3/4 | **29,0 L/h** |
| Plena (standby) | **36,0 L/h** |
| Plena (prime) | **31,2 L/h** |

Fuentes: [Cummins — producto C150 D5](https://www.cummins.com/en-na/generators/products/c150d5) ·
[ADE Power — ficha C150D5](https://ade-power.co.uk/generators/cummins/c150d5) ·
[Generator Warehouse](https://www.generatorwarehouse.co.uk/cummins-c150-d5-c.html)

### El hallazgo

```
GE01  Cummins C150 D5   real  1,09 L/h   planilla 25   fábrica: 12,5 L/h al 25% de carga
GE02  John Deere        real  2,62 L/h   planilla 12
GE03  CETEC CJD200ESA   real  5,38 L/h   planilla 38
GE04  GESA GD352        real  sin dato   planilla 85
```

**GE01 publica 1,09 L/h cuando el mínimo físico de ese equipo, a un cuarto de carga, es 12,5.**
Está once veces por debajo de lo posible. Y no es un equipo suelto: **los cuatro grupos
electrógenos dan muy por debajo de su planilla**, lo que apunta a un problema estructural en cómo
se les cuentan las horas, no a cuatro errores de carga independientes.

Esto no está diagnosticado todavía — hace falta ver de dónde salen las horas de un grupo
electrógeno (no tienen Resumen de Flota como los vehículos). Queda como lo primero a mirar.

---

## 3. Máquinas Caterpillar — bandas por factor de carga

CAT publica consumo en tres bandas según el factor de carga medio del motor
(bajo 15-30 %, medio 25-35 %, alto 30-45 %), con datos de su propia telemetría.

| Equipo | Modelo | Bajo | Medio | Alto | Real medido | Planilla |
|---|---|---|---|---|---|---|
| CF27 | CAT 950H (cargadora frontal) | 8,2–11,7 | 11,7–14,8 | 14,8–18,4 | **11,23** | 10 |
| EX01 | CAT 323 DL (excavadora) | 10,3 | 13,1 | 15,8 | **12,59** | sin dato |

Fuentes: [Cat Performance Handbook — tablas de consumo](https://wheelercat.com/wp-content/uploads/2023/01/Cat-Performance-Handbook-from-VST-fuel-consumption-2022-12-09T21-20-09.pdf) ·
[Boom & Bucket — especificaciones CAT 950](https://www.boomandbucket.com/resources/specs/loaders/caterpillar/950) ·
[Boom & Bucket — especificaciones CAT 323](https://www.boomandbucket.com/resources/specs/excavators/caterpillar/323) ·
[Tabla de consumo, cargadoras](https://may-whitaker-ccsg.squarespace.com/s/Fuel-Table-Loaders.pdf)

**Lo que dice esto:** las dos máquinas CAT caen dentro de su banda de carga baja a media, que es
coherente con operación de planta de hormigón. **Son los dos casos donde el real medido valida la
operación en vez de señalar un problema**, y EX01 pasa de no tener ninguna referencia a tenerla.

---

## 4. Donde NO hay dato de fábrica

### Mixers (más de 25 equipos — la mayor parte de la flota)

**Scania no publica consumo en L/hora para el P310, P320, P360 ni P440.** Publica potencia, par y
especificaciones del chasis; el consumo en litros por hora de un mixer no es una cifra que el
fabricante del camión declare, porque depende del ciclo de la hormigonera y no del camión.

Las cifras que circulan en la industria — "20-30 L/h para un mixer de 6-8 m³, 30-40 L/h para uno
de 10-12 m³" ([Shengjia](https://www.lutongzk.com/blog/what-is-the-fuel-consumption-of-a-mixer-truck-1568901.html)) —
**no son comparables con lo que mide la app y usarlas sería un error**: se refieren a los minutos
de mezclado y descarga activa, mientras que el L/hora de FlotaControl es litros totales dividido
por las horas de motor del GPS, que incluyen traslado, espera y ralentí. La flota mide 7,5–8 L/h;
la cifra de industria es 3 a 5 veces mayor porque cuenta otra cosa.

**Conclusión para mixers: la referencia honesta no es una especificación de fábrica, son sus
propios pares y su propia historia** — que es exactamente lo que ya hace el hallazgo `pares` y lo
que falta terminar con la degradación propia.

### Bombas de hormigón (BM07 a BM24)

Mismo caso, y peor: son chasis de una marca (Ford, VW, Iveco) con una bomba de otra (Putzmeister,
Schwing). Ninguno de los dos fabricantes publica un consumo combinado en L/hora.

### Komatsu, Hyundai y el resto de la maquinaria

**Komatsu no publica L/h para la WA 320.** Se verificó en su documentación y en las fichas
técnicas de terceros: publican capacidad de tanque (221–228 L), potencia y mejoras relativas entre
generaciones ("hasta 3 % menos de consumo en ciclo V" para la WA320-8), pero no un valor absoluto.
Fuentes: [Construction Equipment Guide — WA320-3](https://www.constructionequipmentguide.com/charts/wheel-loaders/komatsu/wa320-3/22570) ·
[Komatsu WA320-8, ficha](https://img.forconstructionpros.com/files/base/acbm/fcp/document/2024/05/WA320-8.pdf)

Sin dato propio, lo más defendible para CF23 y CF25 (WA 320, 150 HP, 2,8 m³) es usar la banda del
**CAT 950H como clase equivalente** (misma función, potencia y capacidad de cuchara comparables) y
decir que es un proxy, no una especificación. Su real medido, 10,04 L/h, cae en esa banda baja.

Tampoco se encontró dato publicado para: Hyundai 757 (CF37, CF38 — real 11,18), IRON ZL30F (CF39),
JCB 3CX (RE01), CAT D7 (TP01), Unionbull FD25TJ (AE01), Sullair 185Q (MT01).

---

## 5. Lo que queda

1. **Diagnosticar los grupos electrógenos.** Es el hallazgo más grave y el más barato de mirar: la
   cifra de fábrica demuestra que los cuatro números son imposibles.
2. **Terminar los livianos**: Ranger 3.0, Hilux 2.4, Partner 1.6.
3. **Tractores y camiones en L/100 km** (TR14 a TR35, CH28): no se investigaron. El dato de fábrica
   existe para ruta, pero hay que decidir si es comparable con su uso real.
4. **Decidir qué hacer donde no hay dato**: usar la clase equivalente como proxy declarado, o dejar
   que la meta la fije el consumo real de los pares. Para mixers y bombas —la mayor parte de la
   flota— la segunda es la única honesta.
