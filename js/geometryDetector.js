/**
 * GeometryDetector — Fase 5 skeleton.
 * detect() es passthrough. Los detectores se implementan en iteraciones futuras.
 */

export class GeometryDetector {
    constructor(config = {}) {
        this.circleTolerance    = config.circleTolerance    ?? 1.0;
        this.circularityMin     = config.circularityMin     ?? 0.92;
        this.rectAngleTolerance = config.rectAngleTolerance ?? 5;
        this.ellipseTolerance   = config.ellipseTolerance   ?? 1.0;
        this.minPointsForCircle = config.minPointsForCircle ?? 6;
        this.minPointsForRect   = config.minPointsForRect   ?? 4;
    }

    detect(svgString) {
        return svgString;
    }

    _tryCircle(d, fill, stroke, opacity)     { return null; }
    _tryRectangle(d, fill, stroke, opacity)  { return null; }
    _tryEllipse(d, fill, stroke, opacity)    { return null; }
    _tryLine(d, fill, stroke, opacity)       { return null; }
    _tryPolygon(d, fill, stroke, opacity)    { return null; }

    _parsePathData(d) {
        const segments = [];
        const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
        let match;
        while ((match = regex.exec(d)) !== null) {
            const type = match[1].toUpperCase();
            const raw  = match[2].trim();
            const points = raw ? raw.split(/[\s,]+/).filter(Boolean).map(Number) : [];
            segments.push({ type, points });
        }
        return segments;
    }

    _computeBBox(segments) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let cx = 0, cy = 0;
        for (const seg of segments) {
            const pts = seg.points;
            switch (seg.type) {
                case 'M': case 'L':
                    for (let i = 0; i < pts.length; i += 2) _expand(pts[i], pts[i+1]); break;
                case 'C':
                    for (let i = 0; i < pts.length; i += 6) _expand(pts[i+4], pts[i+5]); break;
                case 'Q':
                    for (let i = 0; i < pts.length; i += 4) _expand(pts[i+2], pts[i+3]); break;
                case 'H': for (const v of pts) _expand(v, cy); break;
                case 'V': for (const v of pts) _expand(cx, v); break;
            }
            if (pts.length >= 2) { cx = pts[pts.length - 2]; cy = pts[pts.length - 1]; }
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

        function _expand(x, y) {
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
    }

    _rdpSimplify(points, epsilon) {
        if (points.length <= 2) return points;
        let maxDist = 0, maxIdx = 0;
        const first = points[0], last = points[points.length - 1];
        for (let i = 1; i < points.length - 1; i++) {
            const dist = _perpDist(points[i], first, last);
            if (dist > maxDist) { maxDist = dist; maxIdx = i; }
        }
        if (maxDist > epsilon) {
            const left  = this._rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
            const right = this._rdpSimplify(points.slice(maxIdx), epsilon);
            return left.slice(0, -1).concat(right);
        }
        return [first, last];
    }

    _fitCircleLeastSquares(points) { return { cx: 0, cy: 0, r: 0, rmsError: Infinity }; }
    _fitEllipse(points) { return { cx: 0, cy: 0, rx: 0, ry: 0, angle: 0 }; }

    _angleBetween(a, b, c) {
        const ab = Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI;
        const cb = Math.atan2(c.y - b.y, c.x - b.x) * 180 / Math.PI;
        let angle = Math.abs(ab - cb);
        if (angle > 180) angle = 360 - angle;
        return angle;
    }
}

function _perpDist(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x, dy = lineEnd.y - lineStart.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return Math.abs((dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / len);
}
