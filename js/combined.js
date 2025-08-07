function getDatasetFromURL() {
    const storedDataset = localStorage.getItem('selectedDataset');
    if (storedDataset) {
        localStorage.removeItem('selectedDataset'); // Clear after reading
        return storedDataset;
    }
    return null;
}

const FILE_TYPE_COLORS = {
    'tiff': 'primary',
    'gpkg': 'success',
    'csv': 'info',
    'json': 'warning',
    'COG': 'danger'
};

const CATEGORY_COLORS = {
    'LiDAR': 'success',
    'DSM' : 'info',
    'DTM' : 'primary',
    'Topography': 'warning',
    'Elevation': 'danger'
};

const PROVIDER_COLORS = {
    'DfI': 'success',
    'Rivers Agency': 'info',
    'DfC': 'primary',
    'DAERA': 'warning'
};

// Variables for both map and table functionality
let currentPage = 1;
let datasets = [];
let filteredDatasets = [];
let itemsPerPage = 16;
let currentSort = { field: null, ascending: true };
let activeFilters = { category: [], fileType: [], provider: [] };
let currentView = 'card';
let cogLayers = [];
let map;
const layerMap = new Map();
const variables = {
    vert: 1,
    sunEl: 45,
    minElevation: -25,
    maxElevation: 1000,
};

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map only once if element exists
    if (document.getElementById('map')) {
        initializeMap();
        loadDatasets();  // This will handle both map layers and data table
        
        // Handle mouse events outside elevation control to hide it when clicking outside
        document.addEventListener('click', (e) => {
            const elevationControl = document.querySelector('.elevation-control');
            const elevationToggle = document.getElementById('elevationToggle');
            if (!elevationControl.contains(e.target) && e.target !== elevationToggle && !elevationToggle.contains(e.target)) {
                elevationControl.classList.add('hidden');
            }
        });
        
        // Initialize elevation control toggle
        const elevationToggle = document.getElementById('elevationToggle');
        const elevationControl = document.querySelector('.elevation-control');
        if (elevationToggle && elevationControl) {
            elevationToggle.addEventListener('click', () => {
                elevationControl.classList.toggle('hidden');
            });
        }
    } else {
        // If no map element exists, just load the datasets for the table
        loadDatasets();
    }
});

// Main data loading function
async function loadDatasets() {
    try {
        const response = await fetch('data/datasets.json');
        datasets = await response.json();
        filteredDatasets = [...datasets];
        
        // Process datasets for both table and map
        cogLayers = datasets
            .filter(dataset => dataset.fileType && dataset.fileType.includes('COG'))
            .filter(dataset => dataset.downloadUrl && dataset.name)
            .map(dataset => ({
                url: `${dataset.downloadUrl}`,
                name: dataset.name,
                description: dataset.description || 'No description available',
                visible: false
            }));

        // Update table if it exists
        if (document.getElementById('categoryFilters')) {
            updateFilterPills();
            updateDatasetCount();
            renderContent();
        }

        // Update map if it exists
        if (document.getElementById('map')) {
            createLayerListHtml();
            initializeLayers();
        }
        
    } catch (error) {
        console.error('Error loading datasets:', error);
        document.getElementById('loading').innerHTML = 'Error loading datasets. Please try again later.';
    }
}

// Map Functionality
function initializeMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return; // Only initialize map if element exists
    
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
            center: [270000, 380000],
            zoom: 9,
            minZoom: 8
        })
    });

    const layerToggle = document.getElementById('layerToggle');
    const layerContainer = document.getElementById('layerContainer');
    
    if (layerToggle && layerContainer) {
        layerToggle.addEventListener('click', () => {
            layerContainer.classList.toggle('hidden');
        });
    }

    initializeControls();
}

function initializeControls() {
    const transparencyControl = document.getElementById('transparency');
    if (transparencyControl) {
        transparencyControl.addEventListener('input', function() {
            const opacity = 1 - (this.value / 100);
            layerMap.forEach(layer => {
                if (layer.getVisible()) {
                    layer.setOpacity(opacity);
                }
            });
        });
    }

    const controlIds = ['vert', 'sunEl'];
    controlIds.forEach(function (id) {
        const control = document.getElementById(id);
        const output = document.getElementById(id + 'Out');
        if (control && output) {
            function updateValues() {
                output.innerText = control.value;
                variables[id] = Number(control.value);
            }
            updateValues();
            control.addEventListener('input', function () {
                updateValues();
                layerMap.forEach(layer => layer.updateStyleVariables(variables));
            });
        }
    });
    
    // Initialize elevation range controls
    const minElevation = document.getElementById('minElevation');
    const maxElevation = document.getElementById('maxElevation');
    const elevationRangeOut = document.getElementById('elevationRangeOut');

    if (minElevation && maxElevation) {
        const minValueDisplay = document.getElementById('minValue');
        const maxValueDisplay = document.getElementById('maxValue');
        const clearFilterBtn = document.getElementById('clearElevationFilter');

        function updateElevationRange() {
            const min = Number(minElevation.value);
            const max = Number(maxElevation.value);
            
            // Ensure min doesn't exceed max
            if (min > max) {
                if (this === minElevation) {
                    minElevation.value = max;
                } else {
                    maxElevation.value = min;
                }
            }
            
            variables.minElevation = Number(minElevation.value);
            variables.maxElevation = Number(maxElevation.value);
            
            minValueDisplay.innerText = `${variables.minElevation}m`;
            maxValueDisplay.innerText = `${variables.maxElevation}m`;
            
            layerMap.forEach(layer => layer.updateStyleVariables(variables));
        }

        function clearElevationFilter() {
            minElevation.value = minElevation.min;
            maxElevation.value = maxElevation.max;
            updateElevationRange();
        }

        minElevation.addEventListener('input', updateElevationRange);
        maxElevation.addEventListener('input', updateElevationRange);
        clearFilterBtn.addEventListener('click', clearElevationFilter);
        updateElevationRange();
    }

    const elevationOut = document.getElementById('elevationOut');
    if (map && elevationOut) {
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
    }
    
    if (document.getElementById('loading')) {
        document.getElementById('loading').style.display = 'none';
    }
}

// Filtering function to sync map and table
function applyFilters() {
    filteredDatasets = datasets.filter(dataset => {
        const searchTerm = document.getElementById('search').value.toLowerCase();
        const matchesSearch = !searchTerm || 
            dataset.name.toLowerCase().includes(searchTerm) ||
            dataset.description.toLowerCase().includes(searchTerm);
        
        const categoryValues = dataset.category.split(',').map(c => c.trim());
        const matchesCategory = activeFilters.category.length === 0 || 
            categoryValues.some(cat => activeFilters.category.includes(cat));
        
        const fileTypeValues = dataset.fileType.split(',').map(f => f.trim());
        const matchesFileType = activeFilters.fileType.length === 0 || 
            fileTypeValues.some(type => activeFilters.fileType.includes(type));

        const providerValues = dataset.provider.split(',').map(p => p.trim());
        const matchesProvider = activeFilters.provider.length === 0 || 
            providerValues.some(prov => activeFilters.provider.includes(prov));

        return matchesSearch && matchesCategory && matchesFileType && matchesProvider;
    });

    updateFilterPills();
    updateActiveFilters();
    updateDatasetCount();
    currentPage = 1;
    renderContent();
    renderPagination();
}


// Initialize all event listeners
function initializeEventListeners() {
        
    // Add synchronization between map and table
    document.querySelectorAll('.layer-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const layerName = e.target.closest('.layer-item').dataset.name;
            const layer = layerMap.get(layerName);
            if (layer) {
                layer.setVisible(checkbox.checked);
                e.target.closest('.layer-item').classList.toggle('active', checkbox.checked);
            }
        });
    });
}

// Define Irish National Grid projection
proj4.defs('EPSG:29902', '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +ellps=airy +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs');
ol.proj.proj4.register(proj4);

function initializeLayers() {
    const urlDataset = getDatasetFromURL();
    const layerPromises = cogLayers.map(layerConfig => {
        // Set visibility based on URL parameter
        if (urlDataset && layerConfig.name === urlDataset) {
            layerConfig.visible = true;
        }
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
            
            // Update layer list UI for URL-specified dataset
            if (urlDataset) {
                const checkbox = document.querySelector(`.layer-item[data-name="${urlDataset}"] .layer-checkbox`);
                if (checkbox) {
                    checkbox.checked = true;
                    checkbox.closest('.layer-item').classList.add('active');
                }
            }
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
                [
                    'case',
                    ['all',
                        ['>=', ['band', 1], ['var', 'minElevation']],
                        ['<=', ['band', 1], ['var', 'maxElevation']]
                    ],
                    ['color', scaled],
                    [0, 0, 0, 0]
                ]
            ]
        ]
    };
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

function zoomToLayerExtent(layer) {
    layer.getSource().getView().then(sourceView => {
        if (sourceView && sourceView.extent) {
            map.getView().fit(sourceView.extent, {
                padding: [50, 50, 50, 50],
                maxZoom: 20,
                duration: 1000
            });
        }
    }).catch(handleError);
}

function createLayerListHtml() {
    const container = document.getElementById('layerList');
    if (!container) return;

    container.innerHTML = `
        <div class="layer-search sticky-top bg-white border-bottom">
            <input type="text" id="layerSearch" placeholder="Search layers...">
        </div>
        <div class="layer-list-content">
            ${cogLayers.map((layer, index) => {
                const dataset = datasets.find(d => d.name === layer.name);
                const fileSize = dataset ? formatFileSize(dataset.fileSize) : 'N/A';
                return `
                <div class="layer-item${layer.visible ? ' active' : ''}" data-index="${index}" data-name="${layer.name}">
                    <div class="form-check d-flex align-items-center">
                        <input class="form-check-input layer-checkbox" type="checkbox" value="" id="layer${index}" 
                               ${layer.visible ? 'checked' : ''}>
                        <button class="btn btn-sm btn-link zoom-to-layer p-0 mx-1" title="Zoom to Layer">
                            <i class="bi bi-zoom-in"></i>
                        </button>
                        <label class="form-check-label text-truncate" for="layer${index}">
                            ${layer.name}
                        </label>
                        <div class="ms-auto d-flex align-items-center gap-2">
                            <button class="btn btn-sm btn-link copy-url p-0" data-url="${layer.url}">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            <button class="btn btn-sm btn-link info-button p-0">
                                <i class="bi bi-info-circle"></i>
                            </button>
                        </div>
                    </div>
                    <div class="layer-description" style="display: none;">
                        <p>${layer.description}</p>
                        <div class="layer-info-section">
                            <h6>Categories</h6>
                            ${getDatasetBadges(layer.name, 'category')}
                        </div>
                        <div class="layer-info-section">
                            <h6>Providers</h6>
                            ${getDatasetBadges(layer.name, 'provider')}
                        </div>
                        <div class="download-section">
                            <a href="${layer.url}" class="btn btn-sm btn-outline-primary d-flex align-items-center" target="_blank">
                                <i class="bi bi-download me-2"></i>
                                <span>Download COG (${fileSize})</span>
                            </a>
                        </div>
                    </div>
                </div>
            `}).join('')}
        </div>
        <div class="turn-off-all-container sticky-bottom bg-white border-top">
            <button id="toggleActiveLayers" class="btn btn-outline-secondary btn-sm w-100 mb-2">
                Toggle active/inactive layers
            </button>
            <button id="turnOffAllLayers" class="btn btn-outline-secondary btn-sm w-100">
                Turn all layers off
            </button>
        </div>
    `;

    attachEventListeners();
}

function getDatasetBadges(layerName, type) {
    const dataset = datasets.find(d => d.name === layerName);
    if (!dataset) return '';
    
    const colors = type === 'category' ? CATEGORY_COLORS : PROVIDER_COLORS;
    return createPills(dataset[type], colors);
}

function attachEventListeners() {
    // Layer name click for visibility toggle
    document.querySelectorAll('.form-check-label').forEach(label => {
        label.addEventListener('click', (e) => {
            e.preventDefault();
            const layerItem = e.target.closest('.layer-item');
            const checkbox = layerItem.querySelector('.layer-checkbox');
            const layerName = layerItem.dataset.name;
            const layer = layerMap.get(layerName);
            if (layer) {
                checkbox.checked = !checkbox.checked;
                layer.setVisible(checkbox.checked);
                layerItem.classList.toggle('active', checkbox.checked);
            }
        });
    });

    // Checkbox click for visibility toggle and zoom
    document.querySelectorAll('.layer-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const layerName = e.target.closest('.layer-item').dataset.name;
            const layer = layerMap.get(layerName);
            if (layer) {
                layer.setVisible(checkbox.checked);
                e.target.closest('.layer-item').classList.toggle('active', checkbox.checked);
                if (checkbox.checked) {
                    zoomToLayerExtent(layer);
                }
            }
        });
    });

    // Download button
    document.querySelectorAll('.layer-item .bi-download').forEach(button => {
        button.addEventListener('click', (e) => {
            const layerName = e.target.closest('.layer-item').dataset.name;
            const layer = cogLayers.find(l => l.name === layerName);
            if (layer && layer.url) {
                window.open(layer.url, '_blank');
            }
        });
    });

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
            const layerName = e.target.closest('.layer-item').dataset.name;
            const layer = layerMap.get(layerName);
            if (layer) {
                layer.setVisible(checkbox.checked);
                e.target.closest('.layer-item').classList.toggle('active', checkbox.checked);
            }
        });
    });

    // Zoom button listeners
    document.querySelectorAll('.zoom-to-layer').forEach(button => {
        button.addEventListener('click', (e) => {
            const layerName = e.target.closest('.layer-item').dataset.name;
            const layer = layerMap.get(layerName);
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
                const layerName = item.dataset.name.toLowerCase();
                item.style.display = layerName.includes(searchText) ? '' : 'none';
            });
        });
    }

    // Turn off all layers button
    const turnOffAllButton = document.getElementById('turnOffAllLayers');
    if (turnOffAllButton) {
        turnOffAllButton.addEventListener('click', () => {
            layerMap.forEach((layer, name) => {
                layer.setVisible(false);
                const checkbox = document.querySelector(`.layer-item[data-name="${name}"] .layer-checkbox`);
                if (checkbox) {
                    checkbox.checked = false;
                    checkbox.closest('.layer-item').classList.remove('active');
                }
            });
        });
    }

    // Toggle active layers button
    const toggleActiveLayersBtn = document.getElementById('toggleActiveLayers');
    if (toggleActiveLayersBtn) {
        toggleActiveLayersBtn.addEventListener('click', toggleActiveLayersVisibility);
    }
}

function toggleActiveLayersVisibility() {
    const showingOnlyActive = document.getElementById('toggleActiveLayers').classList.contains('active');
    const layerItems = document.querySelectorAll('.layer-item');
    
    document.getElementById('toggleActiveLayers').classList.toggle('active');
    
    layerItems.forEach(item => {
        if (showingOnlyActive) {
            // Show all layers
            item.style.display = '';
        } else {
            // Show only active layers
            const isActive = item.classList.contains('active');
            item.style.display = isActive ? '' : 'none';
        }
    });
}

function clearFilters() {
    document.getElementById('search').value = '';
    activeFilters.category = [];
    activeFilters.fileType = [];
    activeFilters.provider = [];
    currentSort = { field: null, ascending: true };
    filteredDatasets = [...datasets];
    
    // Reset map layers
    layerMap.forEach((layer, name) => {
        layer.setVisible(false);
        const checkbox = document.querySelector(`.layer-item[data-name="${name}"] .layer-checkbox`);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.closest('.layer-item').classList.remove('active');
        }
    });

    updateActiveFilters();
    updateFilterPills();
    updateDatasetCount();
    renderContent();
    renderPagination();
}

// Add after the loadDatasets function
function getUniqueValues(field) {
    return [...new Set(datasets.flatMap(dataset => 
        dataset[field].split(',').map(value => value.trim())
    ))].sort();
}

function updateFilterPills() {
    const categories = getUniqueValues('category');
    const providers = getUniqueValues('provider');
    const fileTypes = getUniqueValues('fileType');

    if (document.getElementById('categoryFilters')) {
        document.getElementById('categoryFilters').innerHTML = categories
            .filter(cat => !activeFilters.category.includes(cat))
            .map(cat => createPill(cat, CATEGORY_COLORS, true))
            .join(' ');
    }

    if (document.getElementById('providerFilters')) {
        document.getElementById('providerFilters').innerHTML = providers
            .filter(prov => !activeFilters.provider.includes(prov))
            .map(prov => createPill(prov, PROVIDER_COLORS, true))
            .join(' ');
    }

    if (document.getElementById('fileTypeFilters')) {
        document.getElementById('fileTypeFilters').innerHTML = fileTypes
            .filter(type => !activeFilters.fileType.includes(type))
            .map(type => createPill(type, FILE_TYPE_COLORS, true))
            .join(' ');
    }
}

function updateDatasetCount() {
    const countElement = document.getElementById('datasetCount');
    if (countElement) {
        const count = filteredDatasets.length;
        const total = datasets.length;
        countElement.textContent = count === total ? 
            `(${count} total)` : 
            `(${count} of ${total})`;
    }
}

function updateActiveFilters() {
    const activeFiltersContainer = document.getElementById('activeFilters');
    const activeFilterPills = document.getElementById('activeFilterPills');
    if (!activeFiltersContainer || !activeFilterPills) return;

    const hasActiveFilters = activeFilters.category.length > 0 || 
                           activeFilters.fileType.length > 0 || 
                           activeFilters.provider.length > 0;
    let pillsHTML = '';

    // Add category filters
    activeFilters.category.forEach(category => {
        pillsHTML += `
            <div class="active-filter-pill">
                ${createPill(category, CATEGORY_COLORS)} 
                <button class="btn btn-sm btn-link text-decoration-none p-0 ms-1" 
                        data-filter-type="category" 
                        data-filter-value="${category}">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
        `;
    });

    // Add file type filters
    activeFilters.fileType.forEach(fileType => {
        pillsHTML += `
            <div class="active-filter-pill">
                ${createPill(fileType, FILE_TYPE_COLORS)}
                <button class="btn btn-sm btn-link text-decoration-none p-0 ms-1" 
                        data-filter-type="fileType" 
                        data-filter-value="${fileType}">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
        `;
    });

    // Add provider filters
    activeFilters.provider.forEach(provider => {
        pillsHTML += `
            <div class="active-filter-pill">
                ${createPill(provider, PROVIDER_COLORS)} 
                <button class="btn btn-sm btn-link text-decoration-none p-0 ms-1" 
                        data-filter-type="provider" 
                        data-filter-value="${provider}">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
        `;
    });

    activeFiltersContainer.style.display = hasActiveFilters ? 'block' : 'none';
    activeFilterPills.innerHTML = pillsHTML;
}

function renderCards() {
    const cardContainer = document.getElementById('cardContainer');
    if (!cardContainer) return;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredDatasets.slice(startIndex, endIndex);

    cardContainer.innerHTML = pageData.map(dataset => `
        <div class="col-12 col-md-6 col-lg-3">
            <div class="card h-100">
                <div class="card-body">
                    <h5 class="card-title">${dataset.name}</h5>
                    <p class="card-text">${dataset.description}</p>
                    <hr>
                    <div class="mb-2">
                        ${createPills(dataset.category, CATEGORY_COLORS, true)}
                    </div>
                    <div class="mb-2">
                        ${createPills(dataset.provider, PROVIDER_COLORS, true)}
                    </div>
                    <div class="mb-3">
                        ${createPills(dataset.fileType, FILE_TYPE_COLORS, true)}
                    </div>
                    <div class="text-end mt-auto">
                        <small class="text-muted me-2">${formatFileSize(dataset.fileSize)}</small>
                        <div class="btn-group">
                            <a title="Download Data" href="${dataset.downloadUrl}" 
                               class="btn btn-sm btn-outline-primary">
                                <i class="bi bi-download"></i>
                            </a>
                            ${document.getElementById('map') ? 
                                `<button title="Preview in Map" 
                                    class="btn btn-sm btn-outline-primary toggle-layer-btn" 
                                    data-layer-name="${dataset.name}">
                                    <i class="bi bi-map"></i>
                                </button>` :
                                `<a href="map.html" 
                                    onclick="localStorage.setItem('selectedDataset', '${dataset.name}')"
                                    title="View in Map" 
                                    class="btn btn-sm btn-outline-primary">
                                    <i class="bi bi-map"></i>
                                </a>`
                            }
                            <button class="btn btn-sm btn-outline-secondary copy-url" 
                                    data-url="${dataset.downloadUrl}">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    // Add click handlers for toggle layer buttons
    document.querySelectorAll('.toggle-layer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const layerName = btn.dataset.layerName;
            const layer = layerMap.get(layerName);
            if (layer) {
                const isVisible = !layer.getVisible();
                layer.setVisible(isVisible);
                btn.classList.toggle('active', isVisible);
                
                // Zoom to layer extent when activated
                if (isVisible) {
                    zoomToLayerExtent(layer);
                }
                
                // Update checkbox in layer list
                const checkbox = document.querySelector(`.layer-item[data-name="${layerName}"] .layer-checkbox`);
                if (checkbox) {
                    checkbox.checked = isVisible;
                    checkbox.closest('.layer-item').classList.toggle('active', isVisible);
                }
            }
        });

        // Set initial state
        const layerName = btn.dataset.layerName;
        const layer = layerMap.get(layerName);
        if (layer) {
            btn.classList.toggle('active', layer.getVisible());
        }
    });
}

function renderContent() {
    renderCards();
    renderPagination();
}

function setView(view) {
    const cardContainer = document.getElementById('cardContainer');
    if (!cardContainer) return;
    
    currentView = 'card';
    cardContainer.style.display = 'flex';
    renderCards();
}

function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

function createPill(text, colorMap, clickable = false) {
    const type = text.toLowerCase();
    const color = colorMap[text] || 'secondary';
    return `<span class="badge bg-${color}${clickable ? ' clickable-pill' : ''}" 
            data-value="${text}">${text}</span>`;
}

function createPills(values, colorMap, clickable = false) {
    return values.split(',')
        .map(value => value.trim())
        .map(value => createPill(value, colorMap, clickable))
        .join(' ');
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    const totalPages = Math.ceil(filteredDatasets.length / itemsPerPage);
    
    let pages = [];
    pages.push(1);
    for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++) {
        pages.push(i);
    }
    if (totalPages > 1) pages.push(totalPages);

    let paginationHTML = `
        <li class="page-item${currentPage === 1 ? ' disabled' : ''}">
            <a class="page-link" href="#" data-page="1">First</a>
        </li>
        <li class="page-item${currentPage === 1 ? ' disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
        </li>
    `;

    let lastNum = 0;
    pages.forEach(num => {
        if (num - lastNum > 1) {
            paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
        paginationHTML += `
            <li class="page-item${currentPage === num ? ' active' : ''}">
                <a class="page-link" href="#" data-page="${num}">${num}</a>
            </li>
        `;
        lastNum = num;
    });

    paginationHTML += `
        <li class="page-item${currentPage === totalPages ? ' disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
        </li>
        <li class="page-item${currentPage === totalPages ? ' disabled' : ''}">
            <a class="page-link" href="#" data-page="${totalPages}">Last</a>
        </li>
    `;

    pagination.innerHTML = paginationHTML;
}

// Add after attachEventListeners()
document.addEventListener('DOMContentLoaded', function() {
    // View toggle
    document.getElementById('tableView')?.addEventListener('click', () => setView('table'));
    document.getElementById('cardView')?.addEventListener('click', () => setView('card'));

    // Search input
    document.getElementById('search')?.addEventListener('input', applyFilters);

    // Items per page
    document.getElementById('itemsPerPage')?.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderContent();
        renderPagination();
    });

    // Clear filters
    document.getElementById('clearFilters')?.addEventListener('click', clearFilters);

    // Pagination
    document.getElementById('pagination')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.tagName === 'A' && e.target.dataset.page) {
            currentPage = parseInt(e.target.dataset.page);
            renderContent();
            renderPagination();
        }
    });

    // Filter pills
    document.addEventListener('click', (e) => {
        const pill = e.target.closest('.clickable-pill');
        if (pill) {
            const value = pill.dataset.value;
            if (pill.closest('#categoryFilters')) {
                activeFilters.category.push(value);
            } else if (pill.closest('#providerFilters')) {
                activeFilters.provider.push(value);
            } else if (pill.closest('#fileTypeFilters')) {
                activeFilters.fileType.push(value);
            }
            applyFilters();
        }

        // Remove filter
        const removeButton = e.target.closest('[data-filter-type]');
        if (removeButton) {
            const type = removeButton.dataset.filterType;
            const value = removeButton.dataset.filterValue;
            activeFilters[type] = activeFilters[type].filter(v => v !== value);
            applyFilters();
        }
    });

    // Copy URL buttons
    document.addEventListener('click', (e) => {
        const copyButton = e.target.closest('.copy-url');
        if (copyButton) {
            const url = copyButton.dataset.url;
            navigator.clipboard.writeText(url).then(() => {
                const icon = copyButton.querySelector('i');
                icon.className = 'bi bi-check';
                setTimeout(() => {
                    icon.className = 'bi bi-clipboard';
                }, 2000);
            });
        }
    });
});