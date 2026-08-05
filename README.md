# Vectorizador Pro — Free Animation Power

> **Documentacion Tecnica**: [Informe Tecnico Free Vector Image](informes_pdf/06_Free_Vector_Image.pdf) — Documento completo de arquitectura, pipeline de vectorizacion VTracer WASM, sistema de filtros y especificaciones tecnicas.

> **Accede directamente**: [freeanimationpower.org/tools/vector/](https://freeanimationpower.org/tools/vector/) — Vectoriza imagenes sin instalar nada.

<img width="1254" height="1254" alt="free vector images" src="https://github.com/user-attachments/assets/a83e2673-5e35-4391-a524-7f052a1cbbec" />




Herramienta web **100% Client-Side** para convertir imágenes rasterizadas (PNG, JPG, WebP) a vectores escalables (SVG, EPS) y PNG. Motor de vectorización VTracer WebAssembly + SVGO post-procesador + ImageTracer fallback. Diseño FAP corporativo (#ffdc00 / #ff4200).

---

## Tabla de Contenidos

1. [Historial Completo del Proyecto](#historial-completo-del-proyecto)
2. [Fase 5 — Refactorización 2026](#fase-5--refactorización-2026)
3. [Arquitectura Final](#arquitectura-final)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Módulos — Documentación Técnica](#módulos--documentación-técnica)
6. [Pipeline de Vectorización](#pipeline-de-vectorización)
7. [Sistema de Zoom + Pan](#sistema-de-zoom--pan)
8. [Sistema de Filtros](#sistema-de-filtros)
9. [Motor VTracer WebAssembly](#motor-vtracer-webassembly)
10. [Exportación EPS Off-Thread](#exportación-eps-off-thread)
11. [Guía de Uso](#guía-de-uso)
12. [Problemas Conocidos y Diagnóstico](#problemas-conocidos-y-diagnóstico)
13. [Changelog](#changelog)
14. [Licencias](#licencias)

---

## Historial Completo del Proyecto

### Fase 0 — Idea Original (MVP)

Un único archivo `vectorizador.html` con ImageTracer.js vía CDN:
- Pre-procesamiento Canvas (resize ≤2048px)
- Suavizado vía `ltres`/`qtres` (Ramer-Douglas-Peucker)
- Tolerancia de color (`numberofcolors`)
- Exportación solo SVG
- Tema oscuro con acento naranja (#ff6b00)

### Fase 1 — Modularización + Filtros + Exportación

División en 8 módulos JS independientes:
- `main.js` — orquestador
- `imageLoader.js` — file picker, drag & drop, clipboard
- `preprocessor.js` — resize + renderizado Canvas
- `filters.js` — BN (threshold), Grises (ITU-R BT.601), Posterizar (cuantización), Color
- `vectorizer.js` — wrapper ImageTracer.js
- `renderer.js` — vista dual Canvas + SVG
- `exporter.js` — SVG, PNG (1x/2x/4x), EPS (conversor propio SVG→PostScript)
- `utils.js` — debounce, countNodes, countPaths, hexToRGB

### Fase 2 — Experimento AI Optimizer (DESECHADO)

Módulo `aiOptimizer.js` que enviaba el SVG crudo a la API de DeepSeek para refactorización semántica vía system prompt de diseño. El usuario ingresaba su propia API Key.

**Motivo del desecho:** Fricción para el usuario (cuenta + API key + créditos). Dependencia de servicio externo de pago. Rompía el principio "100% Client-Side autónomo".

### Fase 3 — Investigación de Motores de Vectorización

Análisis profundo de código fuente de 4 arquitecturas:

**ImageTracer.js (v1.2.6, 1217 líneas)** — 9 fallas estructurales identificadas:
1. Solo inicia trazado en tipos de borde 4 y 11 (ignora 12 de 16 configuraciones)
2. Cuantización a 8 direcciones en `internodes()` — artefactos de escalera
3. Interpolación solo en punto medio — compone error de cuantización
4. Proyección algebraica de punto de control en 1 sola pasada — sin refinamiento
5. Solo Bézier cuadrática (Q) — curvas complejas necesitan muchos segmentos
6. Split en fitpoint, no en errorpoint — divide en punto sub-óptimo
7. Sin detección de esquinas — trata todo uniformemente
8. Trazado independiente por capa de color — gaps/overlaps entre regiones
9. Sin optimización de salida SVG

**VTracer (visioncortex/vtracer, 6,500 ⭐)** — Rust → WASM:
- Cubic Bézier Splines con least-squares iterativo
- Detección de esquinas por ángulo momentáneo
- Modo Mosaic: BoundaryGraph con ajuste único por borde → cero costuras
- Modo binario con Bradley-Roth adaptativo (Summed Area Table O(n))
- O(n) total vs O(n²) de ImageTracer
- API: `vectorize_rgba(data, width, height, options)` — acepta ImageData directo

**SVGO (svg/svgo, 21,000 ⭐)** — post-procesador:
- `convertPathData`: colinealidad→L, C redundante→Q, shorthands S/T/H/V, floatPrecision
- `mergePaths` (force:true): fusiona paths del mismo color aunque solapen
- `collapseGroups`: aplana `<g>` innecesarios
- `multipass: true`: re-ejecución expone nuevas optimizaciones

**Vectorizer.AI (SaaS propietario)** — NO open-source:
- Redes neuronales propietarias entrenadas con dataset propio
- Deep Learning + Computer Vision clásico (híbrido)
- 15+ años de iteración (desde Vector Magic en Stanford, 2007)
- Procesamiento server-side con GPUs

### Fase 4 — Pipeline Unificado VTracer + SVGO + ImageTracer fallback

Arquitectura híbrida:
1. VTracer WASM como motor principal (601 KB)
2. SVGO como post-procesador (914 KB, carga async)
3. ImageTracer.js como fallback automático (47 KB) si WASM no carga
4. Gaussian Blur selectivo (kernel 3×3, diferencia Manhattan < 20)
5. Parámetros VTracer: mode (spline/polygon/pixel), hierarchical (mosaic/stacked), cornerThreshold, maxIterations, filterSpeckle, colorPrecision
6. Parámetros ImageTracer: smoothness, colorLayers, minPathSize

### Fase 5 — Web Worker + ES Modules + Debug

Refactorización completa a ES Modules con Web Worker:
- **Main thread** solo maneja UI, DOM, y `postMessage` al worker
- **Worker** ejecuta todo el pipeline sin bloquear la UI
- **Transferable ImageData**: zero-copy del buffer al worker
- **Memoria WASM**: `free(inputPtr)` + `free(outputPtr)` explícito en `finally{}`
- **Sistema Debug**: módulo `debug.js` con instrumentación en todas las etapas + panel visual
- **Zoom independiente**: cada panel (Original/Vector) con controles dedicados `[-] [+] ⌂` + wheel scroll
- **14 archivos** reescritos/creados, `aiOptimizer.js` y `vectorizer.js` eliminados

### Refactorización 2026 — Fase 5 Definitiva

Corrección de 3 cuellos de botella críticos y 4 bugs de memoria WASM, más rediseño UI completo:

#### Corrección del Vector Recortado (Padding Perimetral)

**Problema**: Las curvas Bézier cúbicas en los bordes de la imagen se recortaban porque VTracer no tenía margen para extender puntos de control.

**Solución**: `processImageData()` en `preprocessor.js` añade padding transparente proporcional a la resolución:
```
PADDING = max(4, ceil(max(width, height) / 256))
```
- 256px → 4px padding lateral
- 1024px → 4px padding
- 2048px → 8px padding

El padding expande el `ImageData` (width+PADDING×2, height+PADDING×2) con píxeles `rgba(0,0,0,0)` perimetrales. VTracer recibe la imagen expandida y genera paths con espacio para curvas en bordes. El viewBox se ajusta al final del pipeline para mostrar solo el área original.

#### Optimización del Gaussian Blur (`_selectiveBlur3x3`)

Reescrito con `Uint32Array` para lecturas de 32 bits aceleradas:
```js
const copy32 = new Uint32Array(copy.buffer);  // 1 lectura = 1 píxel completo
const out32  = new Uint32Array(data.buffer);   // mutación directa empaquetada
// Desempaquetado bitwise: R = px & 0xFF, G = (px >> 8) & 0xFF, B = (px >> 16) & 0xFF
// Empaquetado: out32[idx] = (A << 24) | (B << 16) | (G << 8) | R
```
Reduce de 4 lecturas de 8 bits por píxel vecino a 1 lectura de 32 bits. División con `| 0` para truncado entero sin `Math.floor`.

#### Conversor EPS en Web Worker (Off-Thread)

Movido `_svgToEPS` + `_convertPathToPS` de `exporter.js` al worker para evitar bloquear la UI (strings PostScript complejos consumían muchos ciclos de CPU en Main Thread).

- La conversión usa **Regex de doble pase** en vez de `DOMParser` (no disponible en Workers)
- Soporta `fill` vía atributo directo y vía `style="fill:#xxx"`
- Filtra `fill="none"` y `opacity="0"`
- Maneja los 14 comandos SVG (M/m, L/l, H/h, V/v, C/c, Q/q, S/s, T/t, A/a, Z/z) con inversión `height - y`
- Flujo: `main.js` → `worker.postMessage({type:'export-eps'})` → worker convierte → `postMessage({type:'eps-result'})` → main descarga

#### Fixes de Memoria WASM

| Bug | Archivo | Descripción | Fix |
|-----|---------|-------------|-----|
| Cache `Uint8Array` stale | `vtracerBridge.js` | La vista cacheada de memoria WASM no se invalidaba tras `memory.grow` | Alineado con patrón robusto de `_getDataViewMemory0()`: chequeo `buffer.detached` + comparación de buffers |
| Copia innecesaria 16MB | `vtracerBridge.js` | `Uint8ClampedArray` no es `instanceof Uint8Array` → se clonaba completo | Añadido `|| rgba instanceof Uint8ClampedArray` |
| `malloc` sin chequeo | `vtracerBridge.js` | `malloc` podía retornar 0 (NULL) → escritura en dirección 0 corrompía heap | `throw` si `ptr === 0 && arg.length > 0` |
| `console.warn` sin `throw` | `preprocessor.js` | Mismatch dimensional solo advertía, no abortaba | Cambiado a `throw new Error` |

#### Worker Recreation (One-Shot VTracer)

VTracer WASM (alpha.1) corrompe su estado interno tras la primera llamada. La segunda vectorización produce `memory access out of bounds`.

**Solución**: Cada vectorización usa un worker fresco. `_createWorker()` termina el worker anterior y crea uno nuevo. Se llama automáticamente tras `result` o `error`.

#### Parámetros VTracer Seguros

Defaults reducidos para evitar `OOM` en imágenes a color:
```
colorPrecision: 3 (antes 6, 512 colores vs 262K)
hierarchical: stacked (antes cutout)
maxIterations: 2 (antes 10)
layerDifference: 32 (antes 16)
```

#### Protección de Canvas Post-Transfer

Tras `postMessage(imageData, [imageData.data.buffer])`, el buffer queda **neutered** en Main Thread. `_repaintCanvas()` redibuja exclusivamente desde `state.image` (HTMLImageElement cacheado), nunca toca el buffer transferido.

#### Zoom + Pan (Hand Tool)

Arrastre con clic sostenido (estilo H de Photoshop) en ambos paneles:
- `transform: translate(panX px, panY px) scale(level)` — pan en screen pixels, no escalado por zoom
- Transición CSS suprimida durante drag para respuesta instantánea
- Cursor `grab` / `grabbing`
- Botón Reset restablece zoom + posición

#### Rediseño UI — Identidad FAP

- Paleta: fondo `#ffdc00`, acento `#ff4200`, superficies blancas, header negro
- Fuentes: Outfit + Plus Jakarta Sans (Google Fonts)
- Logo corporativo en header con link a `freeanimationpower.org`
- Sin emojis, diseño minimalista
- Etiquetas de panel con fondo negro y texto naranja

#### MAX_SIZE Dinámico

Reducido a `1024` (desde 2048) para evitar OOM en VTracer. El padding se suma después, resultando en máximo 1032 px por dimensión.

---

## Arquitectura Final — Fase 5

```
┌── MAIN THREAD ────────────────────────────────────────┐
│  index.html                                           │
│    <link rel="preload" href="lib/svgo/svgo.browser.js"│
│          as="script">                                 │
│    <link rel="preload" href="lib/vtracer/vtracer.wasm" │
│          as="fetch" crossorigin="anonymous">            │
│    <script type="module" src="js/main.js">  ◄── ÚNICO │
│                                                       │
│  main.js (ES Module)                                  │
│    ├── import renderSource (preprocessor.js)           │
│    ├── import initImageLoader (imageLoader.js)         │
│    ├── import displaySource/Vector/showEmpty (renderer)│
│    ├── import downloadSVG/PNG/EPS (exporter.js)        │
│    └── import Debug (debug.js)                         │
│                                                       │
│    const worker = new Worker('js/worker.js',           │
│                               { type: 'module' });    │
│                                                       │
│    postMessage(imageData, [imageData.data.buffer])     │
│    ──► Transferable zero-copy (O(1))                  │
└───────────────────────────────────────────────────────┘
        │  postMessage         ▲ onmessage
        │  type:'vectorize'    │ type:'ready'|'result'|'error'
        ▼                     │
┌── WEB WORKER ─────────────────────────────────────────┐
│  worker.js (Module Worker)                            │
│    ├── import loadVTracer, vectorizePixels             │
│    │         (vtracerBridge.js)                        │
│    ├── import processImageData (preprocessor.js)       │
│    ├── import GeometryDetector (geometryDetector.js)   │
│    ├── import countNodes, countPaths (utils.js)        │
│    └── import Debug (debug.js)                         │
│                                                       │
│  INIT (async):                                        │
│    ├── await loadVTracer('../lib/vtracer/vtracer.wasm')│
│    ├── await import('../lib/svgo/svgo.browser.js')     │
│    └── postMessage({ type: 'ready', engine, svgo })   │
│                                                       │
│  PIPELINE (onmessage 'vectorize'):                    │
│    ImageData (transferido, propiedad del worker)       │
│      → Debug.checkImageData()                          │
│      → processImageData() [filters + blur in-place]   │
│      → Debug.checkDims()                               │
│      → if cancelled: return                            │
│      → vectorizePixels() [VTracer WASM]               │
│        ├── malloc(inputPtr) + copy RGBA                │
│        ├── wasm.vectorize_rgba(ptr, len, w, h, opts)  │
│        ├── getStringFromWasm0(outPtr, outLen)          │
│        ├── free(outputPtr)                             │
│        └── free(inputPtr) ← GARANTIZADO (finally)     │
│      → if cancelled: return                            │
│      → GeometryDetector.detect(svg) [passthrough]     │
│      → SVGO optimize(svg) [multipass, mergePaths force]│
│      → postMessage({ type: 'result', svg, stats })    │
│                                                       │
│  FALLBACK (si VTracer no cargó):                      │
│      → fetch('../lib/imagetracer.js')                  │
│      → new Function(code)()                            │
│      → ImageTracer.imagedataToSVG({data}, opts)       │
│      → SVGO optimize                                   │
└────────────────────────────────────────────────────────┘
```

---

## Estructura del Proyecto

```
vectorizador/
├── index.html                        (13.7 KB)  HTML con preloads + 1 script
├── README.md                                    Este documento
├── css/
│   └── styles.css                    (14.2 KB)  Dark Mode + zoom + debug
├── js/
│   ├── main.js                       (15.5 KB)  ES Module — Worker orchestrator
│   ├── worker.js                     (7.9 KB)   Module Worker — pipeline
│   ├── vtracerBridge.js              (14.4 KB)  ES Module — WASM bridge
│   ├── preprocessor.js               (4.5 KB)   ES Module — in-place + canvas
│   ├── filters.js                    (1.7 KB)   ES Module — pixel filters
│   ├── svgOptimizer.js               (1.4 KB)   ES Module — SVGO wrapper
│   ├── utils.js                      (1.1 KB)   ES Module — pure helpers
│   ├── geometryDetector.js           (4.0 KB)   ES Module — Fase 5 skeleton
│   ├── renderer.js                   (0.7 KB)   ES Module — DOM display
│   ├── imageLoader.js                (2.0 KB)   ES Module — file/drag/clipboard
│   ├── exporter.js                   (9.9 KB)   ES Module — SVG/PNG/EPS
│   └── debug.js                      (4.1 KB)   ES Module — instrumentation
├── lib/
│   ├── vtracer/
│   │   └── vtracer.wasm              (601 KB)   VTracer 1.0-alpha WebAssembly
│   ├── svgo/
│   │   └── svgo.browser.js           (914 KB)   SVGO v3 browser bundle
│   └── imagetracer.js                (47 KB)    ImageTracer v1.2.6 fallback
└── (eliminados)
    ├── js/aiOptimizer.js                         Desechado en Fase 2
    └── js/vectorizer.js                          Reemplazado por worker.js
```

---

## Módulos — Documentación Técnica Completa

### `index.html`

Estructura semántica con 4 secciones principales:

| Elemento | ID / Clase | Propósito |
|---|---|---|
| `<header>` | `.header` | Logo FAP + badge del motor activo (VTracer WASM / ImageTracer / Cargando) |
| `<aside>` | `.sidebar` | 5 secciones colapsables: Importar, Estilos, Motor, Exportar, Debug |
| `<main>` | `.workspace` | Vista dual con zoom independiente |
| `<div>` | `.view-panel` (×2) | Panel izquierdo (Original) + Panel derecho (Vector SVG) |

**Secciones de la Sidebar:**

| Sección | Contenido |
|---|---|
| **Importar Imagen** | Zona drag & drop `#uploadZone` + `<input type="file">` oculto |
| **Estilo de Imagen** | Grid 2×2 filtros (Color/B&N/Grises/Posterizar) + sliders condicionales (umbral BN, niveles posterizar) + checkbox Gaussian Blur |
| **Motor de Vectorización** | Selector de modo (Spline/Polygon/Pixel) + composición (Mosaic/Stacked) + 6 sliders VTracer. Sliders ImageTracer (visibles solo en fallback). Botón Vectorizar + loader + stats bar (Nodos/Trazos/Tiempo) |
| **Exportar** | Selector formato (SVG/PNG/EPS) + resolución PNG (1x/2x/4x) + botón Descargar |
| **Debug Pipeline** | Panel de diagnóstico: Motor, Canvas, Transfer, Preprocess, VTracer, SVGO, Result + log en vivo |

**Preloads en `<head>`:**
```html
<link rel="preload" href="lib/svgo/svgo.browser.js" as="script">
<link rel="preload" href="lib/vtracer/vtracer.wasm" as="fetch" crossorigin="anonymous">
```

**Script único:**
```html
<script type="module" src="js/main.js"></script>
```

---

### `css/styles.css`

Sistema de diseño Dark Mode con variables CSS. 557 líneas.

**Paleta de Colores:**
```css
--bg-color: #0d0d0d;       /* Fondo principal */
--panel-bg: #161616;       /* Sidebar + header */
--surface-bg: #1e1e1e;     /* Cards, inputs */
--border-color: #2a2a2a;   /* Bordes */
--text-main: #e8e8e8;      /* Texto principal */
--text-muted: #888;        /* Labels */
--accent: #ff6b00;         /* Naranja FAP */
--accent-hover: #ff8533;
--accent-glow: rgba(255,107,0,0.15);
--green: #28a745;          /* Botón descarga */
```

**Componentes estilizados:**
- Upload zone con borde dashed + hover naranja + glow
- Filter buttons en grid 2×2 con estado activo naranja sólido
- Sliders con thumb circular naranja + track gris
- Section headers colapsables con flecha rotante
- Loader con spinner CSS animado
- Stats bar con 3 columnas de valores naranja
- Engine badge con 3 estados: `loading` (pulso gris), `vtracer` (naranja), `fallback` (amarillo)
- Zoom bar con backdrop-blur, botones circulares, hover naranja
- Debug panel con fuente monospace, colores semáforo (verde/rojo/amarillo)
- Resolution options con estado activo naranja
- Checkbox con accent-color naranja
- Scrollbars custom 6px

---

### `js/main.js`

**Orquestador del main thread.** ES Module, 324 líneas. Sin lógica de vectorización.

**Estado Global:**
```javascript
const state = {
    image: null,              // HTMLImageElement
    imageName: 'imagen',      // Nombre base del archivo
    svgCode: null,            // SVG generado (post-worker)
    engine: null,             // 'vtracer' | 'imagetracer' (seteado por worker)
    svgoReady: false,         // SVGO cargado en worker
    isProcessing: false,      // Previene doble click
    activeFilter: 'color',    // color | bw | grayscale | posterize
    useGaussianBlur: false,   // Checkbox
    filterParams: { threshold: 128, levels: 4 },
    vtracerParams: {          // Enviados al worker
        mode: 'spline', hierarchical: 'cutout',
        cornerThreshold: 60, maxIterations: 10,
        filterSpeckle: 4, colorPrecision: 6,
        spliceThreshold: 45, lengthThreshold: 4.0,
        layerDifference: 16, pathPrecision: 3,
        optimize: 2
    },
    imagetracerParams: { smoothness: 5, colorLayers: 30, minPathSize: 8 },
    exportScale: 1
};
```

**Worker Communication:**
```javascript
const worker = new Worker('js/worker.js', { type: 'module' });

// MAIN → WORKER
worker.postMessage({
    type: 'vectorize',
    imageData,          // ImageData del canvas
    options: { ... }
}, [imageData.data.buffer]);  // ← Transferable (zero-copy)

// WORKER → MAIN
worker.onmessage → {
    type: 'ready'    → actualizar badge + UI
    type: 'progress' → mostrar loader
    type: 'result'   → displayVector() + stats
    type: 'error'    → alert + reset UI
}
```

**Flujo handleVectorize():**
1. `ctx.getImageData()` → extraer ImageData del canvas
2. `Debug.checkImageData('canvas-extract', imageData)` — validar dimensiones
3. `worker.postMessage(imageData, [imageData.data.buffer])` — transferir buffer
4. `_repaintCanvas()` — redibujar canvas (buffer fue neutered)
5. `Debug.checkImageData('canvas-repaint', afterData)` — validar post-repintado

**Flujo handleImageLoaded(img, filename):**
1. Guardar `state.image = img`
2. `state.svgCode = null`
3. `_repaintCanvas()` — dibujar imagen en canvas con filtro activo
4. `showEmpty(svgContainer, 'Presiona Vectorizar...')`

**Sistema Zoom (independiente por panel):**
```javascript
const zoom = {
    source: { level: 1.0 },
    vector: { level: 1.0 }
};

function initZoom() {
    // Botones: data-panel + data-action (in/out/reset)
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            zoom[panel].level *= (action === 'in' ? 1.3 : 1/1.3);
            _applyZoom(panel);
        });
    });

    // Wheel scroll por panel (passive: false para preventDefault)
    document.getElementById('sourcePanel').addEventListener('wheel', ...);
    document.getElementById('vectorPanel').addEventListener('wheel', ...);
}

function _applyZoom(panel) {
    const level = zoom[panel].level;
    wrapper.style.transform = `scale(${level})`;
    valEl.textContent = Math.round(level * 100) + '%';
}
```

**Debug Panel:**
```javascript
function _updateDebugPanel() {
    // Actualiza filas: Motor, Canvas, Transfer, Result
    // Colores semáforo: ok (verde), fail (rojo), warn (amarillo)
}

function _updateDebugLog() {
    // Últimas 10 entradas del Debug._logs en orden inverso
}

Debug.onLog(() => {
    // Reacciona a eventos específicos (canvas-extract, TRANSFERRED, RESULT)
    // Actualiza las filas correspondientes del panel
});
```

**Funciones UI:**
- `initSidebar()` — collapse headers, filter buttons, 9 sliders con bindings
- `initExport()` — resolution selector, format selector, download button
- `_updateUI()` — toggle vtracer/imagetracer params, bw/posterize sliders, button states
- `_onFilterChange()` — repinta canvas, limpia SVG, muestra empty state
- `_updateEngineBadge()` — 3 estados: loading (pulso), vtracer (naranja), imagetracer (amarillo)

---

### `js/worker.js`

**Module Worker.** 185 líneas. Pipeline completo sin acceso a DOM.

**Imports:**
```javascript
import { loadVTracer, vectorizePixels } from './vtracerBridge.js';
import { processImageData } from './preprocessor.js';
import { GeometryDetector } from './geometryDetector.js';
import { countNodes, countPaths } from './utils.js';
import { Debug } from './debug.js';
```

**Estado Interno:**
```javascript
let svgoModule   = null;
let svgoReady    = false;
let vtracerReady = false;
let engine       = 'imagetracer';
let cancelled    = false;
```

**Inicialización Asíncrona:**
```javascript
(async function init() {
    Debug.log('worker-init', { label: 'INIT START' });

    const vtracerP = loadVTracer('../lib/vtracer/vtracer.wasm')
        .then(() => { vtracerReady = true; engine = 'vtracer'; })
        .catch(err => { Debug.log('worker-init', { error: true, msg: err.message }); });

    const svgoP = import('../lib/svgo/svgo.browser.js')
        .then(m => { svgoModule = m; svgoReady = true; })
        .catch(err => { Debug.log('worker-init', { error: true, msg: err.message }); });

    await Promise.allSettled([vtracerP, svgoP]);
    Debug.log('worker-init', { label: 'READY', engine, svgo: svgoReady });
    self.postMessage({ type: 'ready', engine, svgoReady });
})();
```

**Pipeline en onmessage:**
```
1. Debug.checkImageData('worker-received', imageData)
2. processImageData(imageData, options) → in-place mutation
3. Debug.checkDims('worker-processed', data, w, h)
4. if cancelled: return
5. a) VTracer: vectorizePixels(data, w, h, vtOpts)
   b) Fallback: _imageTracerFallback(processed, options)
6. if cancelled: return
7. GeometryDetector.detect(svg) → passthrough
8. if svgoReady: _optimizeSVG(svg)
9. postMessage({ type: 'result', svgCode, stats })
```

**Configuración VTracer (merge con defaults):**
```javascript
const vtOpts = Object.assign({
    mode: 'spline', hierarchical: 'cutout',
    filterSpeckle: 4, colorPrecision: 6,
    layerDifference: 16, cornerThreshold: 60,
    lengthThreshold: 4.0, maxIterations: 10,
    spliceThreshold: 45, pathPrecision: 3, optimize: 2
}, options.vtracerParams);
```

**SVGO Config (inline):**
```javascript
const SVGO_CONFIG = {
    multipass: true,
    plugins: [{
        name: 'preset-default',
        params: {
            overrides: {
                convertPathData: {
                    floatPrecision: 3, transformPrecision: 5,
                    straightCurves: true, convertToQ: true,
                    lineShorthands: true, curveSmoothShorthands: true,
                    convertToZ: true, collapseRepeated: true,
                    removeUseless: true, utilizeAbsolute: true
                },
                mergePaths: { force: true, floatPrecision: 3 },
                cleanupNumericValues: { floatPrecision: 3 },
                removeViewBox: false, removeDimensions: false
            }
        }
    }]
};
```

**ImageTracer Fallback:**
```javascript
async function _ensureImageTracer() {
    // Module workers no soportan importScripts()
    const res = await fetch('../lib/imagetracer.js');
    const code = await res.text();
    (new Function(code))();  // Ejecuta el script no-modular en scope global del worker
}

async function _imageTracerFallback(processed, options) {
    await _ensureImageTracer();
    return self.ImageTracer.imagedataToSVG(
        { width: processed.width, height: processed.height, data: processed.data },
        { ...options.imagetracerParams, viewbox: true }
    );
}
```

**SVGO Wrapper:**
```javascript
function _optimizeSVG(svgString) {
    try {
        const result = svgoModule.optimize(svgString, SVGO_CONFIG);
        return result.data;
    } catch (err) {
        Debug.log('svgo', { error: true, msg: err.message });
        return svgString;
    }
}
```

**Cancelación:**
```javascript
self.onmessage = function(e) {
    if (e.data.type === 'cancel') {
        cancelled = true;  // Chequeado entre cada etapa del pipeline
        return;
    }
    // ...
};
```

---

### `js/vtracerBridge.js`

**Bridge WebAssembly.** ES Module, 341 líneas. Adaptado de wasm-bindgen glue para browser.

**API Pública:**
```javascript
export async function loadVTracer(wasmPath)  // fetch + WebAssembly.instantiate
export function isReady()                     // boolean
export function vectorizePixels(rgba, w, h, options) → svgString
export function vectorizeBytes(buffer, options) → svgString
```

**Manejo de Memoria (CRÍTICO):**
```javascript
export function vectorizePixels(rgba, width, height, options) {
    const input = (rgba instanceof Uint8Array) ? rgba : new Uint8Array(rgba);
    const expectedLen = width * height * 4;

    // Validación de dimensiones
    if (input.length !== expectedLen) {
        console.error('[VTracer] Dimension mismatch: buffer=' + input.length +
                      ' expected=' + expectedLen + ' (' + width + 'x' + height + ')');
        throw new Error('Dimension mismatch');
    }

    let inputPtr = 0, inputLen = 0;
    let outputPtr = 0, outputLen = 0;

    try {
        inputPtr = _passArray8ToWasm0(input, wasm.__wbindgen_malloc);
        inputLen = WASM_VECTOR_LEN;

        const ret = wasm.vectorize_rgba(inputPtr, inputLen, width, height, options);
        outputPtr = ret[0]; outputLen = ret[1];

        if (ret[3]) {
            outputPtr = 0; outputLen = 0;
            throw _takeFromExternrefTable0(ret[2]);
        }

        return _getStringFromWasm0(outputPtr, outputLen);

    } finally {
        // LIBERAR AMBOS BUFFERS — incluso si hubo error
        if (outputPtr && outputLen) wasm.__wbindgen_free(outputPtr, outputLen, 1);
        if (inputPtr  && inputLen)  wasm.__wbindgen_free(inputPtr,  inputLen,  1);
    }
}
```

**Internas (wasm-bindgen glue, privadas al módulo):**
- `_passArray8ToWasm0(arg, malloc)` — copia Uint8Array a memoria WASM
- `_passStringToWasm0(arg, malloc, realloc)` — codifica string a WASM
- `_getStringFromWasm0(ptr, len)` — decodifica string desde WASM
- `_getUint8ArrayMemory0()` — acceso cacheado al buffer de memoria lineal
- `_getDataViewMemory0()` — DataView cacheado (maneja buffer detached)
- `_decodeText(ptr, len)` — TextDecoder sobre subarray
- `_takeFromExternrefTable0(idx)` — extrae y dealloc del externref table
- `_handleError(f, args)` — wrapper try/catch para callbacks WASM
- `_getImports()` — objeto de imports para `WebAssembly.instantiate`

**Origen del WASM:**
Extraído del paquete npm `@visioncortex/vtracer@1.0.0-alpha.1`:
```bash
npm pack @visioncortex/vtracer@1.0.0-alpha.1
tar -xzf visioncortex-vtracer-1.0.0-alpha.1.tgz
cp package/pkg/vtracer_wasm_bg.wasm lib/vtracer/vtracer.wasm
```

El glue code original usaba `require('fs').readFileSync()` (Node.js). Se adaptó a `fetch()` + `WebAssembly.instantiate()` para browser.

---

### `js/preprocessor.js`

**Pre-procesamiento de imagen.** ES Module, 110 líneas.

**Dos APIs:**

**Worker API — puro array, sin Canvas:**
```javascript
export function processImageData(imageData, options) {
    const { filterType, filterParams, useGaussianBlur } = options;
    const { width, height, data } = imageData;

    // Validación
    if (!data || data.length === 0 || width === 0 || height === 0) {
        throw new Error('ImageData invalido: dimensiones o buffer vacio');
    }
    if (data.length !== width * height * 4) {
        console.warn('[Preprocessor] Dimension mismatch');
    }

    // Filtro (in-place sobre el buffer transferido — NO se clona)
    if (filterType && filterType !== 'color') {
        applyFilter({ data, width, height }, filterType, filterParams || {});
    }

    // Gaussian Blur selectivo
    if (useGaussianBlur) {
        _selectiveBlur3x3(data, width, height, 20);
    }

    return { width, height, data };
}
```

**Main Thread API — Canvas para UI:**
```javascript
export function renderSource(img, canvas, filterType, filterParams, useGaussianBlur) {
    const dims = _computeDimensions(img);
    canvas.width = dims.width; canvas.height = dims.height;

    ctx.clearRect(0, 0, dims.width, dims.height);
    ctx.drawImage(img, 0, 0, dims.width, dims.height);

    if (filterType !== 'color') {
        const imageData = ctx.getImageData(0, 0, dims.width, dims.height);
        applyFilter(imageData, filterType, filterParams);
        ctx.putImageData(imageData, 0, 0);
    }

    if (useGaussianBlur) {
        const imageData = ctx.getImageData(0, 0, dims.width, dims.height);
        if (imageData && imageData.data.length === dims.width * dims.height * 4) {
            _selectiveBlur3x3(imageData.data, dims.width, dims.height, 20);
            ctx.putImageData(imageData, 0, 0);
        }
    }

    return canvas.toDataURL('image/png');
}
```

**Redimensión Proporcional:**
```javascript
function _computeDimensions(img) {
    let w = img.width, h = img.height;
    if (w > MAX_SIZE || h > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
    }
    return { width: w, height: h };
}
```

**Gaussian Blur Selectivo (kernel 3×3):**
```javascript
function _selectiveBlur3x3(data, width, height, delta) {
    const copy = new Uint8ClampedArray(data);
    const stride = width * 4;

    for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
            // Promediar kernel 3×3
            // Diferencia Manhattan entre píxel original y promedio
            // Si diff < delta → aplicar blur (suavizar ruido)
            // Si diff ≥ delta → preservar (es un borde)
        }
    }
}
```

- Solo difumina píxeles con baja diferencia Manhattan respecto al promedio local
- Los bordes nítidos (alta diferencia) no se tocan
- Delta = 20 (configurable)
- Opera in-place sobre el array

---

### `js/filters.js`

**Filtros de píxel.** ES Module, 55 líneas. Mutación in-place.

```javascript
export const TYPES = { color: 'color', bw: 'bw', grayscale: 'grayscale', posterize: 'posterize' };

export function apply(imageData, type, params) {
    const data = imageData.data;
    const len = data.length;

    switch (type) {
        case TYPES.bw:
            _applyBlackWhite(data, len, params?.threshold ?? 128);
            break;
        case TYPES.grayscale:
            _applyGrayscale(data, len);
            break;
        case TYPES.posterize:
            _applyPosterize(data, len, params?.levels ?? 4);
            break;
        // 'color': sin cambios
    }
    return imageData;
}
```

**Algoritmos:**
- **BN (threshold):** `luminance = 0.299R + 0.587G + 0.114B` (ITU-R BT.601). Si ≥ umbral → 255, else → 0
- **Grises:** `gray = 0.299R + 0.587G + 0.114B`. R=G=B=gray
- **Posterizar:** `step = 256/levels`. `floor(value/step) * step`
- Canal alpha nunca se modifica

---

### `js/svgOptimizer.js`

**SVGO thin wrapper.** ES Module, 60 líneas.

```javascript
const CONFIG = {
    multipass: true,
    plugins: [{
        name: 'preset-default',
        params: {
            overrides: {
                convertPathData: {
                    floatPrecision: 3, transformPrecision: 5,
                    straightCurves: true, convertToQ: true,
                    lineShorthands: true, curveSmoothShorthands: true,
                    convertToZ: true, collapseRepeated: true,
                    removeUseless: true, utilizeAbsolute: true
                },
                mergePaths: { force: true, floatPrecision: 3 },
                cleanupNumericValues: { floatPrecision: 3 },
                removeViewBox: false, removeDimensions: false
            }
        }
    }]
};

export function optimize(svgString, svgoModule) {
    if (!svgoModule) return svgString;
    try {
        const result = svgoModule.optimize(svgString, CONFIG);
        return result.data;
    } catch (err) {
        return svgString;
    }
}
```

El worker es responsable del `import()` dinámico. Este módulo solo aplica la configuración.

---

### `js/utils.js`

**Utilidades puras.** ES Module, 45 líneas. Sin side effects.

```javascript
export function debounce(fn, delay)     // Debounce estándar
export function countNodes(svgString)   // Cuenta comandos M,L,C,S,Q,T,A,H,V
export function countPaths(svgString)   // Cuenta elementos <path>
export function hexToRGB(hex)           // #RGB o #RRGGBB → {r,g,b}
export function formatFileSize(bytes)   // B, KB, MB
```

---

### `js/geometryDetector.js`

**Detector de formas geométricas — Fase 5 skeleton.** ES Module, 130 líneas.

```javascript
export class GeometryDetector {
    constructor(config = {}) {
        this.circleTolerance = 1.0;
        this.circularityMin = 0.92;
        this.rectAngleTolerance = 5;
        this.ellipseTolerance = 1.0;
        this.minPointsForCircle = 6;
        this.minPointsForRect = 4;
    }

    detect(svgString) {
        // PASSTHROUGH — retorna SVG intacto
        // Los detectores se implementarán en iteración futura
        return svgString;
    }

    // Stubs de detectores
    _tryCircle(d, fill, stroke, opacity)     { return null; }
    _tryRectangle(d, fill, stroke, opacity)  { return null; }
    _tryEllipse(d, fill, stroke, opacity)    { return null; }
    _tryLine(d, fill, stroke, opacity)       { return null; }
    _tryPolygon(d, fill, stroke, opacity)    { return null; }

    // Utilidades implementadas
    _parsePathData(d)            // Parsea 'd' de path SVG → array de segmentos
    _computeBBox(segments)       // Bounding box de segmentos parseados
    _rdpSimplify(points, eps)    // Ramer-Douglas-Peucker
    _fitCircleLeastSquares(pts)  // Stub — retorna {cx:0,cy:0,r:0,rmsError:Inf}
    _fitEllipse(pts)             // Stub
    _angleBetween(a, b, c)       // Ángulo en B del triángulo ABC (grados)
}
```

---

### `js/renderer.js`

**Manipulación DOM del workspace.** ES Module, 25 líneas. Solo main thread.

```javascript
export function displaySource(canvas, dataURL)     // Image → canvas
export function displayVector(container, svgCode)  // innerHTML = svgCode
export function showEmpty(container, message)      // Estado vacío con ícono
```

---

### `js/imageLoader.js`

**Carga de imágenes.** ES Module, 80 líneas. Solo main thread.

```javascript
export function init(callback)  // Registra callback + activa listeners

// Métodos de entrada:
// - File picker: click en #uploadZone → input.click()
// - Drag & drop: dragover/dragleave/drop en #uploadZone
// - Clipboard: Ctrl+V → e.clipboardData.items
// - Formatos: image/png, image/jpeg, image/webp

// Flujo: File → FileReader.readAsDataURL() → new Image() → callback(img, filename)
```

---

### `js/exporter.js`

**Exportación SVG/PNG/EPS.** ES Module, 280 líneas. Solo main thread.

```javascript
export function downloadSVG(svgCode, filename)     // Blob → ObjectURL → <a download>
export function downloadPNG(svgCode, scale, fname)  // SVG → canvas offscreen → toBlob PNG
export function downloadEPS(svgCode, filename)      // SVG → _svgToEPS() → Blob → download
```

**EPS Converter (≈200 líneas):**
- Header PostScript estándar con BoundingBox
- Operadores definidos: np, m, l, c, cp, rgb, f, gs, gr
- Convierte todos los comandos SVG (M, L, C, Q, S, H, V, Z ± relativos)
- Tracking de coordenadas en espacio PostScript (curY = height - svgY)
- Conversión cuadrática→cúbica: CP1 = S + 2/3(C-S), CP2 = E + 2/3(C-E)
- Smooth cubic (S): reflexión de punto de control previo
- Precisión: 1 decimal para coordenadas PS

**PNG Rasterizador:**
- Extrae viewBox del SVG → calcula dimensiones a la escala solicitada
- Canvas offscreen (no añadido al DOM)
- SVG → Blob → ObjectURL → Image → drawImage → toBlob('image/png')
- URL.createObjectURL + revokeObjectURL con setTimeout(100ms)

---

### `js/debug.js`

**Sistema de instrumentación.** ES Module, 120 líneas. Sin side effects.

```javascript
export const Debug = {
    _enabled: true,
    _logs: [],          // Array circular, máximo 300 entradas
    _maxLogs: 300,
    _t0: performance.now(),
    _listeners: [],     // Callbacks para panel visual

    enable() / disable(),

    log(stage, data),   // Registra evento con timestamp relativo
    checkImageData(label, imageData),  // Valida ImageData + loguea
    checkDims(label, data, w, h),      // Valida dimensiones raw + loguea
    stage(label),       // Marca inicio de etapa, retorna timestamp
    stageEnd(label, startTime),        // Marca fin de etapa con elapsed
    onLog(fn),          // Suscribe callback para panel visual
    dump()              // console.table de todos los logs
};
```

**Formato de log en consola:**
```
[stage]  icon @timestamp  label  msg  dimensions  dataLen  expected  elapsed
```

**Colores semáforo:**
- Verde: `ok === true`
- Rojo: `error === true`
- Amarillo: `warn === true`
- Naranja: nombre del stage (siempre)

**Panel Debug en sidebar:**
- 7 filas de estado: Motor, Canvas, Transfer, Preprocess, VTracer, SVGO, Result
- Log en vivo con las últimas 10 entradas (scroll interno)
- Se actualiza reactivamente vía `Debug.onLog()`

---

## Pipeline de Vectorización

### Flujo Completo (Main Thread → Worker → Main Thread)

```
[MAIN THREAD]
  1. Usuario carga imagen
      → ImageLoader → handleImageLoaded(img, filename)
      → Preprocessor.renderSource(img, canvas, ...)
      → Canvas muestra vista previa con filtro activo

  2. Usuario presiona "Vectorizar"
      → handleVectorize()
      → ctx.getImageData() → ImageData (2048×1536 × 4 = 12.6 MB)
      → Debug.checkImageData('canvas-extract', imageData)
      → worker.postMessage({ imageData, options }, [imageData.data.buffer])
      → _repaintCanvas() (buffer fue neutered → redibujar)

[WEB WORKER]
  3. onmessage({ type: 'vectorize', imageData, options })
      → Debug.checkImageData('worker-received', imageData)
      → processImageData(imageData, options)
           ├── applyFilter() [in-place, muta imageData.data]
           └── _selectiveBlur3x3() [opcional, in-place]
      → Debug.checkDims('worker-processed', data, w, h)
      → if cancelled: return

  4. VTracer (motor principal) O ImageTracer (fallback)

      VTracer:
      → vectorizePixels(data, w, h, vtOpts)
           ├── input = Uint8Array(rgba)
           ├── malloc(inputPtr) + copy to WASM memory
           ├── wasm.vectorize_rgba(inputPtr, len, w, h, options)
           ├── getStringFromWasm0(outputPtr, outputLen) → SVG
           ├── free(outputPtr)
           └── free(inputPtr) ← GARANTIZADO (finally)
      → SVG crudo (splines cúbicas, mosaico sin costuras)

      ImageTracer (fallback):
      → fetch('../lib/imagetracer.js') + new Function(code)()
      → ImageTracer.imagedataToSVG({ data, w, h }, itOpts)
      → SVG crudo (quadratic Bézier, stacked layers)

  5. GeometryDetector.detect(svg)
      → Actualmente passthrough (retorna SVG intacto)
      → Futuro: reemplaza paths por primitivas (circle, rect, ellipse)

  6. SVGO optimize(svg)
      → convertPathData: colinealidad, Q conv, shorthands, floatPrecision=3
      → mergePaths (force=true): fusiona paths mismo color
      → collapseGroups
      → multipass: true
      → SVG optimizado (40-60% más compacto)

  7. postMessage({ type: 'result', svgCode, stats })

[MAIN THREAD]
  8. worker.onmessage({ type: 'result' })
      → state.svgCode = svgCode
      → Renderer.displayVector(container, svgCode)
      → Stats: nodos, trazos, tiempo
      → UI: habilitar exportación
```

---

## Sistema de Depuración (Debug)

### Arquitectura

```
┌──────────────────────────────────────────────────┐
│                 Debug Module                      │
│                                                    │
│  Debug.log(stage, data)                            │
│    ├── console.log() con colores + formato         │
│    ├── push a _logs[] (circular, max 300)         │
│    └── notifica _listeners (para panel visual)     │
│                                                    │
│  Debug.checkImageData(label, imageData)            │
│    ├── valida width, height, data.length           │
│    ├── calcula expected = w × h × 4              │
│    └── loguea OK o FAIL con detalle                │
│                                                    │
│  Debug.checkDims(label, data, w, h)               │
│    └── igual que checkImageData sin ImageData      │
│                                                    │
│  Debug.stage(label) → timestamp                    │
│  Debug.stageEnd(label, timestamp)                  │
│    └── loguea INICIO/FIN con elapsed               │
│                                                    │
│  Debug.onLog(fn)                                   │
│    └── callback llamado en cada log()              │
│        → main.js actualiza panel visual            │
└──────────────────────────────────────────────────┘
```

### Puntos de Instrumentación

| Etapa | Archivo:Línea | Debug call | Qué valida |
|---|---|---|---|
| Canvas extract | main.js:80 | `checkImageData('canvas-extract', imageData)` | Dimensiones + buffer pre-transfer |
| Transfer | main.js:97 | `log('main', { label: 'TRANSFERRED' })` | Tiempo de transferencia |
| Canvas repaint | main.js:103 | `checkImageData('canvas-repaint', afterData)` | Post-transfer validation |
| Worker received | worker.js:76 | `checkImageData('worker-received', imageData)` | Datos llegados al worker |
| Preprocess | worker.js:78-82 | `stage('preprocess')` + `stageEnd` + `checkDims` | Tiempo + dimensiones post-filtro |
| Vectorize | worker.js:88-95 | `log('vectorize', {...})` + `stage/stageEnd` | Dimensiones, modo, tiempo |
| SVGO | worker.js:116-125 | `stage/svgEnd` + `log('svgo', {before, after})` | Tamaño antes/después |
| Result | main.js:50 | `log('worker', { label: 'RESULT', nodes, paths })` | Stats finales |
| Engine init | worker.js:43-54 | `log('worker-init', {...})` × 3 | VTracer/SVGO carga OK/FAIL |

### Panel Visual Debug

Ubicado en la sidebar como sección "Debug Pipeline":

```
┌─────────────────────────┐
│ Debug Pipeline      [▼] │
│                          │
│ Motor:    vtracer    OK  │
│ Canvas:   2048x1536  OK  │
│ Transfer: OK 12.6Mb  OK  │
│ Preprocess: ---          │
│ VTracer:  ---            │
│ SVGO:     ---            │
│ Result:   ---            │
│                          │
│ ┌──────────────────────┐ │
│ │ 5234ms canvas-extract│ │
│ │ 5234ms TRANSFERRED   │ │
│ │ 5330ms canvas-repaint│ │
│ │  ...                 │ │
│ └──────────────────────┘ │
└─────────────────────────┘
```

---

## Sistema de Zoom Independiente

### Componentes

```
.view-panel
  ├── .view-panel-title      "Original" / "Vector (SVG)"
  ├── .view-content-wrapper  ← transform: scale() aplicado aquí
  │     └── canvas / .svg-display
  └── .panel-zoom
        ├── .zoom-btn [−]    data-panel data-action="out"
        ├── .zoom-value        "100%"
        ├── .zoom-btn [+]    data-panel data-action="in"
        └── .zoom-btn [⌂]   data-panel data-action="reset"
```

### Estados de Zoom

```javascript
const zoom = {
    source: { level: 1.0 },  // Panel izquierdo (Original)
    vector: { level: 1.0 }   // Panel derecho (SVG)
};

// Rango: 0.25 (25%) a 4.0 (400%)
// Default: 1.0 (100% = ajustado al contenedor)
// Incremento botones: ×1.3 (in) / ÷1.3 (out)
// Wheel: ±0.1 por tick
```

### Controles

| Acción | Efecto |
|---|---|
| Click `[+]` | Zoom ×1.3 (máx 400%) |
| Click `[−]` | Zoom ÷1.3 (mín 25%) |
| Click `[⌂]` | Reset a 100% |
| Scroll wheel sobre panel | Zoom ±0.1 por tick (solo ese panel) |

---

## Sistema de Filtros

Todos los filtros operan **in-place** sobre `Uint8ClampedArray`. El buffer transferido al worker se muta sin copias adicionales.

| Filtro | Algoritmo | Fórmula | Parámetros |
|---|---|---|---|
| **Color** | Sin cambios | — | — |
| **B&N** | Threshold binario | `luminance ≥ threshold ? 255 : 0` | `threshold`: 0-255 (default 128) |
| **Grises** | Luminancia ITU-R BT.601 | `gray = 0.299R + 0.587G + 0.114B` | — |
| **Posterizar** | Cuantización uniforme | `floor(value / step) * step`, `step = 256/levels` | `levels`: 2-16 (default 4) |
| **Gaussian Blur** | Kernel 3×3 selectivo | `|R - avgR| + |G - avgG| + |B - avgB| < 20 → blur` | `blurdelta`: 20 (fijo) |

El filtro se aplica **antes** de la vectorización. Cambiar de filtro descarta el SVG previo y requiere re-vectorizar.

---

## Motor VTracer WebAssembly

### API Nativa (Rust → WASM)

```c
// Funciones exportadas por el .wasm:
vectorize_rgba(data_ptr, data_len, width, height, options) → (out_ptr, out_len, error_flag)
vectorize_bytes(data_ptr, data_len, options) → (out_ptr, out_len, error_flag)
```

### Opciones Completas

```javascript
{
    mode: 'spline' | 'polygon' | 'pixel',    // Tipo de ajuste de curvas
    hierarchical: 'stacked' | 'cutout',       // 'cutout' = mosaic seam-free
    colorMode: 'color' | 'bw',               // Modo color o binario
    filterSpeckle: 0-128,                    // Filtro anti-ruido (px²)
    colorPrecision: 1-8,                     // Bits conservados por canal RGB
    layerDifference: 0-255,                  // Diferencia entre capas de gradiente
    cornerThreshold: 0-180,                  // Ángulo mínimo para esquina (°)
    lengthThreshold: 3.5-10,                 // Subdivisión hasta segmentos ≤ N px
    maxIterations: 1-15,                     // Iteraciones de suavizado spline
    spliceThreshold: 0-180,                  // Ángulo mín para unir segmentos (°)
    pathPrecision: 1-8,                      // Decimales en coordenadas del path
    optimize: 0 | 1 | 2,                     // 0=off, 1=quantize+simplify, 2=+shorthands
    palette: string[],                       // Paleta fija: ['#rrggbb', ...]
    maxColors: number,                       // Auto-quantize a N colores máximo
    // Binary mode:
    threshold: 0-255,                        // Umbral fijo
    adaptive: boolean,                       // Bradley-Roth adaptativo
    adaptiveWindow: number,                  // Tamaño de ventana (0=auto)
    adaptiveT: number                        // Sensibilidad (%)
}
```

### Modos de Ajuste de Curvas

| Modo | Comportamiento | Mejor para |
|---|---|---|
| **Spline** | Cubic Bézier con least-squares iterativo + detección de esquinas + splice merging | Fotos, ilustraciones, gráficos con curvas |
| **Polygon** | Douglas-Peucker simplificado con líneas rectas | Logos geométricos, iconos |
| **Pixel** | Líneas exactas en la grilla de píxeles (sin simplificar) | Pixel art, sprites retro |

### Modos de Composición

| Modo | Comportamiento | Ventaja |
|---|---|---|
| **Mosaic (cutout)** | BoundaryGraph → cada borde se ajusta 1 vez → reversión exacta | **Cero costuras** entre regiones adyacentes |
| **Stacked** | Cada capa trazada independientemente, orden painter | Más rápido, más simple |

### Carga y Memoria

- **fetch()** → `arrayBuffer()` → `WebAssembly.instantiate(bytes, imports)`
- **Memoria lineal**: `wasm.memory.buffer` → `Uint8Array` (crece bajo demanda)
- **Paso de píxeles**: `malloc(rgba.length)` → copia al buffer WASM → `free(ptr)` garantizado
- **Recuperación SVG**: `TextDecoder` sobre subarray de la memoria WASM → `free(outPtr)` garantizado

---

## Motor SVGO Post-Procesador

Cargado dinámicamente en el worker vía `import('../lib/svgo/svgo.browser.js')`.

### Plugins Activos

| Plugin | Configuración | Efecto |
|---|---|---|
| `convertPathData` | floatPrecision=3, straightCurves, convertToQ, lineShorthands, curveSmoothShorthands, convertToZ, collapseRepeated, removeUseless, utilizeAbsolute | Reduce nodos 20-30%, colinealidad→L, C redundante→Q, H/V/S/T shorthands |
| `mergePaths` | force: true, floatPrecision=3 | Fusiona paths adyacentes mismo color (incluso si solapan) |
| `cleanupNumericValues` | floatPrecision=3 | Redondea atributos numéricos a 3 decimales |
| `removeViewBox` | **false** (preservar) | Mantiene viewBox para responsividad |
| `removeDimensions` | **false** (preservar) | Mantiene width/height |
| `collapseGroups` | default | Aplana `<g>` innecesarios |

---

## Fallback ImageTracer

Si VTracer WASM no puede cargarse (navegador sin WebAssembly, error de fetch, etc.), el worker activa automáticamente el fallback:

1. `fetch('../lib/imagetracer.js')` — descarga el script no-modular
2. `new Function(code)()` — ejecuta en el scope global del worker
3. `self.ImageTracer.imagedataToSVG({ data, width, height }, options)` — API síncrona, sin DOM

El badge del header cambia a "ImageTracer" en amarillo. Los parámetros VTracer se ocultan y se muestran los de ImageTracer (suavizado, capas de color, tamaño mín trazo).

---

## Sistema de Exportación

### Formatos Disponibles

| Formato | Tipo | Escalabilidad | Software compatible |
|---|---|---|---|
| **SVG** | Vectorial | Infinita | Navegadores, Figma, Illustrator, Inkscape |
| **PNG** (1x/2x/4x) | Rasterizado | Limitada a resolución | Cualquier visor de imágenes |
| **EPS** | Vectorial (PostScript) | Infinita | Illustrator, CorelDRAW, Inkscape |

### Nombre de Archivo

```
{nombre-imagen}-vector.svg          (SVG)
{nombre-imagen}-{1|2|4}x.png       (PNG)
{nombre-imagen}-vector.eps          (EPS)
```

Si el motor es ImageTracer fallback, se añade sufijo `-it`.

---

## Conversor EPS (SVG → PostScript)

### Estructura del EPS Generado

```postscript
%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 800 600
%%Title: Vectorized by Free Animation Power
%%Creator: FAP Vectorizer Pro
%%LanguageLevel: 2
%%EndComments

/np { newpath } bind def
/m  { moveto } bind def
/l  { lineto } bind def
/c  { curveto } bind def
/cp { closepath } bind def
/rgb { setrgbcolor } bind def
/f  { fill } bind def
/gs { gsave } bind def
/gr { grestore } bind def

np
50.0 550.0 m
250.0 550.0 l
...
cp
gs
1.0000 0.3490 0.0000 rgb
f
gr

%%EOF
```

### Mapeo de Comandos SVG → PostScript

| SVG | PostScript | Nota |
|---|---|---|
| `M x y` | `x y m` | Moveto |
| `L x y` | `x y l` | Lineto |
| `C x1 y1 x2 y2 x y` | `x1 y1 x2 y2 x y c` | Curveto (Bézier cúbica) |
| `Q cx cy x y` | `cp1x cp1y cp2x cp2y x y c` | Quad → Cubic (conversión matemática) |
| `S x2 y2 x y` | `rcx rcy x2 y2 x y c` | Smooth cubic (refleja punto de control previo) |
| `Z` | `cp` | Closepath |

### Sistema de Coordenadas

- **SVG**: origen top-left, Y aumenta hacia abajo
- **PostScript**: origen bottom-left, Y aumenta hacia arriba
- **Conversión**: `psY = height - svgY`
- **Tracking interno**: `curX` y `curY` siempre en coordenadas PS
- **Comandos relativos**: `curX += dx`, `curY -= dy` (inversión del delta Y)

---

## Guía de Uso

### Requisitos

- Navegador moderno (Chrome 80+, Firefox 105+, Edge 79+, Safari 16.4+)
- **NO funciona desde `file://`** — requiere HTTP debido a ES Modules y Web Workers
- Servir con cualquier HTTP server local

### Inicio Rápido

```bash
cd C:\Users\eduar\Desktop\vectorizador
python -m http.server 8080
# Abrir http://localhost:8080
```

### Flujo de Trabajo

1. **Cargar imagen**: Click en zona punteada, arrastrar, o Ctrl+V
2. **Seleccionar filtro** (opcional): Color / B&N / Grises / Posterizar
3. **Ajustar parámetros del motor**: modo, composición, esquinas, suavizado
4. **Vectorizar**: Presionar botón naranja
5. **Inspeccionar**: Usar zoom independiente en cada panel para comparar calidad
6. **Exportar**: Elegir formato (SVG/PNG/EPS), resolución (si PNG), Descargar

### Panel Debug

Para diagnosticar problemas, abrir la sección "Debug Pipeline" en la sidebar. Muestra en tiempo real:
- Motor activo (VTracer/ImageTracer)
- Dimensiones del canvas
- Estado de la transferencia al worker
- Resultado (nodos, paths, tiempo)

---

## Referencias y Fuentes

### Motores de Vectorización

| Proyecto | URL | Estrellas | Licencia |
|---|---|---|---|
| VTracer | https://github.com/visioncortex/vtracer | 6,500 | MIT |
| ImageTracer.js | https://github.com/jankovicsandras/imagetracerjs | ~300 | Public Domain |
| SVGO | https://github.com/svg/svgo | 21,000 | MIT |
| Vectorizer.AI | https://vectorizer.ai | SaaS | Propietario |
| Vector Magic | https://vectormagic.com | SaaS | Propietario |

### Documentación Técnica

- VTracer Algorithm: https://www.visioncortex.org/vtracer-docs
- VTracer Clustering: https://www.visioncortex.org/impression-docs
- ImageTracer.js v1.2.6: `lib/imagetracer.js` (analizado línea por línea)
- Bradley-Roth Adaptive Thresholding: paper clásico de computer vision
- Ramer-Douglas-Peucker: algoritmo de simplificación de polilíneas

### Papers Académicos que Citan VTracer

- SKILL 2023: Framework to Vectorize Digital Artworks for Physical Fabrication
- arXiv 2023: Image Vectorization: a Review
- arXiv 2023: StarVector — Generating Scalable Vector Graphics Code from Images
- arXiv 2024: Text-Based Reasoning About Vector Graphics
- arXiv 2024: Delving into LLMs' visual understanding ability using SVG

### SVGO Plugins

- convertPathData: https://svgo.dev/docs/plugins/convertPathData/
- mergePaths: https://svgo.dev/docs/plugins/mergePaths/
- collapseGroups: https://svgo.dev/docs/plugins/collapseGroups/

---

## Problemas Conocidos y Diagnóstico

### Síntoma: "SVG solo muestra la parte superior izquierda"

**Causa probable**: dimension mismatch entre el buffer RGBA y los parámetros width/height pasados a VTracer.

**Diagnóstico con Debug:**
```
[check] FAIL canvas-extract 2048x0 dataLen=0 BUFFER VACIO
```
→ El canvas perdió los datos antes de la transferencia.

```
[check] FAIL worker-processed 2048x1536 dataLen=0 DIMENSIONES CERO
```
→ El preprocessor devolvió un buffer vacío.

```
[vectorize] ERROR Dimension mismatch: buffer 3145728 expected 12582912
```
→ VTracer recibió dimensiones incorrectas. El viewBox será erróneo.

### Síntoma: "Al activar Gaussian Blur la imagen desaparece"

**Causa probable**: `_selectiveBlur3x3` itera `for (y = 2; y < height - 2; y++)`. Si `height < 5`, no ejecuta ninguna iteración y el `putImageData` podría fallar.

**Mitigación**: El guard `imageData.data.length === dims.width * dims.height * 4` antes de llamar al blur previene corrupción.

### Síntoma: "No veo diferencia entre Spline y Polygon"

**Causa**: Si el badge muestra "ImageTracer" (amarillo), VTracer no cargó y los parámetros de modo/hierarchical no aplican. ImageTracer siempre usa quadratic Bézier + stacked.

**Verificación**: Abrir consola (F12), buscar `[worker-init]`. Debe decir `VTracer OK` y `Engine: vtracer`.

### Síntoma: "No carga en file://"

**Causa**: ES Modules, Module Workers, y `fetch()` requieren HTTP (política CORS). Origen `file://` = `null` → bloqueado.

**Solución**: Servir con `python -m http.server 8080` y abrir `http://localhost:8080`.

---

## Changelog

| Fase | Cambios Principales |
|---|---|
| **Fase 0** | MVP: vectorizador.html único con ImageTracer.js CDN |
| **Fase 1** | 8 módulos JS, filtros Canvas, export SVG/PNG/EPS, tema Dark Mode, conversor EPS propio |
| **Fase 2** | AI Optimizer con DeepSeek — DESECHADO (fricción usuario, dependencia externa) |
| **Fase 3** | Investigación profunda de ImageTracer.js (9 bugs documentados), VTracer, SVGO, Vectorizer.AI |
| **Fase 4** | Pipeline unificado VTracer WASM + SVGO + ImageTracer fallback. Gaussian Blur selectivo |
| **Fase 5** | Web Worker + ES Modules + Debug + Zoom independiente. 14 archivos reescritos. `aiOptimizer.js` y `vectorizer.js` eliminados |
| **Fase 5.1 (2026)** | Padding perimetral + `Uint32Array` blur + EPS off-thread + Worker recreation + Pan drag + Rediseño FAP + 6 fixes WASM |

---

## Licencias

| Componente | Licencia |
|---|---|
| Código propio (`js/*.js`, `css/styles.css`, `index.html`) | MIT |
| VTracer WASM (`lib/vtracer/vtracer.wasm`) | MIT (visioncortex/vtracer) |
| SVGO (`lib/svgo/svgo.browser.js`) | MIT (svg/svgo) |
| ImageTracer.js (`lib/imagetracer.js`) | Public Domain |

---

*Free Animation Power Vectorizer — 100% Client-Side. Sin API keys. Sin registro. Sin backend.*
