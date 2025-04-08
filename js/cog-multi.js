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

// Create GeoTIFF source
const cogSource = new ol.source.GeoTIFF({
    normalize: false,
    interpolate: false,
    sources: [{
        url: cogUrl,
        nodata: NaN
    }],
    projection: 'EPSG:29902'
});

const variables = {
    vert: 1,
    sunEl: 45,
    // Remove single sunAz as we'll use multiple angles
};

// Hillshade calculations for multiple angles
const dp = ['*', 2, ['resolution']];
const z0x = ['*', ['var', 'vert'], ['band', 1, -1, 0]];
const z1x = ['*', ['var', 'vert'], ['band', 1, 1, 0]];
const dzdx = ['/', ['-', z1x, z0x], dp];
const z0y = ['*', ['var', 'vert'], ['band', 1, 0, -1]];
const z1y = ['*', ['var', 'vert'], ['band', 1, 0, 1]];
const dzdy = ['/', ['-', z1y, z0y], dp];
const slope = ['atan', ['sqrt', ['+', ['^', dzdx, 2], ['^', dzdy, 2]]]];
const aspect = ['clamp', ['atan', ['-', 0, dzdx], dzdy], -Math.PI, Math.PI];
const sunEl = ['*', Math.PI / 180, ['var', 'sunEl']];

// Calculate hillshade for each direction
function calculateHillshade(azimuth) {
    const sunAz = ['*', Math.PI / 180, azimuth];
    return [
        '+',
        ['*', ['sin', sunEl], ['cos', slope]],
        ['*', ['cos', sunEl], ['sin', slope], ['cos', ['-', sunAz, aspect]]],
    ];
}

// Calculate hillshades for four directions
const hillshade225 = calculateHillshade(225); // 225 degrees
const hillshade270 = calculateHillshade(270); // 270 degrees
const hillshade315 = calculateHillshade(315); // 315 degrees
const hillshade360 = calculateHillshade(360); // 360 degrees

// Blend the hillshades (average of all directions)
const blendedHillshade = ['/', ['+', hillshade225, hillshade270, hillshade315, hillshade360], 4];
const scaled = ['*', 255, blendedHillshade];

// Update COG layer style
const cogLayer = new ol.layer.WebGLTile({
    source: cogSource,
    opacity: 1.0,
    style: {
        variables: variables,
        color: [
            'case',
            // Check for nodata value first
            ['==', ['band', 1], -9999.0],
            [0, 0, 0, 0],
            // Only calculate hillshade for valid data
            [
                'case',
                ['any',
                    ['==', ['band', 1, -1, 0], -9999.0],
                    ['==', ['band', 1, 1, 0], -9999.0],
                    ['==', ['band', 1, 0, -1], -9999.0],
                    ['==', ['band', 1, 0, 1], -9999.0]
                ],
                [0, 0, 0, 0],
                ['color', scaled]
            ]
        ]
    }
});

map.addLayer(cogLayer);

// Add elevation display handler
const elevationOut = document.getElementById('elevationOut');
function displayElevation(event) {
    const data = cogLayer.getData(event.pixel);
    if (data && data[0] !== undefined && data[0] !== -9999.0) {
        elevationOut.innerText = `${data[0].toFixed(1)} m`;
    } else {
        elevationOut.innerText = 'No data';
    }
}

// Add pointer move event listener
map.on('pointermove', displayElevation);

// Add transparency slider event listener
document.getElementById('transparency').addEventListener('input', function() {
    const opacity = 1 - (parseInt(this.value) / 100);
    cogLayer.setOpacity(opacity);
});

// Add controls event listeners
const controlIds = ['vert', 'sunEl'];
controlIds.forEach(function (id) {
    const control = document.getElementById(id);
    const output = document.getElementById(id + 'Out');
    function updateValues() {
        output.innerText = control.value;
        variables[id] = Number(control.value);
    }
    updateValues();
    control.addEventListener('input', function () {
        updateValues();
        cogLayer.updateStyleVariables(variables);
    });
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
