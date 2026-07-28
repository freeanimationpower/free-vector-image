/**
 * Main Thread — UI + Worker communication.
 * Sin lógica de vectorización. Solo estado, DOM, y postMessage al worker.
 */

import { renderSource } from './preprocessor.js';
import { init as initImageLoader } from './imageLoader.js';
import { displaySource, displayVector, showEmpty } from './renderer.js';
import { downloadSVG, downloadPNG, downloadEPS } from './exporter.js';
import { Debug } from './debug.js';
import * as Editor from './vectorEditor.js';

// ─── WORKER ────────────────────────────
let worker = null;

function _createWorker() {
    if (worker) { worker.terminate(); worker = null; }
    worker = new Worker('js/worker.js', { type: 'module' });
    worker.onmessage = _onWorkerMessage;
    return worker;
}

// ─── WORKER → MAIN ─────────────────────
function _onWorkerMessage(e) {
    const msg = e.data;
    switch (msg.type) {
        case 'eps-result':
            downloadEPS(msg.epsCode, msg.filename);
            break;
        case 'ready':
            state.engine = msg.engine;
            state.svgoReady = msg.svgoReady;
            Debug.log('worker', { label: 'READY', engine: msg.engine, svgo: msg.svgoReady });
            _updateEngineBadge();
            _updateUI();
            _updateDebugPanel();
            break;
        case 'progress':
            _showProgress();
            break;
        case 'result':
            clearTimeout(crashTimeout);
            state.svgCode = msg.svgCode;
            state.isProcessing = false;
            Debug.log('worker', { label: 'RESULT', nodes: msg.stats.nodes, paths: msg.stats.paths, elapsed: msg.stats.timeMs });
            displayVector(svgContainer, msg.svgCode);
            _showStats(msg.stats.nodes, msg.stats.paths, msg.stats.timeMs);
            _hideProgress();
            _updateUI();
            _updateDebugPanel();
            _createWorker(); // Worker fresco para la proxima vectorizacion
            break;
        case 'error':
            clearTimeout(crashTimeout);
            state.isProcessing = false;
            Debug.log('worker', { label: 'ERROR', error: true, msg: msg.message });
            alert('Error: ' + msg.message);
            _hideProgress();
            _updateUI();
            _updateDebugPanel();
            _createWorker(); // Recrear tras crash
            break;
    }
}

// ─── STATE ─────────────────────────────
const state = {
    image: null, imageName: 'imagen', svgCode: null,
    engine: null, svgoReady: false, isProcessing: false,
    activeFilter: 'color', useGaussianBlur: false,
    filterParams: { threshold: 128, levels: 4 },
    vtracerParams: {
        mode: 'spline', hierarchical: 'stacked',
        cornerThreshold: 60, maxIterations: 2,
        filterSpeckle: 8, colorPrecision: 3,
        spliceThreshold: 45, lengthThreshold: 4.0,
        layerDifference: 32, pathPrecision: 2,
        optimize: 0
    },
    imagetracerParams: { smoothness: 5, colorLayers: 30, minPathSize: 8 },
    exportScale: 1,
    editMode: false
};

// ─── DOM REFS ──────────────────────────
const sourceCanvas = document.getElementById('sourceCanvas');
const svgContainer = document.getElementById('svg-container');

let crashTimeout = null;

// ─── ZOOM STATE ────────────────────────
const zoom = {
    source: { level: 1.0, panX: 0, panY: 0, dragging: false, startX: 0, startY: 0 },
    vector: { level: 1.0, panX: 0, panY: 0, dragging: false, startX: 0, startY: 0 }
};

// ─── VECTORIZE ─────────────────────────
function handleVectorize() {
    if (!state.image || state.isProcessing) return;

    state.isProcessing = true;
    _updateUI();

    try {
        Debug.log('main', { label: 'VECTORIZE START' });

        // Timeout de seguridad: si el worker no responde en 45s, crash
        clearTimeout(crashTimeout);
        crashTimeout = setTimeout(function () {
            if (state.isProcessing) {
                state.isProcessing = false;
                _hideProgress();
                _updateUI();
                alert('Error: el worker no respondio (posible crash WASM).');
            }
        }, 45000);

        const ctx = sourceCanvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context no disponible');

        const cw = sourceCanvas.width;
        const ch = sourceCanvas.height;
        if (cw === 0 || ch === 0) throw new Error('Canvas vacio: ' + cw + 'x' + ch);

        const imageData = ctx.getImageData(0, 0, cw, ch);
        Debug.checkImageData('canvas-extract', imageData);

        const startTime = performance.now();
        worker.postMessage({
            type: 'vectorize',
            imageData,
            options: {
                filterType: state.activeFilter,
                filterParams: state.filterParams,
                useGaussianBlur: state.useGaussianBlur,
                vtracerParams: state.vtracerParams,
                imagetracerParams: state.imagetracerParams,
                engine: state.engine || 'vtracer'
            }
        }, [imageData.data.buffer]);

        Debug.log('main', { label: 'TRANSFERRED to worker', elapsed: (performance.now() - startTime).toFixed(1) });

        // El buffer de imageData fue transferido (neutered). No puede leerse.
        // _repaintCanvas redibuja desde state.image (HTMLImageElement intacto).
        _repaintCanvas();

        const afterCtx = sourceCanvas.getContext('2d');
        const afterData = afterCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        Debug.checkImageData('canvas-repaint', afterData);
    } catch (err) {
        console.error('[VECTORIZE] Error:', err.message, err);
        state.isProcessing = false;
        _hideProgress();
        _updateUI();
        alert('Error al preparar imagen: ' + err.message);
    }
}

// ─── IMAGE LOADED ──────────────────────
function handleImageLoaded(img, filename) {
    state.image = img;
    state.imageName = filename ? filename.replace(/\.[^.]+$/, '') : 'imagen';
    state.svgCode = null;
    _exitEditIfActive();
    _repaintCanvas();
    showEmpty(svgContainer, 'Presiona "Vectorizar" para procesar');
    _hideStats();
    _hideProgress();
    _updateUI();
}

function _repaintCanvas() {
    if (!state.image) return;
    renderSource(
        state.image, sourceCanvas,
        state.activeFilter, state.filterParams,
        state.useGaussianBlur
    );
}

// ─── ENGINE BADGE ──────────────────────
function _updateEngineBadge() {
    const badge = document.getElementById('engineBadge');
    if (!state.engine) {
        badge.textContent = 'Cargando...';
        badge.className = 'header-badge loading';
    } else if (state.engine === 'vtracer') {
        badge.textContent = state.svgoReady ? 'VTracer + SVGO' : 'VTracer WASM';
        badge.className = 'header-badge';
    } else {
        badge.textContent = state.svgoReady ? 'ImageTracer + SVGO' : 'ImageTracer';
        badge.className = 'header-badge fallback';
    }
}

// ─── PROGRESS ──────────────────────────
function _showProgress() {
    document.getElementById('loader').classList.add('active');
}
function _hideProgress() {
    document.getElementById('loader').classList.remove('active');
}

// ─── STATS ─────────────────────────────
function _showStats(nodes, paths, ms) {
    document.getElementById('statNodes').textContent = nodes.toLocaleString();
    document.getElementById('statPaths').textContent = paths.toLocaleString();
    document.getElementById('statTime').textContent = ms + ' ms';
    document.getElementById('statsBar').classList.add('active');
}
function _hideStats() {
    document.getElementById('statsBar').classList.remove('active');
}

// ─── SIDEBAR ───────────────────────────
function initSidebar() {
    document.querySelectorAll('.section-header').forEach(h =>
        h.addEventListener('click', () => h.classList.toggle('collapsed')));

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            if (parent.id === 'modeSelector' || parent.id === 'hierarchicalSelector') {
                parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (parent.id === 'modeSelector') state.vtracerParams.mode = btn.dataset.mode;
                else state.vtracerParams.hierarchical = btn.dataset.hierarchical;
                return;
            }
            document.querySelectorAll('#bwSettings, #posterizeSettings').forEach(s =>
                s.closest('.filter-grid')?.querySelectorAll('.filter-btn')
                    .forEach(b => b.classList.remove('active')));
            btn.classList.add('active');
            state.activeFilter = btn.dataset.filter;
            _onFilterChange();
        });
    });

    const sliderBinds = [
        ['thresholdSlider', 'thresholdVal', v => { state.filterParams.threshold = v; _onFilterChange(); }],
        ['posterizeSlider', 'posterizeVal', v => { state.filterParams.levels = v; _onFilterChange(); }],
        ['cornerSlider', 'cornerVal', v => { state.vtracerParams.cornerThreshold = v; document.getElementById('cornerVal').innerHTML = v + '&deg;'; }],
        ['iterationsSlider', 'iterationsVal', v => state.vtracerParams.maxIterations = v],
        ['speckleSlider', 'speckleVal', v => { state.vtracerParams.filterSpeckle = v; document.getElementById('speckleVal').textContent = v + ' px'; }],
        ['colorPrecSlider', 'colorPrecVal', v => state.vtracerParams.colorPrecision = v],
        ['smoothnessSlider', 'smoothnessVal', v => state.imagetracerParams.smoothness = v],
        ['colorLayersSlider', 'colorLayersVal', v => state.imagetracerParams.colorLayers = v],
        ['minPathSlider', 'minPathVal', v => state.imagetracerParams.minPathSize = v]
    ];

    sliderBinds.forEach(([sid, vid, fn]) => {
        const s = document.getElementById(sid), v = document.getElementById(vid);
        if (!s) return;
        s.addEventListener('input', () => { const val = parseInt(s.value); fn(val); if (v) v.textContent = s.value; });
    });

    document.getElementById('gaussianBlurCheck').addEventListener('change', function () {
        state.useGaussianBlur = this.checked;
        _onFilterChange();
    });

    document.getElementById('vectorizeBtn').addEventListener('click', handleVectorize);
}

function _onFilterChange() {
    if (!state.image) return;
    state.svgCode = null;
    _exitEditIfActive();
    _repaintCanvas();
    showEmpty(svgContainer, 'Presiona "Vectorizar" para procesar');
    _hideStats();
    _updateUI();
}

// ─── EXPORT ────────────────────────────
function initExport() {
    document.querySelectorAll('.res-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.res-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            state.exportScale = parseInt(opt.dataset.scale);
        });
    });

    document.getElementById('downloadBtn').addEventListener('click', handleExport);

    document.getElementById('exportFormat').addEventListener('change', function () {
        document.getElementById('resolutionOptions').style.display =
            this.value === 'png' ? 'flex' : 'none';
    });

    const editBtn = document.getElementById('editToggleBtn');
    if (editBtn) editBtn.addEventListener('click', toggleEditMode);
    const delBtn  = document.getElementById('deletePathBtn');
    if (delBtn) delBtn.addEventListener('click', function () {
        Editor.deleteSelected();
    });
}

function handleExport() {
    if (!state.svgCode) return;
    const format = document.getElementById('exportFormat').value;
    const suffix = state.engine === 'imagetracer' ? '-it' : '';

    switch (format) {
        case 'svg':
            downloadSVG(state.svgCode, state.imageName + suffix + '-vector.svg');
            break;
        case 'png':
            downloadPNG(state.svgCode, state.exportScale, state.imageName + suffix + '-' + state.exportScale + 'x.png');
            break;
        case 'eps':
            worker.postMessage({
                type: 'export-eps',
                svgCode: state.svgCode,
                filename: state.imageName + suffix + '-vector.eps'
            });
            break;
    }
}

// ─── UI STATE ──────────────────────────
function _updateUI() {
    const hasImage = !!state.image;
    const hasSVG  = !!state.svgCode;
    const isVTracer = state.engine === 'vtracer';

    document.getElementById('vectorizeBtn').disabled = !hasImage || state.isProcessing;
    document.getElementById('downloadBtn').disabled   = !hasSVG;
    document.getElementById('exportFormat').disabled   = !hasSVG;

    document.getElementById('vtracerParams').style.display = isVTracer ? '' : 'none';
    document.getElementById('imagetracerParams').style.display = isVTracer ? 'none' : '';

    document.getElementById('bwSettings').style.display =
        state.activeFilter === 'bw' ? 'flex' : 'none';
    document.getElementById('posterizeSettings').style.display =
        state.activeFilter === 'posterize' ? 'flex' : 'none';

    document.querySelectorAll('.res-option').forEach(o => {
        o.style.pointerEvents = hasSVG ? 'auto' : 'none';
        o.style.opacity = hasSVG ? '1' : '0.4';
    });

    // Edit mode buttons
    const editToggle = document.getElementById('editToggleBtn');
    const deleteBtn  = document.getElementById('deletePathBtn');
    if (editToggle && deleteBtn) {
        editToggle.style.display = hasSVG ? '' : 'none';
        editToggle.textContent = state.editMode ? 'Listo' : 'Editar';
        editToggle.classList.toggle('zoom-btn-active', state.editMode);
        deleteBtn.style.display = (hasSVG && state.editMode) ? '' : 'none';
    }
}

// ─── EDIT MODE ──────────────────────────
Editor.setOnChange(function (newSVGCode) {
    state.svgCode = newSVGCode;
});

function toggleEditMode() {
    if (!state.svgCode) return;

    state.editMode = !state.editMode;
    const container = svgContainer;

    if (state.editMode) {
        Editor.enterEditMode(container);
        container.style.cursor = 'default';
    } else {
        Editor.exitEditMode();
        container.style.cursor = '';
    }

    _updateUI();
}

function _exitEditIfActive() {
    if (state.editMode) {
        state.editMode = false;
        Editor.exitEditMode();
        svgContainer.style.cursor = '';
        _updateUI();
    }
}

// ─── ZOOM ──────────────────────────────
function initZoom() {
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.dataset.panel;
            const action = btn.dataset.action;
            const z = zoom[panel];
            if (action === 'in')   z.level = Math.min(z.level * 1.3, 4.0);
            if (action === 'out')  z.level = Math.max(z.level / 1.3, 0.25);
            if (action === 'reset') { z.level = 1.0; z.panX = 0; z.panY = 0; }
            _applyZoom(panel);
        });
    });

    document.getElementById('sourcePanel').addEventListener('wheel', e => {
        e.preventDefault();
        zoom.source.level += e.deltaY > 0 ? -0.1 : 0.1;
        zoom.source.level = Math.min(4.0, Math.max(0.25, zoom.source.level));
        _applyZoom('source');
    }, { passive: false });

    document.getElementById('vectorPanel').addEventListener('wheel', e => {
        e.preventDefault();
        zoom.vector.level += e.deltaY > 0 ? -0.1 : 0.1;
        zoom.vector.level = Math.min(4.0, Math.max(0.25, zoom.vector.level));
        _applyZoom('vector');
    }, { passive: false });

    // ─── PAN (click + arrastrar) ─────
    _initPan('sourcePanel', 'source', '#sourcePanel .view-content-wrapper');
    _initPan('vectorPanel', 'vector', '#vectorContentWrapper');
}

// ─── PAN HANDLERS ──────────────────────
function _initPan(panelId, panelKey, wrapperSel) {
    const panel = document.getElementById(panelId);
    const z = zoom[panelKey];

    panel.addEventListener('mousedown', function (e) {
        if (Editor.isEditing()) return;
        z.dragging = true;
        z.startX = e.clientX - z.panX;
        z.startY = e.clientY - z.panY;
        panel.style.cursor = 'grabbing';
        _setTransition(wrapperSel, false);
    });

    document.addEventListener('mousemove', function (e) {
        if (!z.dragging) return;
        z.panX = e.clientX - z.startX;
        z.panY = e.clientY - z.startY;
        _applyZoom(panelKey);
    });

    document.addEventListener('mouseup', function () {
        if (!z.dragging) return;
        z.dragging = false;
        panel.style.cursor = '';
        _setTransition(wrapperSel, true);
    });
}

function _setTransition(wrapperSel, enable) {
    const wrapper = document.querySelector(wrapperSel);
    if (wrapper) {
        wrapper.style.transition = enable ? '' : 'none';
    }
}

function _applyZoom(panel) {
    const z = zoom[panel];
    const wrapper = panel === 'source'
        ? document.querySelector('#sourcePanel .view-content-wrapper')
        : document.getElementById('vectorContentWrapper');
    const valEl = panel === 'source'
        ? document.getElementById('sourceZoomVal')
        : document.getElementById('vectorZoomVal');

    if (wrapper) {
        wrapper.style.transform = 'translate(' + z.panX + 'px, ' + z.panY + 'px) scale(' + z.level + ')';
    }
    if (valEl) valEl.textContent = Math.round(z.level * 100) + '%';
}

// ─── DEBUG PANEL ───────────────────────
function _updateDebugPanel() {
    const d = Debug;
    const el = (id, text, cls) => {
        const e = document.getElementById(id);
        if (e) { e.textContent = text; e.className = cls || ''; }
    };

    el('debugEngine', state.engine || 'cargando...',
       state.engine === 'vtracer' ? 'ok' : state.engine === 'imagetracer' ? 'warn' : '');

    if (sourceCanvas.width) {
        el('debugCanvas', sourceCanvas.width + 'x' + sourceCanvas.height, 'ok');
    }
}

function _updateDebugLog() {
    const panel = document.getElementById('debugLog');
    if (!panel) return;
    const recent = Debug._logs.slice(-10).reverse();
    panel.innerHTML = recent.map(e => {
        const cls = e.error ? 'error' : e.warn ? 'warn' : e.ok ? 'ok' : '';
        const text = e.t + 'ms ' + (e.label || '') + ' ' + (e.msg || '');
        return '<div class="debug-entry ' + cls + '">' + text + '</div>';
    }).join('');
}

// Suscribir al log del Debug module
Debug.onLog(() => {
    _updateDebugLog();
    const last = Debug._logs[Debug._logs.length - 1];
    if (!last) return;
    if (last.label === 'canvas-extract' || last.label === 'TRANSFERRED') {
        const el = document.getElementById('debugTransfer');
        if (el) { el.textContent = last.ok ? 'OK ' + (last.dataLen||'') + 'b' : 'FAIL'; el.className = last.ok ? 'ok' : 'fail'; }
    }
    if (last.label === 'RESULT') {
        const el = document.getElementById('debugResult');
        if (el) { el.textContent = (last.nodes||0) + 'n ' + (last.paths||0) + 'p ' + (last.elapsed||'') + 'ms'; el.className = 'ok'; }
    }
});

// ─── BOOT ──────────────────────────────
_createWorker();
initImageLoader(handleImageLoaded);
initSidebar();
initZoom();
initExport();
_updateUI();
_updateEngineBadge();
