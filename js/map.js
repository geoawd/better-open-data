// Initialize variables
let cogLayers = [];
let map;
const layerMap = new Map();
const variables = {
    vert: 1,
    sunEl: 45,
};

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    loadDatasets();
});

function initializeMap() {
    document.getElementById('loading').style.display = 'block';
    
    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
            })
        ],
        view: new ol.View({
            projection: 'EPSG:29902',
            center: [200000, 250000],
            zoom: 7
        })
    });

    // Add layer toggle functionality
    const layerToggle = document.getElementById('layerToggle');
    const layerContainer = document.getElementById('layerContainer');
    
    if (layerToggle && layerContainer) {
        layerToggle.addEventListener('click', () => {
            layerContainer.classList.toggle('hidden');
        });
    }

    initializeControls();
}

function loadDatasets() {
    fetch('data/datasets.json')
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch datasets');
            return response.json();
        })
        .then(datasets => {
            cogLayers = datasets
                .filter(dataset => dataset.fileType && dataset.fileType.includes('COG'))
                .filter(dataset => dataset.downloadUrl && dataset.name)
                .map(dataset => ({
                    url: `https://better-open-data.com/${dataset.downloadUrl}`,
                    name: dataset.name,
                    description: dataset.description || 'No description available',
                    visible: false
                }));
            
            createLayerListHtml();
            initializeLayers();
        })
        .catch(error => {
            console.error('Error loading datasets:', error);
            document.getElementById('loading').innerHTML = 'Error loading datasets. Please try again later.';
        });
}

function initializeLayers() {
    const layerPromises = cogLayers.map(layerConfig => {
        return initializeLayer(layerConfig).catch(error => {
            console.warn(`Failed to load layer ${layerConfig.name}:`, error);
            return null;
        });
    });

    Promise.allSettled(layerPromises)
        .then(results => {
            const successfulLayers = results.filter(result => result.status === 'fulfilled' && result.value);
            if (successfulLayers.length > 0) {
                calculateCombinedExtent();
            }
            document.getElementById('loading').style.display = 'none';
        });
}

function initializeLayer(layerConfig) {
    return new Promise((resolve, reject) => {
        try {
            const cogSource = new ol.source.GeoTIFF({
                normalize: false,
                interpolate: false,
                sources: [{
                    url: layerConfig.url,
                    nodata: NaN
                }],
                projection: 'EPSG:29902'
            });

            const cogLayer = new ol.layer.WebGLTile({
                source: cogSource,
                opacity: 1.0,
                visible: layerConfig.visible,
                style: createHillshadeStyle(variables)
            });

            map.addLayer(cogLayer);
            layerMap.set(layerConfig.name, cogLayer);
            resolve(cogLayer);

        } catch (error) {
            reject(error);
        }
    });
}

function createLayerListHtml() {
    const container = document.getElementById('layerList');
    if (!container) return;

    container.innerHTML = `
        <div class="layer-search">
            <input type="text" id="layerSearch" placeholder="Search layers...">
        </div>
        <div class="layer-list-content">
            ${cogLayers.map((layer, index) => `
                <div class="layer-item" data-index="${index}">
                    <div class="form-check d-flex align-items-center">
                        <input class="form-check-input layer-checkbox" type="checkbox" value="" id="layer${index}" 
                               ${layer.visible ? 'checked' : ''}>
                        <label class="form-check-label ms-2" for="layer${index}">
                            ${layer.name}
                        </label>
                        <div class="ms-auto d-flex align-items-center">
                            <button class="btn btn-sm btn-link zoom-to-layer p-0 me-2" data-index="${index}">
                                <i class="bi bi-zoom-in"></i>
                            </button>
                            <button class="btn btn-sm btn-link info-button p-0" data-index="${index}">
                                <i class="bi bi-info-circle"></i>
                            </button>
                        </div>
                    </div>
                    <div class="layer-description" style="display: none; padding: 8px; font-size: 0.9em; color: #666; background: #f8f9fa;">
                        ${layer.description}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    attachEventListeners();
}

function attachEventListeners() {
    // Info button listeners
    document.querySelectorAll('.info-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const descriptionDiv = e.currentTarget.closest('.layer-item').querySelector('.layer-description');
            if (descriptionDiv) {
                descriptionDiv.style.display = descriptionDiv.style.display === 'none' ? 'block' : 'none';
            }
        });
    });

    // Checkbox listeners
    document.querySelectorAll('.layer-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const index = parseInt(e.target.closest('.layer-item').dataset.index);
            const layer = layerMap.get(cogLayers[index].name);
            if (layer) {
                layer.setVisible(checkbox.checked);
                e.target.closest('.layer-item').classList.toggle('active', checkbox.checked);
            }
        });
    });

    // Zoom button listeners
    document.querySelectorAll('.zoom-to-layer').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.layer-item').dataset.index);
            const layer = layerMap.get(cogLayers[index].name);
            if (layer) {
                layer.setVisible(true);
                const checkbox = e.target.closest('.layer-item').querySelector('.layer-checkbox');
                if (checkbox) {
                    checkbox.checked = true;
                    e.target.closest('.layer-item').classList.add('active');
                }
                zoomToLayerExtent(layer);
            }
        });
    });

    // Search functionality
    const searchInput = document.getElementById('layerSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchText = e.target.value.toLowerCase();
            document.querySelectorAll('.layer-item').forEach(item => {
                const layerName = cogLayers[parseInt(item.dataset.index)].name.toLowerCase();
                item.style.display = layerName.includes(searchText) ? '' : 'none';
            });
        });
    }
}

// Define Irish National Grid projection
proj4.defs('EPSG:29902', '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +ellps=airy +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs');
ol.proj.proj4.register(proj4);

function zoomToLayerExtent(layer) {
    layer.getSource().getView().then(sourceView => {
        if (sourceView && sourceView.extent) {
            map.getView().fit(sourceView.extent, {
                padding: [50, 50, 50, 50],
                maxZoom: 20,
                duration: 1000  // Add smooth animation
            });
        }
    }).catch(handleError);
}

function createHillshadeStyle(variables) {
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

    function calculateHillshade(azimuth) {
        const sunAz = ['*', Math.PI / 180, azimuth];
        return [
            '+',
            ['*', ['sin', sunEl], ['cos', slope]],
            ['*', ['cos', sunEl], ['sin', slope], ['cos', ['-', sunAz, aspect]]],
        ];
    }

    const hillshade225 = calculateHillshade(225);
    const hillshade270 = calculateHillshade(270);
    const hillshade315 = calculateHillshade(315);
    const hillshade360 = calculateHillshade(360);

    const blendedHillshade = ['/', ['+', hillshade225, hillshade270, hillshade315, hillshade360], 4];
    const scaled = ['*', 255, blendedHillshade];

    return {
        variables: variables,
        color: [
            'case',
            ['==', ['band', 1], -9999.0],
            [0, 0, 0, 0],
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
    };
}

function initializeControls() {
    // Add transparency control handling
    const transparencyControl = document.getElementById('transparency');
    transparencyControl.addEventListener('input', function() {
        const opacity = 1 - (this.value / 100);
        layerMap.forEach(layer => {
            if (layer.getVisible()) {
                layer.setOpacity(opacity);
            }
        });
    });

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
            layerMap.forEach(layer => layer.updateStyleVariables(variables));
        });
    });

    const elevationOut = document.getElementById('elevationOut');
    function displayElevation(event) {
        const data = Array.from(layerMap.values())
            .filter(layer => layer.getVisible())
            .map(layer => layer.getData(event.pixel))
            .find(data => data && data[0] !== undefined && data[0] !== -9999.0);

        if (data) {
            elevationOut.innerText = `${data[0].toFixed(1)} m`;
        } else {
            elevationOut.innerText = 'No data';
        }
    }

    map.on('pointermove', displayElevation);
    document.getElementById('loading').style.display = 'none';
}

function calculateCombinedExtent() {
    let combinedExtent = null;
    const promises = [];

    layerMap.forEach((layer, name) => {
        if (layer.getVisible()) {
            promises.push(layer.getSource().getView().then(sourceView => sourceView.extent));
        }
    });

    Promise.all(promises).then(extents => {
        combinedExtent = extents.reduce((extent, currentExtent) => {
            return extent ? ol.extent.extend(extent, currentExtent) : currentExtent;
        }, null);

        if (combinedExtent) {
            map.getView().fit(combinedExtent, {
        padding: [50, 50, 50, 50],
        maxZoom: 20
            });
        }
        document.getElementById('loading').style.display = 'none';
    }).catch(handleError);
}

function handleError(error) {
    console.error('Error loading COG:', error);
    document.getElementById('loading').innerHTML = 'Error loading COG: ' + error.message;
}
