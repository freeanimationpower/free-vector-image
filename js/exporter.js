/**
 * Exporter — SVG / PNG / EPS.
 * Main thread (usa canvas, Blob, URL).
 * EPS: recibe codigo PostScript pre-procesado desde el Worker.
 */

export function downloadSVG(svgCode, filename) {
    const blob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
    _triggerDownload(blob, filename || 'vector.svg');
}

export function downloadPNG(svgCode, scale, filename) {
    const vbMatch = svgCode.match(/viewBox=["'][\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)["']/);
    const vbW = vbMatch ? parseFloat(vbMatch[1]) : 800;
    const vbH = vbMatch ? parseFloat(vbMatch[2]) : 600;

    const s  = scale || 1;
    const w  = Math.round(vbW * s);
    const h  = Math.round(vbH * s);

    let sizedSvg = svgCode;
    if (!sizedSvg.includes('width=')) {
        sizedSvg = sizedSvg.replace('<svg ', '<svg width="' + w + '" height="' + h + '" ');
    } else {
        sizedSvg = sizedSvg.replace(/width=["'][^"']+["']/, 'width="' + w + '"');
        sizedSvg = sizedSvg.replace(/height=["'][^"']+["']/, 'height="' + h + '"');
    }

    const svgBlob = new Blob([sizedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => {
            _triggerDownload(blob, filename || 'vector-' + s + 'x.png');
        }, 'image/png');
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

export function downloadEPS(epsCode, filename) {
    const blob = new Blob([epsCode], { type: 'application/postscript' });
    _triggerDownload(blob, filename || 'vector.eps');
}

function _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
