/**
 * Utilidades puras — sin side effects, sin DOM.
 */

export function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

export function countNodes(svgString) {
    const matches = svgString.match(/[MLHVCSQTA](?:\s*-?\d)/gi);
    return matches ? matches.length : 0;
}

export function countPaths(svgString) {
    const matches = svgString.match(/<path\b/gi);
    return matches ? matches.length : 0;
}

export function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}
