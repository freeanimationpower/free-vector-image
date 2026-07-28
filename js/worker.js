/**
 * Web Worker — Pipeline de vectorizacion completo.
 * Corre aislado del main thread. Sin acceso a DOM.
 *
 * Pipeline: preprocess → vtracer → viewBox adjust → geometry → svgo → result
 * EPS: conversion a PostScript via Regex (headless-safe, sin DOMParser).
 * Fallback: ImageTracer cargado via fetch() + new Function()
 */

import { loadVTracer, vectorizePixels } from './vtracerBridge.js';
import { processImageData } from './preprocessor.js';
import { GeometryDetector } from './geometryDetector.js';
import { countNodes, countPaths, hexToRGB } from './utils.js';
import { Debug } from './debug.js';

// ─── ESTADO ────────────────────────────
let svgoModule   = null;
let svgoReady    = false;
let vtracerReady = false;
let engine       = 'imagetracer';
let cancelled    = false;

// ─── SVGO CONFIG ───────────────────────
const SVGO_CONFIG = {
    multipass: true,
    plugins: [
        {
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
                    mergePaths:          { force: true, floatPrecision: 3 },
                    cleanupNumericValues: { floatPrecision: 3 },
                    removeViewBox: false
                }
            }
        },
        { name: 'removeViewBox', active: false },
    { name: 'removeDimensions', active: false },
        { name: 'convertShapeToPath', active: false },
        { name: 'convertEllipseToCircle', active: false },
        { name: 'removeHiddenElems', active: false },
        { name: 'removeEmptyText', active: false }
    ]
};

// ─── INIT ──────────────────────────────
(async function init() {
    Debug.log('worker-init', { label: 'INIT START' });

    const vtracerP = loadVTracer('../lib/vtracer/vtracer.wasm')
        .then(() => {
            vtracerReady = true; engine = 'vtracer';
            Debug.log('worker-init', { label: 'VTracer OK' });
        })
        .catch(err => {
            Debug.log('worker-init', { label: 'VTracer FAIL', error: true, msg: err.message });
        });

    const svgoP = import('../lib/svgo/svgo.browser.js')
        .then(m => {
            svgoModule = m; svgoReady = true;
            Debug.log('worker-init', { label: 'SVGO OK' });
        })
        .catch(err => {
            Debug.log('worker-init', { label: 'SVGO FAIL', error: true, msg: err.message });
        });

    await Promise.allSettled([vtracerP, svgoP]);
    Debug.log('worker-init', { label: 'READY', engine, svgo: svgoReady });
    self.postMessage({ type: 'ready', engine, svgoReady });
})();

// ─── MESSAGE HANDLER ───────────────────
self.onmessage = async function (e) {
    const { type } = e.data;

    // ═══ EXPORT EPS (off-main-thread) ═══
    if (type === 'export-eps') {
        const epsCode = _svgToEPS(e.data.svgCode);
        self.postMessage({ type: 'eps-result', epsCode, filename: e.data.filename });
        return;
    }

    if (type === 'cancel') {
        cancelled = true;
        return;
    }

    if (type !== 'vectorize') return;

    const { imageData, options } = e.data;
    cancelled = false;
    const t0 = performance.now();

    // Dimensiones originales antes de que el padding las expanda
    const origW = imageData.width;
    const origH = imageData.height;

    try {
        // ═══ STAGE 1: Preprocess ═══
        self.postMessage({ type: 'progress', stage: 'preprocess', percent: 5 });
        Debug.checkImageData('worker-received', imageData);

        const t1 = Debug.stage('preprocess');
        const processed = processImageData(imageData, options);
        Debug.stageEnd('preprocess', t1);
        Debug.checkDims('worker-processed', processed.data, processed.width, processed.height);

        if (cancelled) return;

        // ═══ STAGE 2: Vectorize ═══
        self.postMessage({ type: 'progress', stage: 'vectorize', percent: 15 });

        let svg;
        const t2 = Debug.stage('vectorize');
        if (vtracerReady && options.engine === 'vtracer') {
            const vtOpts = Object.assign({
                mode: 'spline', hierarchical: 'stacked',
                filterSpeckle: 8, colorPrecision: 3,
                layerDifference: 32, cornerThreshold: 60,
                lengthThreshold: 4.0, maxIterations: 2,
                spliceThreshold: 45, pathPrecision: 2, optimize: 0
            }, options.vtracerParams);

            Debug.log('vectorize', { label: 'VTracer call', width: processed.width, height: processed.height,
                dataLen: processed.data.length, mode: vtOpts.mode, hierarchical: vtOpts.hierarchical });

            svg = vectorizePixels(
                processed.data, processed.width, processed.height, vtOpts
            );
            Debug.stageEnd('vectorize', t2);
        } else {
            Debug.log('vectorize', { label: 'ImageTracer fallback', width: processed.width, height: processed.height });
            svg = await _imageTracerFallback(processed, options);
            Debug.stageEnd('vectorize', t2);
        }
        if (cancelled) return;
        self.postMessage({ type: 'progress', stage: 'vectorize', percent: 70 });

        // ═══ STAGE 3: Geometry Detector ═══
        svg = new GeometryDetector({ circleTolerance: 1.0 }).detect(svg);
        if (cancelled) return;
        self.postMessage({ type: 'progress', stage: 'geometry', percent: 80 });

        // ═══ STAGE 4: SVGO ═══
        if (svgoReady) {
            const t4 = Debug.stage('svgo');
            const lenBefore = svg.length;
            svg = _optimizeSVG(svg);
            Debug.log('svgo', { label: 'optimized', before: _fmtLen(lenBefore), after: _fmtLen(svg.length) });
            Debug.stageEnd('svgo', t4);
        } else {
            Debug.log('svgo', { warn: true, msg: 'SKIPPED (not loaded)' });
        }
        self.postMessage({ type: 'progress', stage: 'optimize', percent: 95 });

        // ═══ STAGE 5: ViewBox adjustment (DESPUES de SVGO, lo blinda) ═══
        const pad = (processed.width - origW) >> 1;
        const targetViewBox = 'viewBox="' + pad + ' ' + pad + ' ' + origW + ' ' + origH + '"';
        if (/viewBox\s*=\s*["']/.test(svg)) {
            svg = svg.replace(/viewBox\s*=\s*["'][^"']*["']/, targetViewBox);
        } else {
            svg = svg.replace(/<svg\s/, '<svg ' + targetViewBox + ' ');
        }
        Debug.log('viewbox', {
            label: 'ADJUSTED', pad: pad, origW: origW, origH: origH
        });
        console.error('[DIAG] SVG viewBox final:', targetViewBox);

        // ═══ RESULT ═══
        const elapsed = Math.round(performance.now() - t0);
        Debug.log('result', {
            label: 'PIPELINE DIMS', origW: origW, origH: origH,
            paddedW: processed.width, paddedH: processed.height,
            svgLen: svg.length, pad: pad
        });
        self.postMessage({
            type: 'result',
            svgCode: svg,
            stats: {
                nodes: countNodes(svg),
                paths: countPaths(svg),
                timeMs: elapsed,
                dims: origW + 'x' + origH
            }
        });

    } catch (err) {
        self.postMessage({
            type: 'error',
            message: err.message || 'Error de vectorizacion',
            stage: 'pipeline'
        });
    }
};

// ─── SVGO WRAPPER ──────────────────────
function _optimizeSVG(svgString) {
    try {
        const result = svgoModule.optimize(svgString, SVGO_CONFIG);
        return result.data;
    } catch (err) {
        Debug.log('svgo', { error: true, msg: err.message });
        return svgString;
    }
}

function _fmtLen(bytes) {
    if (bytes >= 1000) return (bytes / 1000).toFixed(1) + 'KB';
    return bytes + 'B';
}

// ─── IMAGETRACER FALLBACK ─────────────
let _imageTracerLoaded = false;

async function _ensureImageTracer() {
    if (typeof self.ImageTracer !== 'undefined' && self.ImageTracer.imageToSVG) return;

    const res = await fetch('../lib/imagetracer.js');
    const code = await res.text();
    (new Function(code))();
}

async function _imageTracerFallback(processed, options) {
    await _ensureImageTracer();

    if (!self.ImageTracer || !self.ImageTracer.imagedataToSVG) {
        throw new Error('ImageTracer no disponible');
    }

    return self.ImageTracer.imagedataToSVG(
        {
            width: processed.width,
            height: processed.height,
            data: processed.data
        },
        {
            corsenabled: false,
            ltres: options.imagetracerParams?.smoothness || 5,
            qtres: options.imagetracerParams?.smoothness || 5,
            pathomit: options.imagetracerParams?.minPathSize || 8,
            colorquantcycles: 3,
            numberofcolors: options.imagetracerParams?.colorLayers || 30,
            strokewidth: 1,
            viewbox: true
        }
    );
}

// ═══════════════════════════════════════
//  EPS CONVERTER — Headless-safe (Regex)
// ═══════════════════════════════════════

/**
 * Convierte SVG a PostScript EPS sin DOMParser.
 * Usa dos pases de Regex: extrae tags <path> completos,
 * luego extrae atributos d, fill, style individualmente.
 * Soporta fill via atributo directo y via style="fill:#xxx".
 */
function _svgToEPS(svgString) {
    const vbMatch = svgString.match(/viewBox=["'][\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)["']/);
    const vbW = vbMatch ? Math.ceil(parseFloat(vbMatch[1])) : 800;
    const vbH = vbMatch ? parseFloat(vbMatch[2]) : 600;

    let eps = '%!PS-Adobe-3.0 EPSF-3.0\n';
    eps += '%%BoundingBox: 0 0 ' + vbW + ' ' + Math.ceil(vbH) + '\n';
    eps += '%%Title: Vectorized by Free Animation Power\n';
    eps += '%%Creator: FAP Vectorizer Pro\n';
    eps += '%%LanguageLevel: 2\n%%EndComments\n\n';
    eps += '/np { newpath } bind def\n';
    eps += '/m  { moveto } bind def\n';
    eps += '/l  { lineto } bind def\n';
    eps += '/c  { curveto } bind def\n';
    eps += '/cp { closepath } bind def\n';
    eps += '/rgb { setrgbcolor } bind def\n';
    eps += '/f  { fill } bind def\n';
    eps += '/gs { gsave } bind def\n';
    eps += '/gr { grestore } bind def\n\n';

    // Pase 1: extraer cada tag <path> completo
    const pathTagRegex = /<path[^>]*\/?>/g;
    let match;

    while ((match = pathTagRegex.exec(svgString)) !== null) {
        const pathTag = match[0];

        // Filtrar paths invisibles
        if (/opacity\s*=\s*["']0["']/.test(pathTag) ||
            /opacity\s*=\s*["']0\.?0*["']/.test(pathTag)) {
            continue;
        }

        // Pase 2a: extraer 'd'
        const dMatch = pathTag.match(/d\s*=\s*["']([^"']+)["']/);
        if (!dMatch) continue;
        const d = dMatch[1];

        // Pase 2b: extraer 'fill' — atributo directo o style inline
        let fillHex = '#000000';
        const fillAttrMatch = pathTag.match(/fill\s*=\s*["']([^"']+)["']/);
        const styleFillMatch = pathTag.match(/style\s*=\s*["'][^"']*fill\s*:\s*([^;"'\s]+)/);

        if (fillAttrMatch && fillAttrMatch[1] !== 'none') {
            fillHex = fillAttrMatch[1];
        } else if (styleFillMatch && styleFillMatch[1] !== 'none') {
            fillHex = styleFillMatch[1];
        } else if (fillAttrMatch && fillAttrMatch[1] === 'none') {
            continue; // fill="none" → omitir
        }

        if (fillHex === 'none') continue;

        eps += 'np\n';
        eps += _convertPathToPS(d, vbH);
        eps += 'gs\n';

        const rgb = hexToRGB(fillHex);
        if (rgb) {
            eps += _f(rgb.r / 255) + ' ' + _f(rgb.g / 255) + ' ' + _f(rgb.b / 255) + ' rgb\n';
        } else {
            eps += '0 0 0 rgb\n';
        }
        eps += 'f\ngr\n\n';
    }

    eps += '%%EOF\n';
    return eps;
}

/**
 * Maquina de estados para convertir comandos de path SVG a PostScript.
 * Soporta M/m, L/l, H/h, V/v, C/c, Q/q, S/s, T/t, A/a, Z/z.
 * Invierte el eje Y (height - y) segun el estandar PostScript.
 * Rastrea subStartX/Y y prevCX/Y para comandos relativos y suavizados.
 */
function _convertPathToPS(d, height) {
    const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
    let result = '', match;
    let curX = 0, curY = height, subStartX = 0, subStartY = 0;
    let isFirst = true, prevCX = null, prevCY = null;

    while ((match = regex.exec(d)) !== null) {
        const cmd = match[1], raw = match[2].trim();
        if (!raw && cmd !== 'Z' && cmd !== 'z') continue;
        const params = raw ? raw.split(/[\s,]+/).filter(Boolean).map(Number) : [];

        switch (cmd) {
            case 'M': for (let i = 0; i < params.length; i += 2) {
                curX = params[i]; curY = height - params[i + 1];
                if (i === 0) { subStartX = curX; subStartY = curY; }
                if (isFirst) isFirst = false; else result += 'cp\n';
                result += _f(curX) + ' ' + _f(curY) + ' m\n';
            } prevCX = prevCY = null; break;
            case 'm': for (let i = 0; i < params.length; i += 2) {
                curX += params[i]; curY -= params[i + 1];
                if (i === 0) { subStartX = curX; subStartY = curY; }
                if (isFirst) isFirst = false; else result += 'cp\n';
                result += _f(curX) + ' ' + _f(curY) + ' m\n';
            } prevCX = prevCY = null; break;
            case 'L': for (let i = 0; i < params.length; i += 2) {
                curX = params[i]; curY = height - params[i + 1];
                result += _f(curX) + ' ' + _f(curY) + ' l\n';
            } prevCX = prevCY = null; break;
            case 'l': for (let i = 0; i < params.length; i += 2) {
                curX += params[i]; curY -= params[i + 1];
                result += _f(curX) + ' ' + _f(curY) + ' l\n';
            } prevCX = prevCY = null; break;
            case 'H': for (let i = 0; i < params.length; i++) {
                curX = params[i]; result += _f(curX) + ' ' + _f(curY) + ' l\n';
            } prevCX = prevCY = null; break;
            case 'h': for (let i = 0; i < params.length; i++) {
                curX += params[i]; result += _f(curX) + ' ' + _f(curY) + ' l\n';
            } prevCX = prevCY = null; break;
            case 'V': for (let i = 0; i < params.length; i++) {
                curY = height - params[i]; result += _f(curX) + ' ' + _f(curY) + ' l\n';
            } prevCX = prevCY = null; break;
            case 'v': for (let i = 0; i < params.length; i++) {
                curY -= params[i]; result += _f(curX) + ' ' + _f(curY) + ' l\n';
            } prevCX = prevCY = null; break;
            case 'C': for (let i = 0; i < params.length; i += 6) {
                const x1 = params[i], y1 = height - params[i + 1];
                const x2 = params[i + 2], y2 = height - params[i + 3];
                prevCX = x2; prevCY = y2;
                curX = params[i + 4]; curY = height - params[i + 5];
                result += _f(x1) + ' ' + _f(y1) + ' ' + _f(x2) + ' ' + _f(y2) + ' ' + _f(curX) + ' ' + _f(curY) + ' c\n';
            } break;
            case 'c': for (let i = 0; i < params.length; i += 6) {
                const x1 = curX + params[i], y1 = curY - params[i + 1];
                const x2 = curX + params[i + 2], y2 = curY - params[i + 3];
                prevCX = x2; prevCY = y2;
                curX += params[i + 4]; curY -= params[i + 5];
                result += _f(x1) + ' ' + _f(y1) + ' ' + _f(x2) + ' ' + _f(y2) + ' ' + _f(curX) + ' ' + _f(curY) + ' c\n';
            } break;
            case 'Q': for (let i = 0; i < params.length; i += 4) {
                const sx = curX, sy = curY;
                const cx = params[i], cy = height - params[i + 1];
                const ex = params[i + 2], ey = height - params[i + 3];
                const cp1x = sx + 2 / 3 * (cx - sx), cp1y = sy + 2 / 3 * (cy - sy);
                const cp2x = ex + 2 / 3 * (cx - ex), cp2y = ey + 2 / 3 * (cy - ey);
                prevCX = cp2x; prevCY = cp2y; curX = ex; curY = ey;
                result += _f(cp1x) + ' ' + _f(cp1y) + ' ' + _f(cp2x) + ' ' + _f(cp2y) + ' ' + _f(ex) + ' ' + _f(ey) + ' c\n';
            } break;
            case 'q': for (let i = 0; i < params.length; i += 4) {
                const sx = curX, sy = curY;
                const cx = curX + params[i], cy = curY - params[i + 1];
                const ex = curX + params[i + 2], ey = curY - params[i + 3];
                const cp1x = sx + 2 / 3 * (cx - sx), cp1y = sy + 2 / 3 * (cy - sy);
                const cp2x = ex + 2 / 3 * (cx - ex), cp2y = ey + 2 / 3 * (cy - ey);
                prevCX = cp2x; prevCY = cp2y; curX = ex; curY = ey;
                result += _f(cp1x) + ' ' + _f(cp1y) + ' ' + _f(cp2x) + ' ' + _f(cp2y) + ' ' + _f(ex) + ' ' + _f(ey) + ' c\n';
            } break;
            case 'S': for (let i = 0; i < params.length; i += 4) {
                const rcx = (prevCX != null) ? 2 * curX - prevCX : curX;
                const rcy = (prevCY != null) ? 2 * curY - prevCY : curY;
                const x2 = params[i], y2 = height - params[i + 1];
                prevCX = x2; prevCY = y2;
                curX = params[i + 2]; curY = height - params[i + 3];
                result += _f(rcx) + ' ' + _f(rcy) + ' ' + _f(x2) + ' ' + _f(y2) + ' ' + _f(curX) + ' ' + _f(curY) + ' c\n';
            } break;
            case 's': for (let i = 0; i < params.length; i += 4) {
                const rcx = (prevCX != null) ? 2 * curX - prevCX : curX;
                const rcy = (prevCY != null) ? 2 * curY - prevCY : curY;
                const x2 = curX + params[i], y2 = curY - params[i + 1];
                prevCX = x2; prevCY = y2;
                curX += params[i + 2]; curY -= params[i + 3];
                result += _f(rcx) + ' ' + _f(rcy) + ' ' + _f(x2) + ' ' + _f(y2) + ' ' + _f(curX) + ' ' + _f(curY) + ' c\n';
            } break;
            case 'T': for (let i = 0; i < params.length; i += 2) {
                const rcx = (prevCX != null) ? 2 * curX - prevCX : curX;
                const rcy = (prevCY != null) ? 2 * curY - prevCY : curY;
                const sx = curX, sy = curY;
                const cx = rcx, cy = rcy;
                const ex = params[i], ey = height - params[i + 1];
                const cp1x = sx + 2 / 3 * (cx - sx), cp1y = sy + 2 / 3 * (cy - sy);
                const cp2x = ex + 2 / 3 * (cx - ex), cp2y = ey + 2 / 3 * (cy - ey);
                prevCX = cp2x; prevCY = cp2y; curX = ex; curY = ey;
                result += _f(cp1x) + ' ' + _f(cp1y) + ' ' + _f(cp2x) + ' ' + _f(cp2y) + ' ' + _f(ex) + ' ' + _f(ey) + ' c\n';
            } break;
            case 't': for (let i = 0; i < params.length; i += 2) {
                const rcx = (prevCX != null) ? 2 * curX - prevCX : curX;
                const rcy = (prevCY != null) ? 2 * curY - prevCY : curY;
                const sx = curX, sy = curY;
                const cx = rcx, cy = rcy;
                const ex = curX + params[i], ey = curY - params[i + 1];
                const cp1x = sx + 2 / 3 * (cx - sx), cp1y = sy + 2 / 3 * (cy - sy);
                const cp2x = ex + 2 / 3 * (cx - ex), cp2y = ey + 2 / 3 * (cy - ey);
                prevCX = cp2x; prevCY = cp2y; curX = ex; curY = ey;
                result += _f(cp1x) + ' ' + _f(cp1y) + ' ' + _f(cp2x) + ' ' + _f(cp2y) + ' ' + _f(ex) + ' ' + _f(ey) + ' c\n';
            } break;
            case 'A': case 'a':
                // Los arcos (A/a) se ignoran defensivamente; VTracer + SVGO no los emiten.
                // Si llegaran a aparecer, el path se cierra sin trazar el arco.
                break;
            case 'Z': case 'z':
                result += 'cp\n';
                curX = subStartX; curY = subStartY;
                prevCX = prevCY = null; break;
        }
    }
    if (!result.endsWith('cp\n')) result += 'cp\n';
    return result;
}

function _f(val) { return Math.round(val * 10) / 10; }

// ─── CRASH HANDLER — atrapa traps WASM ──
self.onerror = function (e) {
    self.postMessage({
        type: 'error',
        message: 'Worker crash: ' + (e.message || e),
        stage: 'wasm'
    });
};
self.onunhandledrejection = function (e) {
    self.postMessage({
        type: 'error',
        message: 'Worker rejection: ' + (e.reason ? e.reason.message : e),
        stage: 'wasm'
    });
};
