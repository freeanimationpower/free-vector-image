/**
 * Renderer — manipula el DOM del workspace dual.
 * Solo main thread (usa Image + Canvas).
 */

export function displaySource(canvas, dataURL) {
    const img = new Image();
    img.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
    img.src = dataURL;
}

export function displayVector(container, svgCode) {
    container.innerHTML = svgCode;
}

export function getSVGElement(container) {
    return container.querySelector('svg');
}

export function showEmpty(container, message) {
    container.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-state-text">' + message + '</div>' +
        '</div>';
}

