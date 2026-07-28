/**
 * Preprocessor — redimension, filtros y Gaussian Blur.
 *
 * Dos APIs:
 *   processImageData() — Worker: padding +2px perimetral, blur 32-bit.
 *   renderSource()     — Main thread: dibuja en canvas para UI.
 */

import { apply as applyFilter } from './filters.js';

const MAX_SIZE = 1024; // Limite conservador para evitar OOM en WASM

// ═══════════════════════════════════════
//  WORKER API — sin Canvas, puro array
// ═══════════════════════════════════════

/**
 * Procesa ImageData sin Canvas. Aplica filtros y blur in-place sobre
 * el buffer transferido, luego crea un nuevo buffer con padding
 * transparente perimetral (proporcional a la resolucion) para evitar
 * que VTracer recorte las curvas de Bezier en los bordes.
 *
 * @param {ImageData} imageData - propiedad .data mutada in-place (filtros)
 * @param {object} options - { filterType, filterParams, useGaussianBlur }
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function processImageData(imageData, options) {
    const { filterType, filterParams, useGaussianBlur } = options;
    const origW = imageData.width;
    const origH = imageData.height;
    const origData = imageData.data;

    if (!origData || origData.length === 0 || origW === 0 || origH === 0) {
        throw new Error('ImageData invalido: dimensiones o buffer vacio');
    }
    if (origData.length !== origW * origH * 4) {
        throw new Error('[Preprocessor] Dimension mismatch: buffer=' + origData.length +
                         ' expected=' + (origW * origH * 4) + ' (' + origW + 'x' + origH + ')');
    }

    // 1. Filtros in-place sobre el buffer original
    if (filterType && filterType !== 'color') {
        applyFilter({ data: origData, width: origW, height: origH }, filterType, filterParams || {});
    }

    // 2. Gaussian Blur selectivo optimizado con Uint32Array
    if (useGaussianBlur) {
        _selectiveBlur3x3(origData, origW, origH, 20);
    }

    // 3. Padding perimetral proporcional: da margen a curvas Bezier en bordes
    const PADDING = Math.max(4, Math.ceil(Math.max(origW, origH) / 256));
    const paddedW = origW + PADDING * 2;
    const paddedH = origH + PADDING * 2;
    const paddedData = new Uint8ClampedArray(paddedW * paddedH * 4);

    for (let y = 0; y < origH; y++) {
        const srcStart = y * origW * 4;
        const destStart = ((y + PADDING) * paddedW + PADDING) * 4;
        paddedData.set(origData.subarray(srcStart, srcStart + origW * 4), destStart);
    }

    return { width: paddedW, height: paddedH, data: paddedData };
}

// ═══════════════════════════════════════
//  MAIN THREAD API — Canvas para UI
// ═══════════════════════════════════════

export function renderSource(img, canvas, filterType, filterParams, useGaussianBlur) {
    const dims = _computeDimensions(img);
    canvas.width  = dims.width;
    canvas.height = dims.height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, dims.width, dims.height);
    ctx.drawImage(img, 0, 0, dims.width, dims.height);

    if (filterType && filterType !== 'color') {
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

export function computeDimensions(img) {
    return _computeDimensions(img);
}

// ─── INTERNAS ──────────────────────────

function _computeDimensions(img) {
    let w = img.width, h = img.height;
    if (w > MAX_SIZE || h > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
    }
    return { width: w, height: h };
}

/**
 * Desenfoque gaussiano selectivo 3x3 optimizado con Uint32Array.
 * Lee pixeles vecinos como enteros 32-bit (1 acceso a memoria en vez de 4)
 * y escribe el resultado empaquetado con operaciones bitwise.
 *
 * Little-endian (x86/ARM): uint32 = (A<<24) | (B<<16) | (G<<8) | R
 */
function _selectiveBlur3x3(data, width, height, delta) {
    const copy = new Uint8ClampedArray(data);
    const copy32 = new Uint32Array(copy.buffer);
    const out32 = new Uint32Array(data.buffer);

    for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
            const idx = y * width + x;
            const px = copy32[idx];

            const r = px & 0xFF;
            const g = (px >> 8) & 0xFF;
            const b = (px >> 16) & 0xFF;
            const a = (px >> 24) & 0xFF;

            let sumR = 0, sumG = 0, sumB = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nPx = copy32[idx + dy * width + dx];
                    sumR += nPx & 0xFF;
                    sumG += (nPx >> 8) & 0xFF;
                    sumB += (nPx >> 16) & 0xFF;
                }
            }

            const avgR = (sumR / 9) | 0;
            const avgG = (sumG / 9) | 0;
            const avgB = (sumB / 9) | 0;

            const diff = Math.abs(r - avgR) + Math.abs(g - avgG) + Math.abs(b - avgB);

            if (diff < delta) {
                out32[idx] = (a << 24) | (avgB << 16) | (avgG << 8) | avgR;
            }
        }
    }
}
