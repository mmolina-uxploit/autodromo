# Autódromo

Juego de carreras arcade pseudo-3D para navegador. Cuatro circuitos completos con saltos, autos con propulsores de aire, física real, rivales con IA, suspensiones visibles y sonido grabado. JavaScript nativo con módulos ES, sin dependencias en producción y sin paso de compilación para desarrollar.

## Jugar

| Cómo | Qué hacer |
|---|---|
| Desde cualquier navegador, sin instalar nada | Abrí `dist/autodromo.html` con doble clic. Es un solo archivo de 8,5 MB que trae el juego, los sprites y los sonidos adentro. |
| En línea | El link publicado (ver «Publicar»). |
| Para desarrollar | `npm run serve` y abrir `http://localhost:8080`. Los módulos ES necesitan servidor; este no guarda caché. Si se abre `index.html` con doble clic, pasa sola a `dist/autodromo.html`. |

Con `?semilla=7` en la URL la grilla y los rivales se repiten igual en cada carrera.

## Correr, probar y publicar

| Qué | Cómo |
|---|---|
| Pruebas unitarias, de arquitectura y de coherencia | `npm test` (237 pruebas, Node 20+, sin instalar nada). |
| Pruebas de punta a punta | `npm install`, `npx playwright install chromium` y `npm run e2e`. Escritorio y dos celulares, teclado, multitoque, auditoría WCAG con axe. Deja capturas en `tests/e2e/capturas/`. |
| Versión de un solo archivo | `npm run build` → `dist/autodromo.html` y `dist/artifact.html`. |
| Verificar trazados | `npm run pistas`: cierre, radio mínimo, separación y velocidad mínima de cada salto. |
| Simular sin navegador | `npm run simular` (un auto por pista) y `npm run carrera -- costa-rosa 2 5` (carrera completa). |
| Regenerar sprites | `npm run sprites` con `numpy scipy pillow` (entorno en `design/generador/.venv`). |
| Regenerar sonidos | `npm run sonidos`: descarga las grabaciones CC0 y arma `assets/audio`. |
| Catálogo de dibujos | `npm run dibujos` → `dist/dibujos-autodromo.zip`: imágenes de todo lo que se dibuja con código (utilería, fondos, ruta, efectos, minimapa), el código que lo dibuja y una guía para rediseñarlo. `npm run catalogo` solo regenera las imágenes. |
| Medir el motor | `node tools/telemetria.mjs` (suavidad de la física y la IA) y `node tools/rendimiento.mjs [pista] [cuadros] [calidad]` (costo de cada cuadro en el navegador, con perfil). |
| Capturas de una escena | `tools/captura.sh salida.png "escena=demo&pista=anillo-neon&hasta=640"` con el servidor corriendo. |
| Publicar | Push a `main`. En el repositorio: Settings → Pages → Source: **GitHub Actions**. Solo publica si todas las pruebas pasan; también sube `autodromo.html`. |

## Controles

| Acción | Teclado | Mando | Táctil |
|---|---|---|---|
| Dirigir | ← → o A D | Stick (progresivo) o cruceta | ◀ ▶ |
| Acelerar | ↑ o W | Gatillo derecho | Acelerar |
| Frenar y marcha atrás | ↓ o S | Gatillo izquierdo o B | Freno |
| Propulsor de salto (toque) y planeo (sostenido) | Espacio o J | A | Salto |
| Propulsor de empuje | Shift o K | X o RB | Empuje |
| Pausa | Esc o P | Start | ‖ |

La barra de propulsores se recarga mientras las ruedas tocan el piso. Si llegás lento a una rampa, saltá en el labio y sostené para planear sobre el foso.

## Autos

| Auto | Carácter | Velocidad | Aceleración | Manejo | Propulsores | Resistencia |
|---|---|---|---|---|---|---|
| Cuña | Motor central, 585 CV, tracción trasera, alerón con apoyo | 4 | 4 | 4 | 2 | 2 |
| Saeta | Liviana, 462 CV, tracción integral | 3 | 3 | 5 | 2 | 1 |
| Bloque | Furgón de 1950 kg y suspensión larga, empuja en los choques | 1 | 1 | 1 | 2 | 5 |
| Volta | Roadster eléctrico de 979 CV con paquete de propulsores de aire frío | 5 | 5 | 4 | 5 | 3 |

Las cifras de 1 a 5 no se escriben a mano: `application/selection-presenters.js` las calcula de la ficha física de `config/vehicles.js`, que valida `domain/vehicle.js`. La misma física rige al jugador y a los rivales.

## Pistas

| Pista | Zona | Largo | Curvas | Saltos | Desnivel |
|---|---|---|---|---|---|
| Bajo Autopista | Noche bajo el viaducto | 2,31 km | 7 | 1 | 6 m |
| Costa Rosa | Día junto al mar | 3,27 km | 8 | 2 | 9 m |
| Distrito Torre | Día entre torres | 1,60 km | 10 | 1 | 7 m |
| Anillo Neón | Noche de neón | 1,97 km | 7 | 3 | 17 m |

Los trazados de `config/tracks.js` se describen en metros y grados: rectas, curvas con radio y ángulo (entran y salen por clotoides) y saltos con rampa, foso y aterrizaje. Dos rectas marcadas `adjust` se recalculan para que el circuito cierre exacto, así el minimapa dibuja lo mismo que se maneja.

## Cómo funciona

- **Física**: modelo de bicicleta en coordenadas de pista, con neumáticos tipo Pacejka, transferencia de carga, carga aerodinámica, caja automática (o una marcha en el eléctrico), control de tracción, ABS y control de estabilidad según la dificultad. Las lomas despegan el auto si la aceleración vertical supera la gravedad. Cada auto tiene suspensión con altura, cabeceo y rolido. Los saltos, planeos, aterrizajes y caídas al foso son físicos.
- **Rivales**: línea de carrera optimizada por curvatura, velocidad objetivo por agarre y frenada, persecución pura para el volante, adelantamientos y uso de propulsores cuando no les alcanza la velocidad para un salto. La dificultad cambia su ritmo, tus ayudas y tu lugar en la grilla.
- **Dibujo**: pseudo-3D con oclusión exacta en lomas y fosos. Los autos se dibujan por capas (ruedas, carrocería, luz de freno y ruedas al frente), así la carrocería sube, baja y rola sobre la suspensión. Hay partículas, marcas de frenada, propulsores, defensas, utilería por zona y minimapa.
- **Sonido**: grabaciones reales CC0. Los motores usan síntesis granular sobre aceleraciones grabadas, siguiendo las RPM. Los rivales tienen efecto Doppler y cada zona su reverberación. Créditos en `assets/audio/CREDITOS.md`.

## Arquitectura

El código sigue Clean Architecture: las reglas del juego viven en el centro y no conocen el navegador. Cada capa externa depende de las internas, nunca al revés.

```
src/
├── domain/          Reglas puras: pista, auto, IA, choques, carrera, vueltas
├── application/     Casos de uso y puertos: sesión de carrera, ajustes, presentadores
├── infrastructure/  Adaptadores: teclado, mando, táctil, almacenamiento, ciclo, canvas, audio
├── presentation/    Interfaz con Atomic Design
├── config/          Datos: reglas, trazados, autos, zonas, dificultad, cámara, recursos
└── main.js          Raíz de composición: el único archivo que conoce todas las capas
```

| Capa | Puede importar de |
|---|---|
| `domain` | `domain` |
| `config` | `config` |
| `application` | `application`, `domain` |
| `infrastructure` | `infrastructure`, `application`, `domain`, `config` |
| `presentation` | `presentation`, `application`, `config` |

`tests/architecture.test.js` hace cumplir esta tabla y prohíbe APIs del navegador en el dominio. El dominio es funcional e inmutable: `stepRace(carrera, controles, dt, mundo)` devuelve una carrera nueva más sus eventos, con subpasos fijos de 1/120 s. Los efectos (guardar la mejor vuelta, vibrar, sonar) los deciden la sesión y los adaptadores.

## Interfaz con Atomic Design

| Nivel | Archivos | Prefijo CSS |
|---|---|---|
| Átomos | `Button`, `PadButton`, `Switch`, `RadioChip`, `Readout`, `Icon`, `LiveRegion`, `Meter`, `Picture`, `ProfileGraphic`, `TrackMap`, tipografía | `a-` |
| Moléculas | `Stat`, `ChoiceGroup`, `SettingRow`, `PadCluster`, `KeyList`, `Toast`, `Countdown`, `OptionCard`, `StatMeters`, `FactList`, `StepHeader` | `m-` |
| Organismos | `TitleScreen`, `CarSelect`, `TrackSelect`, `RaceSetup`, `ResultsPanel`, `Hud`, `TouchControls`, `PauseMenu`, `SettingsPanel`, `HelpPanel`, `DialogPanel` | `o-` |
| Plantilla | `RaceLayout` | `t-` |
| Página | `race-page.js` | — |

Flujo arcade: título con carrera de demostración de fondo → Paso 1 garaje → Paso 2 pista → Paso 3 vueltas, dificultad y rivales → largada con semáforo → resultados con revancha.

## Accesibilidad

- Menús en `<dialog>` nativo, con foco en la acción principal y Escape para volver.
- Tarjetas de auto y pista como radios nativos; estadísticas como `role="meter"`.
- Una región en vivo anuncia la cuenta regresiva, las vueltas, el puesto, la última vuelta, la llegada y la pausa.
- Ajustes: sonido, música, aceleración automática, controles táctiles invertidos, vibración y movimiento reducido (sin sacudidas, inclinación ni líneas de velocidad).
- Botones táctiles de 48 px o más, con multitoque y captura de puntero.

## Diseño visual

`design/ecosistema.json` es la fuente única de paleta, zonas, libreas y contrato de sprites; `tests/design-coherence.test.js` falla si algo se desvía. Los autos usan el **acabado anime 2D v1**: la misma geometría facetada de cada modelo, con reflejos de cielo en pintura y vidrio, sombras azuladas, llantas de metal frío, tinta fina y luces traseras rojas. Los sprites salen de `design/generador/generar_sprites.py`, renderizados en siete giros y dos inclinaciones, separados en capas, recortados y empaquetados, más puntos de anclaje para ruedas, pivote y toberas. El generador comprueba contra `atlas-compatible.json` y `hojas-compatible.json` que el atlas y las hojas no cambien de contrato; `design/generador/verificar_paquete.py` valida un paquete de sprites sueltos.

El escenario usa el mismo lenguaje con acabado de **animé realista** (bloque `atmosfera` de cada zona en el ecosistema): cenit profundo y resplandor en el horizonte, nubes con volumen iluminadas por el sol o por la ciudad, sol con halo y destellos sobre el mar, luna, ventanas encendidas y haces de luz de noche, bruma de distancia, asfalto que refleja el cielo, piso mojado que refleja faroles, neón y luces traseras, sombras bajo la utilería de día, árboles y palmeras pintados con volumen, y un resplandor difuso de pantalla con destello de lente. Lo que no cambia de cuadro a cuadro (siluetas, ventanas, nubes, árboles) se pinta una vez en lienzos aparte y después solo se copia. La calidad gráfica baja sola si el equipo no sostiene unos 45 cuadros por segundo (primero el resplandor, después nubes, halo y destellos); `?calidad=alta|media|baja` la fija.

Las decisiones de arquitectura están en [`docs/decisiones.md`](docs/decisiones.md) y el estado del trabajo en [`docs/progreso.md`](docs/progreso.md).
