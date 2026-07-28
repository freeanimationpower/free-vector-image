/**
 * Debug — Instrumentación del pipeline completo.
 * Sin side effects. Solo observa y reporta.
 */
export const Debug = {
    _enabled: true,
    _logs: [],
    _maxLogs: 300,
    _t0: performance.now(),
    _listeners: [],

    enable()  { this._enabled = true;  this.log('system', 'Debug ENABLED'); },
    disable() { this._enabled = false; },

    /** Registra evento con timestamp relativo al inicio */
    log(stage, data) {
        if (!this._enabled) return;
        const entry = {
            t: (performance.now() - this._t0).toFixed(1),
            stage,
            ...data
        };
        this._logs.push(entry);
        if (this._logs.length > this._maxLogs) this._logs.shift();

        const icon = data.error ? 'ERROR' :
                     data.warn  ? 'WARN'  :
                     stage === 'check' && data.ok === false ? 'FAIL' :
                     data.ok ? 'OK' : '·';
        const parts = [icon, '@' + entry.t + 'ms'];
        if (data.label) parts.push(data.label);
        if (data.msg) parts.push(data.msg);
        if (data.width != null) parts.push(data.width + '×' + data.height);
        if (data.dataLen != null) parts.push(_fmt(data.dataLen));
        if (data.expected != null) parts.push('expect=' + _fmt(data.expected));
        if (data.elapsed != null) parts.push(data.elapsed + 'ms');
        console.log('%c[' + stage + ']', 'color:#ff6b00', ...parts);

        this._listeners.forEach(fn => fn(entry));
    },

    /** Valida ImageData y loguea */
    checkImageData(label, imageData) {
        if (!this._enabled) return true;
        if (!imageData) {
            this.log('check', { label, error: true, msg: 'ImageData es null/undefined' });
            return false;
        }
        const w = imageData.width, h = imageData.height;
        const len = imageData.data ? imageData.data.length : 0;
        const expected = w * h * 4;
        const ok = len === expected && w > 0 && h > 0;
        this.log('check', {
            label, width: w, height: h,
            dataLen: len, expected,
            ok,
            error: !ok,
            msg: !ok
                ? (w === 0 || h === 0 ? 'DIMENSIONES CERO' :
                   len === 0 ? 'BUFFER VACIO (neutered?)' :
                   'MISMATCH ' + len + ' vs ' + expected)
                : 'OK'
        });
        return ok;
    },

    /** Valida dimensiones raw */
    checkDims(label, data, width, height) {
        if (!this._enabled) return true;
        const len = data ? data.length : 0;
        const expected = width * height * 4;
        const ok = len === expected && width > 0 && height > 0;
        this.log('check', {
            label, width, height,
            dataLen: len, expected,
            ok,
            error: !ok,
            msg: !ok
                ? (width === 0 || height === 0 ? 'DIMENSIONES CERO' : 'MISMATCH')
                : 'OK'
        });
        return ok;
    },

    /** Loguea el inicio de una etapa */
    stage(label) {
        if (!this._enabled) return performance.now();
        this.log('stage', { label, msg: 'INICIO' });
        return performance.now();
    },

    /** Loguea el fin de una etapa con elapsed */
    stageEnd(label, startTime) {
        if (!this._enabled) return;
        const elapsed = (performance.now() - startTime).toFixed(1);
        this.log('stage', { label, msg: 'FIN', elapsed });
    },

    /** Suscribirse a eventos (para panel visual) */
    onLog(fn) { this._listeners.push(fn); },

    /** Volcar todos los logs */
    dump() {
        console.table(this._logs.map(e => ({
            time: e.t + 'ms',
            stage: e.stage,
            label: e.label || '',
            msg: e.msg || '',
            width: e.width || '',
            height: e.height || '',
            dataLen: e.dataLen || '',
            expected: e.expected || '',
            ok: e.hasOwnProperty('ok') ? e.ok : '',
            elapsed: e.elapsed || ''
        })));
    }
};

function _fmt(bytes) {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + 'M';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + 'K';
    return '' + bytes;
}
