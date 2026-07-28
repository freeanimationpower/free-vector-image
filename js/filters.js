/**
 * Filters — operan IN-PLACE sobre ImageData.data.
 * Sin dependencias de Canvas API. Compatible con Worker.
 */

export const TYPES = {
    color:      'color',
    bw:         'bw',
    grayscale:  'grayscale',
    posterize:  'posterize'
};

/**
 * @param {ImageData|{data:Uint8ClampedArray}} imageData
 * @param {string} type
 * @param {object} [params] - { threshold, levels }
 * @returns {typeof imageData} mismo objeto, mutado in-place
 */
export function apply(imageData, type, params) {
    const data = imageData.data;
    const len  = data.length;

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
    }

    return imageData;
}

function _applyBlackWhite(data, len, threshold) {
    for (let i = 0; i < len; i += 4) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const v = lum >= threshold ? 255 : 0;
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
}

function _applyGrayscale(data, len) {
    for (let i = 0; i < len; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = gray; data[i + 1] = gray; data[i + 2] = gray;
    }
}

function _applyPosterize(data, len, levels) {
    const step = 256 / levels;
    for (let i = 0; i < len; i += 4) {
        data[i]     = Math.floor(data[i]     / step) * step;
        data[i + 1] = Math.floor(data[i + 1] / step) * step;
        data[i + 2] = Math.floor(data[i + 2] / step) * step;
    }
}
