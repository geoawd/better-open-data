// Define Irish National Grid projection
proj4.defs('EPSG:29902', '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +ellps=airy +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs');
ol.proj.proj4.register(proj4);

// Get the COG URL from query parameters
const urlParams = new URLSearchParams(window.location.search);
const cogUrl = urlParams.get('url');

if (!cogUrl) {
    document.getElementById('map').innerHTML = '<p style="padding: 20px;">Please provide a COG URL using the "url" parameter</p>';
    throw new Error('No COG URL provided');
}

// Show loading indicator
document.getElementById('loading').style.display = 'block';

// Create GeoTIFF source
const cogSource = new ol.source.GeoTIFF({
    sources: [{
        url: cogUrl,
    }],
    projection: 'EPSG:29902'
});

// Create base map in Irish Grid
const map = new ol.Map({
    target: 'map',
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM()
        })
    ],
    view: new ol.View({
        projection: 'EPSG:29902',
        center: [200000, 250000], // Approximate center of Ireland
        zoom: 7
    })
});
const cogLayer = new ol.layer.WebGLTile({
    source: cogSource,
    opacity: 1.0, 
});

map.addLayer(cogLayer);

// Add transparency slider event listener
document.getElementById('transparency').addEventListener('input', function() {
    const opacity = 1 - (parseInt(this.value) / 100);
    cogLayer.setOpacity(opacity);
});

// Handle source loading
cogSource.getView()
    .then(sourceView => {
        if (sourceView && sourceView.extent) {
            map.getView().fit(sourceView.extent, {
                padding: [50, 50, 50, 50],
                maxZoom: 20
            });
        }
        document.getElementById('loading').style.display = 'none';
    })
    .catch(handleError);

// Function to handle COG loading errors
function handleError(error) {
    console.error('Error loading COG:', error);
    document.getElementById('loading').innerHTML = 'Error loading COG: ' + error.message;
}
