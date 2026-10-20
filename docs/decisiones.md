# Decisiones de arquitectura

## 1. Clean Architecture con dominio funcional

**Contexto.** La primera versión tenía física, dibujo, entrada y menús en un solo archivo. Cualquier cambio podía romper cualquier cosa y nada se podía probar sin un navegador.

**Decisión.** Cuatro capas con la regla de dependencias apuntando al dominio. El dominio es un conjunto de funciones puras sobre estado inmutable: `estado + controles + dt → estado + eventos`.

**Consecuencias.** El dominio se prueba en milisegundos con Node, sin navegador. Una prueba de arquitectura impide que la regla se erosione. El costo es un poco de asignación de memoria por cuadro, irrelevante con 140 autos.

## 2. Motor en JavaScript, no en C++

**Contexto.** Se evaluó escribir el motor de lógica en C++ y compilarlo a WebAssembly.

**Decisión.** JavaScript.

**Razones.**
- La simulación cuesta microsegundos por cuadro. El tiempo de cada cuadro se va en dibujar el canvas, y C++ no acelera ese dibujo.
- WebAssembly agregaría un paso de compilación (Emscripten) y un límite entre lenguajes que hay que serializar en cada cuadro.
- GitHub Pages hoy publica el repositorio tal cual; con C++ habría que compilar antes de cada publicación.

**Cuándo revisarla.** C++ tiene sentido si el mismo motor va a correr en una app nativa (iOS con interoperabilidad Swift–C++, Android vía NDK). El dominio ya está aislado detrás de `stepRace` y sus pruebas describen el contrato. Portarlo implica reescribir `src/domain/` en C++, traducir las pruebas y cambiar solo `application/race-session.js` para que llame al módulo WebAssembly.

## 3. Sin dependencias en producción

**Decisión.** Ni framework de UI ni bundler. Módulos ES nativos y una función `h()` de 20 líneas para crear elementos.

**Consecuencias.** Cero pasos de compilación, cero actualizaciones de seguridad de terceros en lo que llega al jugador. Playwright y axe-core son dependencias de desarrollo y solo corren en CI.

## 4. Atomic Design con componentes de función

**Decisión.** Cada componente es una función que devuelve su elemento y, si hace falta, métodos para actualizarlo (`set`, `update`). Los niveles se reflejan en carpetas y en prefijos CSS.

**Consecuencias.** Los componentes no conocen el juego. La página es la única pieza que traduce eventos de la sesión en interfaz, y los organismos reciben callbacks.

## 5. Coherencia visual verificada por pruebas

**Decisión.** `design/ecosistema.json` es la fuente única de colores, zonas y libreas. Una prueba compara contra él la configuración del juego, los tokens CSS y el atlas de sprites.

**Consecuencias.** Un cambio de color hecho a mano en el código, o una librea sin sprites, rompe la build en lugar de llegar a producción.

## 6. Selección de auto y pista

**Contexto.** Elegir auto y pista solo tiene sentido si la elección cambia la carrera. Un cambio cosmético no justifica una pantalla.

**Decisión.**
- Cada auto define un rendimiento que ajusta la física del jugador: velocidad máxima, aceleración, giro, agarre en curva y cuánta velocidad conserva al chocar.
- Cada pista combina un trazado propio con una zona del ecosistema.
- La mejor vuelta se guarda por par de pista y auto.

**Consecuencias.**
- El rendimiento se valida en el dominio (`vehiclePerformance`) y nunca toca el tráfico, así que la dificultad de la pista no depende del auto elegido.
- La sesión reconstruye el mundo solo mientras la carrera espera la largada. Una selección pendiente se aplica al salir al menú.
- Las estadísticas de 1 a 5 se derivan del rendimiento, así que retocar un auto actualiza su tarjeta sin editar textos.

## 7. Física real dentro de la perspectiva pseudo-3D

**Contexto.** El pedido de la v3 fue física realista, circuitos completos y saltos con propulsores, manteniendo la cámara detrás del auto (decisión del usuario frente a pasar a vista cenital).

**Decisión.** El auto se simula con un modelo de bicicleta en coordenadas de pista (distancia, desplazamiento lateral, rumbo relativo), con neumáticos tipo Pacejka, transferencia de carga y un eje vertical con vuelos y aterrizajes. La pista tiene geometría real (curvas con clotoides, cierre exacto) y el dibujo usa la curvatura real para curvar la ruta.

**Consecuencias.** La guiñada se limita a ±37° porque la cámara siempre mira hacia adelante y no hay cuadros del auto cruzado. El paso es fijo a 1/120 s dentro de `stepRace`. Las ayudas reservan agarre lateral según la deriva de cada neumático, para que un 4x4 potente no se vaya de largo.

## 8. Rivales con IA en lugar de tráfico

**Decisión.** El tráfico se reemplazó por rivales que corren con la misma física: línea de carrera por relajación de curvatura, velocidad objetivo por agarre y frenada, persecución pura y propulsores en los saltos. La dificultad cambia su ritmo, las ayudas del jugador y su lugar en la grilla.

**Consecuencias.** Hay vueltas, posiciones, llegada y resultados. Una carrera de 8 autos cuesta ~0,1 ms por cuadro, así que la demostración de fondo del título es gratis.

## 9. Sprites por capas para que la suspensión se vea

**Decisión.** El generador renderiza carrocería, ruedas, luz de freno y la parte de las ruedas que tapa a la carrocería por separado, recorta cada capa y exporta puntos de anclaje. El juego mueve y rota la carrocería sobre las ruedas según la suspensión.

**Consecuencias.** Las hojas pesan menos que antes (recortes en lugar de cuadros completos) aunque haya un auto más.

## 10. Sonido grabado CC0 y síntesis granular

**Decisión.** Los motores y efectos salen de grabaciones de dominio público (BigSoundBank y Kenney), procesadas por `tools/audio/preparar_sonidos.py`. Cada motor es una aceleración real con su mapa de tono; el juego toca granos del punto que corresponde a las RPM. Sintetizados quedan los pitidos, la música, el zumbido de cordón, el petardeo y la reverberación.

**Consecuencias.** Banco de 1,8 MB. Bucles en WAV (cortes exactos sin clic) y efectos en M4A (los lee cualquier navegador). Créditos en `assets/audio/CREDITOS.md`.

## 11. Versión de un solo archivo con empaquetador propio

**Contexto.** Los módulos ES no cargan desde `file://`, así que el juego no abría con doble clic.

**Decisión.** `tools/empaquetar.mjs` convierte los módulos en funciones encadenadas en orden de dependencias, incrusta los estilos y embebe sprites, retratos y sonidos como data URI. No suma dependencias: el código usa pocas formas de `import`/`export` y el empaquetador corta con un error claro ante cualquier otra.

**Consecuencias.** `dist/autodromo.html` (7,7 MB) abre en cualquier navegador sin servidor; `dist/artifact.html` es la misma página sin `<html>`/`<head>`/`<body>` para publicarla. El desarrollo sigue sin paso de compilación.

## 12. Acabado anime 2D para los autos

**Contexto.** El usuario aportó un paquete (`autodromo-anime-v1.zip`) con los mismos 613 recortes, el mismo atlas byte a byte y hojas del mismo tamaño, pero con otro acabado: reflejos de cielo, sombras azules, llantas frías, tinta fina y traseras rojas.

**Decisión.** Se adoptó entero: hojas, atlas, retratos, ecosistema y generador nuevo. Antes se respaldó el arte anterior en `respaldo/sprites-v3-antes-anime.zip` y se verificó el paquete con un chequeo propio (cada recorte idéntico a su hoja). El juego no cambió de lógica: solo se alinearon los colores de muestra de las libreas con el ecosistema nuevo y el halo nocturno de las luces traseras pasó de ámbar a rojo.

**Consecuencias.** El ecosistema nuevo ya no trae las listas de patrones y decisiones de la versión 1.0; quedan en el respaldo. No hay que regenerar con el generador anterior, porque revertiría el acabado.

## 13. Física suave y paso fijo con interpolación

**Contexto.** La telemetría mostró tirones fuertes (pedales y empuje de todo o nada, el empuje parpadeando al vaciarse), autos que se cruzaban al frenar derecho (neumáticos neutros y freno trasero sin repartidor) y una física que avanzaba con pasos de tamaño variable según los cuadros por segundo.

**Decisión.** Mandos con recorrido (pedales, volante con inercia, propulsores con rampa y traba), repartidor de frenada y neumáticos con sensibilidad a la carga; IA con línea interpolada, histéresis y espacio lateral. La física avanza a paso fijo (1/120 s) y lo que se dibuja se interpola entre el paso anterior y el actual.

**Consecuencias.** Movimiento igual de parejo a cualquier frecuencia de pantalla y autos estables; `tools/telemetria.mjs` permite medir cualquier ajuste futuro.

## 14. Escenario con acabado de animé realista

**Contexto.** Los autos ya tenían acabado anime; el escenario seguía plano.

**Decisión.** Cada zona suma un bloque `atmosfera` en el ecosistema (cenit, resplandor, bruma, nubes, sol, mar, luna, ventanas, haces, brillo del asfalto y piso mojado), probado contra `src/config/zones.js`. Lo estático se pinta una vez en lienzos aparte y recortados a su contenido. El resplandor de pantalla se arma con copias chicas multiplicadas por sí mismas, sin filtros del navegador. Una calidad automática baja los efectos si el equipo no llega.

**Consecuencias.** El escenario cuesta más que antes en equipos sin GPU (en el navegador de prueba sin GPU, de unos 18 a unos 60 ms por cuadro en calidad alta y unos 28 en baja); la calidad automática lo compensa. El chirrido de neumáticos pasó a sintetizarse (la grabación anterior era un silbido agudo que subía y bajaba).
