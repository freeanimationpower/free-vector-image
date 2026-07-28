/**
 * ImageLoader — file picker, drag & drop, clipboard.
 * Solo main thread (usa DOM + FileReader + Image).
 */

let _onImageLoaded = null;

export function init(callback) {
    _onImageLoaded = callback;
    _setupFileInput();
    _setupDragDrop();
    _setupClipboard();
}

function _setupFileInput() {
    const input = document.getElementById('fileInput');
    const zone  = document.getElementById('uploadZone');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => {
        if (e.target.files.length > 0) { _processFile(e.target.files[0]); input.value = ''; }
    });
}

function _setupDragDrop() {
    const zone = document.getElementById('uploadZone');
    ['dragenter', 'dragover'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
    });
    zone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) _processFile(file);
    });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => e.preventDefault());
}

function _setupClipboard() {
    document.addEventListener('paste', e => {
        for (const item of e.clipboardData.items) {
            if (item.type.startsWith('image/')) { _processFile(item.getAsFile()); break; }
        }
    });
}

function _processFile(file) {
    if (!file.type.match(/image\/(png|jpeg|webp)/)) {
        alert('Formato no soportado. Usa PNG, JPG o WebP.');
        return;
    }
    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => { if (_onImageLoaded) _onImageLoaded(img, file.name); };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}
