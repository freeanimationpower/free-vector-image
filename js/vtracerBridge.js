/**
 * VTracer WASM Bridge — carga y ejecución del motor de vectorización.
 * ES Module. Sin dependencias de Node.js. Compatible con Web Worker.
 *
 * Memoria: vectorizePixels libera inputPtr + outputPtr explícitamente.
 */

let wasm         = null;
let wasmInstance = null;
let initialized  = false;
let initPromise  = null;

let WASM_VECTOR_LEN         = 0;
let cachedUint8ArrayMemory0 = null;
let cachedDataViewMemory0   = null;

const cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return { read: arg.length, written: buf.length };
    };
}

// ═══════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════

export async function loadVTracer(wasmPath) {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const res = await fetch(wasmPath);
        if (!res.ok) throw new Error('WASM fetch failed: ' + res.status);
        const bytes = await res.arrayBuffer();
        const mod   = await WebAssembly.instantiate(bytes, _getImports());
        wasmInstance = mod.instance;
        wasm = wasmInstance.exports;
        wasm.__wbindgen_start();
        initialized = true;
    })();

    return initPromise;
}

export function isReady() {
    return initialized;
}

/**
 * Vectoriza píxeles RGBA → SVG string.
 * Libera input + output buffers en finally{}.
 */
export function vectorizePixels(rgba, width, height, options) {
    if (!wasm) throw new Error('VTracer not initialized');

    // Invalida caches de memoria al inicio de cada vectorizacion
    cachedUint8ArrayMemory0 = null;
    cachedDataViewMemory0 = null;

    const input = (rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) ? rgba : new Uint8Array(rgba);
    const expectedLen = width * height * 4;

    if (input.length !== expectedLen) {
        console.error('[VTracer] Dimension mismatch: buffer=' + input.length +
                      ' expected=' + expectedLen + ' (' + width + 'x' + height + ')');
        throw new Error('Dimension mismatch: buffer ' + input.length +
                        ' expected ' + expectedLen);
    }

    let inputPtr  = 0, inputLen  = 0;
    let outputPtr = 0, outputLen = 0;

    try {
        inputPtr = _passArray8ToWasm0(input, wasm.__wbindgen_malloc);
        inputLen = WASM_VECTOR_LEN;

        const ret = wasm.vectorize_rgba(inputPtr, inputLen, width, height, options);
        outputPtr = ret[0];
        outputLen = ret[1];

        if (ret[3]) {
            outputPtr = 0; outputLen = 0;
            throw _takeFromExternrefTable0(ret[2]);
        }

        return _getStringFromWasm0(outputPtr, outputLen);

    } finally {
        if (outputPtr && outputLen) wasm.__wbindgen_free(outputPtr, outputLen, 1);
        if (inputPtr  && inputLen)  wasm.__wbindgen_free(inputPtr,  inputLen,  1);
    }
}

export function vectorizeBytes(buffer, options) {
    if (!wasm) throw new Error('VTracer not initialized');

    const input = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer);

    let inputPtr  = 0, inputLen  = 0;
    let outputPtr = 0, outputLen = 0;

    try {
        inputPtr = _passArray8ToWasm0(input, wasm.__wbindgen_malloc);
        inputLen = WASM_VECTOR_LEN;

        const ret = wasm.vectorize_bytes(inputPtr, inputLen, options);
        outputPtr = ret[0];
        outputLen = ret[1];

        if (ret[3]) {
            outputPtr = 0; outputLen = 0;
            throw _takeFromExternrefTable0(ret[2]);
        }

        return _getStringFromWasm0(outputPtr, outputLen);

    } finally {
        if (outputPtr && outputLen) wasm.__wbindgen_free(outputPtr, outputLen, 1);
        if (inputPtr  && inputLen)  wasm.__wbindgen_free(inputPtr,  inputLen,  1);
    }
}

// ═══════════════════════════════════════
//  WASM IMPORTS (wasm-bindgen glue)
// ═══════════════════════════════════════

function _getImports() {
    return {
        './vtracer_wasm_bg.js': {
            __wbg_Error_92b29b0548f8b746(arg0, arg1) {
                return Error(_getStringFromWasm0(arg0, arg1));
            },
            __wbg_Number_9a4e0ecb0fa16705(arg0) {
                return Number(arg0);
            },
            __wbg_String_8564e559799eccda(arg0, arg1) {
                const ret = String(arg1);
                const ptr1 = _passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                const len1 = WASM_VECTOR_LEN;
                _getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                _getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_bigint_get_as_i64_d968e41184ae354f(arg0, arg1) {
                const v = arg1;
                const ret = typeof v === 'bigint' ? v : undefined;
                _getDataViewMemory0().setBigInt64(arg0 + 8 * 1, _isLikeNone(ret) ? BigInt(0) : ret, true);
                _getDataViewMemory0().setInt32(arg0 + 4 * 0, !_isLikeNone(ret), true);
            },
            __wbg___wbindgen_boolean_get_fa956cfa2d1bd751(arg0) {
                const v = arg0;
                const ret = typeof v === 'boolean' ? v : undefined;
                return _isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
            },
            __wbg___wbindgen_debug_string_c25d447a39f5578f(arg0, arg1) {
                const ret = _debugString(arg1);
                const ptr1 = _passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                const len1 = WASM_VECTOR_LEN;
                _getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                _getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_in_aca499c5de7ff5e5(arg0, arg1) { return arg0 in arg1; },
            __wbg___wbindgen_is_bigint_2f76dc55065b4273(arg0) { return typeof arg0 === 'bigint'; },
            __wbg___wbindgen_is_function_1ff95bcc5517c252(arg0) { return typeof arg0 === 'function'; },
            __wbg___wbindgen_is_null_ea9085d691f535d3(arg0) { return arg0 === null; },
            __wbg___wbindgen_is_object_a27215656b807791(arg0) { return typeof arg0 === 'object' && arg0 !== null; },
            __wbg___wbindgen_is_undefined_c05833b95a3cf397(arg0) { return arg0 === undefined; },
            __wbg___wbindgen_jsval_eq_e659fcf7b0e32763(arg0, arg1) { return arg0 === arg1; },
            __wbg___wbindgen_jsval_loose_eq_db4c3b15f63fc170(arg0, arg1) { return arg0 == arg1; },
            __wbg___wbindgen_number_get_394265ed1e1b84ee(arg0, arg1) {
                const obj = arg1;
                const ret = typeof obj === 'number' ? obj : undefined;
                _getDataViewMemory0().setFloat64(arg0 + 8 * 1, _isLikeNone(ret) ? 0 : ret, true);
                _getDataViewMemory0().setInt32(arg0 + 4 * 0, !_isLikeNone(ret), true);
            },
            __wbg___wbindgen_string_get_b0ca35b86a603356(arg0, arg1) {
                const obj = arg1;
                const ret = typeof obj === 'string' ? obj : undefined;
                const ptr1 = _isLikeNone(ret) ? 0 : _passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                const len1 = WASM_VECTOR_LEN;
                _getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                _getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_throw_344f42d3211c4765(arg0, arg1) {
                throw new Error(_getStringFromWasm0(arg0, arg1));
            },
            __wbg_call_8a2dd23819f8a60a() {
                return _handleError(function (arg0, arg1) { return arg0.call(arg1); }, arguments);
            },
            __wbg_done_89b2b13e91a60321(arg0) { return arg0.done; },
            __wbg_get_c7eb1f358a7654df() {
                return _handleError(function (arg0, arg1) { return Reflect.get(arg0, arg1); }, arguments);
            },
            __wbg_get_unchecked_6e0ad6d2a41b06f6(arg0, arg1) { return arg0[arg1 >>> 0]; },
            __wbg_get_with_ref_key_6412cf3094599694(arg0, arg1) { return arg0[arg1]; },
            __wbg_instanceof_ArrayBuffer_4480b9e0068a8adb(arg0) {
                try { return arg0 instanceof ArrayBuffer; } catch (_) { return false; }
            },
            __wbg_instanceof_Uint8Array_309b927aaf7a3fc7(arg0) {
                try { return arg0 instanceof Uint8Array; } catch (_) { return false; }
            },
            __wbg_isArray_0677c962b281d01a(arg0) { return Array.isArray(arg0); },
            __wbg_isSafeInteger_04f36e4056f1b851(arg0) { return Number.isSafeInteger(arg0); },
            __wbg_iterator_6f722e4a93058b71() { return Symbol.iterator; },
            __wbg_length_1f0964f4a5e2c6d8(arg0) { return arg0.length; },
            __wbg_length_370319915dc99107(arg0) { return arg0.length; },
            __wbg_new_cd45aabdf6073e84(arg0) { return new Uint8Array(arg0); },
            __wbg_next_6dbf2c0ac8cde20f(arg0) { return arg0.next; },
            __wbg_next_71f2aa1cb3d1e37e() {
                return _handleError(function (arg0) { return arg0.next(); }, arguments);
            },
            __wbg_prototypesetcall_4770620bbe4688a0(arg0, arg1, arg2) {
                Uint8Array.prototype.set.call(_getArrayU8FromWasm0(arg0, arg1), arg2);
            },
            __wbg_value_a5d5488a9589444a(arg0) { return arg0.value; },
            __wbindgen_cast_0000000000000001(arg0, arg1) { return _getStringFromWasm0(arg0, arg1); },
            __wbindgen_cast_0000000000000002(arg0) { return BigInt.asUintN(64, arg0); },
            __wbindgen_init_externref_table() {
                const table  = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            }
        }
    };
}

// ═══════════════════════════════════════
//  MEMORY HELPERS
// ═══════════════════════════════════════

function _passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    if (arg.length > 0 && ptr === 0) {
        throw new Error('WASM malloc failed: out of memory (' + arg.length + ' bytes)');
    }
    _getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function _passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        _getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len  = arg.length;
    let ptr  = malloc(len, 1) >>> 0;
    const mem = _getUint8ArrayMemory0();
    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) arg = arg.slice(offset);
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = _getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret  = cachedTextEncoder.encodeInto(arg, view);
        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function _getStringFromWasm0(ptr, len) {
    return _decodeText(ptr >>> 0, len);
}

function _getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null
        || cachedUint8ArrayMemory0.buffer.detached === true
        || (cachedUint8ArrayMemory0.buffer.detached === undefined
            && cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer)) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function _getDataViewMemory0() {
    if (cachedDataViewMemory0 === null
        || cachedDataViewMemory0.buffer.detached === true
        || (cachedDataViewMemory0.buffer.detached === undefined
            && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function _getArrayU8FromWasm0(ptr, len) {
    return _getUint8ArrayMemory0().subarray(ptr >>> 0, (ptr >>> 0) + len);
}

function _decodeText(ptr, len) {
    return cachedTextDecoder.decode(_getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function _takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function _addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _handleError(f, args) {
    try { return f.apply(this, args); }
    catch (e) { wasm.__wbindgen_exn_store(_addToExternrefTable0(e)); }
}

function _isLikeNone(x) {
    return x === undefined || x === null;
}

function _debugString(val) {
    const type = typeof val;
    if (type === 'number' || type === 'boolean' || val === null) return '' + val;
    if (type === 'string') return '"' + val + '"';
    if (type === 'symbol') {
        const desc = val.description;
        return desc == null ? 'Symbol' : 'Symbol(' + desc + ')';
    }
    if (type === 'function') {
        const name = val.name;
        return (typeof name === 'string' && name.length > 0) ? 'Function(' + name + ')' : 'Function';
    }
    if (Array.isArray(val)) {
        let debug = '[';
        if (val.length > 0) debug += _debugString(val[0]);
        for (let i = 1; i < val.length; i++) debug += ', ' + _debugString(val[i]);
        return debug + ']';
    }
    const builtIn = /\[object ([^\]]+)\]/.exec(toString.call(val));
    const className = builtIn && builtIn.length > 1 ? builtIn[1] : toString.call(val);
    if (className === 'Object') {
        try { return 'Object(' + JSON.stringify(val) + ')'; } catch (_) { return 'Object'; }
    }
    if (val instanceof Error) return val.name + ': ' + val.message + '\n' + val.stack;
    return className;
}
