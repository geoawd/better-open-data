// Get the COG URL from query parameters
const urlParams = new URLSearchParams(window.location.search);
const cogUrl = urlParams.get('url');

const mapDiv = document.getElementById('map');
const loadingDiv = document.getElementById('loading');

if (!cogUrl) {
    mapDiv.innerHTML = '<p style="padding: 20px;">Please provide a COG URL using the "url" parameter, e.g. ?url=https://example.com/file.tif</p>';
    throw new Error('No COG URL provided');
}

loadingDiv.style.display = 'block';
loadingDiv.textContent = 'Loading COG...';

init(cogUrl).catch(handleError);

async function init(url) {
    // Read the file's own metadata first, so we know whether it carries a CRS
    // before we build the map (this also avoids OpenLayers throwing on a
    // GeoTIFF that has no geo keys at all).
    const tiff = await GeoTIFF.fromUrl(url);
    const image = await tiff.getImage();
    const epsgCode = getEpsgCode(image);

    const sourceOptions = { sources: [{ url }] };
    let hasCrs = false;

    if (epsgCode !== null) {
        try {
            await ensureProjection(epsgCode);
            sourceOptions.projection = 'EPSG:' + epsgCode;
            hasCrs = true;
        } catch (e) {
            // We know it *has* a CRS, but couldn't resolve a proj4 definition
            // for it (e.g. offline, or an obscure/private EPSG code).
            // Fall back to a CRS-less display rather than failing outright.
            console.warn('Could not resolve EPSG:' + epsgCode + ', showing without a basemap.', e);
        }
    }

    const cogSource = new ol.source.GeoTIFF(sourceOptions);
    const cogLayer = new ol.layer.WebGLTile({ source: cogSource, opacity: 1.0 });

    // Only add a basemap when we actually have a real-world CRS to align it to.
    const layers = hasCrs
        ? [new ol.layer.Tile({ source: new ol.source.OSM() }), cogLayer]
        : [cogLayer];

    const map = new ol.Map({ target: 'map', layers, view: new ol.View() });

    // cogSource.getView() resolves to a ready-made View config: the file's
    // own projection (real CRS, or OpenLayers' built-in pixel-based
    // projection when there is none) plus a matching center/resolution/extent.
    const sourceView = await cogSource.getView();
    map.setView(new ol.View(sourceView));
    if (sourceView.extent) {
        map.getView().fit(sourceView.extent, {
            padding: [50, 50, 50, 50],
            maxZoom: 20
        });
    }

    loadingDiv.style.display = 'none';

    document.getElementById('transparency').addEventListener('input', function () {
        cogLayer.setOpacity(1 - parseInt(this.value, 10) / 100);
    });
}

// Pull an EPSG code out of the GeoTIFF's GeoKeys, if any are present.
// Returns null if the file has no CRS information at all.
function getEpsgCode(image) {
    let geoKeys;
    try {
        geoKeys = image.getGeoKeys();
    } catch (e) {
        geoKeys = null;
    }
    if (!geoKeys) return null;

    const UNDEFINED = 32767; // GeoTIFF's "value not set" sentinel
    if (geoKeys.ProjectedCSTypeGeoKey && geoKeys.ProjectedCSTypeGeoKey !== UNDEFINED) {
        return geoKeys.ProjectedCSTypeGeoKey; // projected CRS, e.g. Irish Grid, UTM zones
    }
    if (geoKeys.GeographicTypeGeoKey && geoKeys.GeographicTypeGeoKey !== UNDEFINED) {
        return geoKeys.GeographicTypeGeoKey; // geographic CRS, e.g. plain lat/lon
    }
    return null;
}

// Make sure proj4 (and therefore OpenLayers) knows about a given EPSG code,
// fetching its definition on the fly if it isn't already registered.
async function ensureProjection(epsgCode) {
    const code = 'EPSG:' + epsgCode;
    if (ol.proj.get(code)) {
        return; // already known (e.g. 4326/3857, or registered earlier)
    }
    const resp = await fetch('https://epsg.io/' + epsgCode + '.proj4');
    if (!resp.ok) {
        throw new Error('No proj4 definition found for EPSG:' + epsgCode);
    }
    const def = (await resp.text()).trim();
    if (!def) {
        throw new Error('Empty proj4 definition for EPSG:' + epsgCode);
    }
    proj4.defs(code, def);
    ol.proj.proj4.register(proj4);
}

function handleError(error) {
    console.error('Error loading COG:', error);
    loadingDiv.style.display = 'block';
    loadingDiv.textContent = 'Error loading COG: ' + error.message;
}