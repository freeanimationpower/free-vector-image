/**
 * SVGO Optimizer — thin wrapper.
 * El worker ya tiene svgoModule instanciado vía import().
 */

const CONFIG = {
    multipass: true,
    plugins: [{
        name: 'preset-default',
        params: {
            overrides: {
                convertPathData: {
                    floatPrecision: 3,
                    transformPrecision: 5,
                    straightCurves: true,
                    convertToQ: true,
                    lineShorthands: true,
                    curveSmoothShorthands: true,
                    convertToZ: true,
                    collapseRepeated: true,
                    removeUseless: true,
                    utilizeAbsolute: true
                },
                mergePaths:          { force: true, floatPrecision: 3 },
                cleanupNumericValues: { floatPrecision: 3 },
                removeViewBox: false,
                removeDimensions: false,
                convertShapeToPath: false,
                convertEllipseToCircle: false,
                removeHiddenElems: false,
                removeEmptyText: false
            }
        }
    }]
};

export function optimize(svgString, svgoModule) {
    if (!svgoModule) return svgString;
    try {
        const result = svgoModule.optimize(svgString, CONFIG);
        return result.data;
    } catch (err) {
        console.warn('SVGO optimize failed:', err.message);
        return svgString;
    }
}
