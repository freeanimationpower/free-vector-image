/**
 * VectorEditor — edicion interactiva de vectores SVG.
 * Permite seleccionar, eliminar y deshacer paths del SVG generado.
 */

const HIGHLIGHT_COLOR = 'rgba(255, 66, 0, 0.85)';
const HIGHLIGHT_WIDTH = 2;

let _editing = false;
let _container = null;
let _selectedPath = null;
let _undoStack = [];
let _onChangeCallback = null;

export function isEditing() {
    return _editing;
}

export function setOnChange(callback) {
    _onChangeCallback = callback;
}

export function enterEditMode(container) {
    if (_editing) return;
    _editing = true;
    _container = container;

    const svg = _getSVG(container);
    if (!svg) return;

    const paths = svg.querySelectorAll('path');
    let idx = 0;
    paths.forEach(function (path) {
        if (!path.getAttribute('data-path-id')) {
            path.setAttribute('data-path-id', 'p' + (idx++));
        }
        path.classList.add('path-editable');
        path.addEventListener('click', _onPathClick);
    });

    svg.addEventListener('click', _onSVGBackgroundClick);
    document.addEventListener('keydown', _onKeyDown);
}

export function exitEditMode() {
    if (!_editing) return;

    if (_selectedPath) {
        _selectedPath.classList.remove('path-selected');
        _deselectPath();
    }

    const svg = _getSVG(_container);
    if (svg) {
        const paths = svg.querySelectorAll('path');
        paths.forEach(function (path) {
            path.classList.remove('path-editable');
            path.removeEventListener('click', _onPathClick);
        });
        svg.removeEventListener('click', _onSVGBackgroundClick);
    }

    document.removeEventListener('keydown', _onKeyDown);
    _editing = false;
    _container = null;
}

export function deleteSelected() {
    if (!_selectedPath) return;

    const svg = _getSVG(_container);
    if (!svg) return;

    _undoStack.push({
        html: _selectedPath.outerHTML,
        nextSibling: _selectedPath.nextSibling,
        parent: _selectedPath.parentNode
    });

    _selectedPath.remove();
    _deselectPath();
    _syncSVGCode();
}

export function undo() {
    if (_undoStack.length === 0) return;

    const action = _undoStack.pop();
    const parent = action.parent;
    if (!parent) return;

    const temp = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    temp.innerHTML = action.html;
    const restored = temp.firstElementChild;
    if (!restored) return;

    restored.classList.add('path-editable');
    restored.addEventListener('click', _onPathClick);

    if (action.nextSibling && action.nextSibling.parentNode === parent) {
        parent.insertBefore(restored, action.nextSibling);
    } else {
        parent.appendChild(restored);
    }

    _syncSVGCode();
}

export function getSelectedPathId() {
    return _selectedPath ? _selectedPath.getAttribute('data-path-id') : null;
}

// ─── INTERNAS ──────────────────────────

function _getSVG(container) {
    return container.querySelector('svg');
}

function _onPathClick(e) {
    e.stopPropagation();
    e.preventDefault();

    if (_selectedPath === e.currentTarget) return;

    if (_selectedPath) {
        _selectedPath.classList.remove('path-selected');
    }

    _selectedPath = e.currentTarget;
    _selectedPath.classList.add('path-selected');
}

function _onSVGBackgroundClick(e) {
    if (e.target === e.currentTarget || e.target === _getSVG(_container)) {
        if (_selectedPath) {
            _selectedPath.classList.remove('path-selected');
            _deselectPath();
        }
    }
}

function _onKeyDown(e) {
    if (!_editing) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
}

function _deselectPath() {
    _selectedPath = null;
}

function _syncSVGCode() {
    if (_onChangeCallback && _container) {
        const svg = _getSVG(_container);
        if (svg) {
            const code = new XMLSerializer().serializeToString(svg);
            _onChangeCallback(code);
        }
    }
}
