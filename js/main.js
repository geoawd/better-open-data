// Constants
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

// Add new provider colors
const PROVIDER_COLORS = {
    'DfI': 'success',
    'Rivers Agency': 'info',
    'DfC': 'primary'
};

// Variables
let currentPage = 1;
let datasets = [];
let filteredDatasets = [];
let itemsPerPage = 16;
let currentSort = { field: null, ascending: true };
let activeFilters = { category: [], fileType: [], provider: [] };
let currentView = 'card';  // Change default view to card

// Load JSON data
async function loadDatasets() {
    try {
        const response = await fetch('../data/datasets.json');
        datasets = await response.json();
        filteredDatasets = [...datasets];
        updateFilterPills(); // Add this line
        updateDatasetCount(); // Add this line
        renderContent();  // Remove setView('table') since we set defaults in HTML
        renderPagination();
    } catch (error) {
        console.error('Error loading datasets:', error);
    }
}

// Format file size
function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

// Create pill element
function createPill(text, colorMap, clickable = false) {
    const type = text.toLowerCase();
    const color = colorMap[text] || 'secondary';
    return `<span class="badge bg-${color}${clickable ? ' clickable-pill' : ''}" 
            data-value="${text}">${text}</span>`;
}

// Create multiple pills for comma-separated values
function createPills(values, colorMap, clickable = false) {
    return values.split(',')
        .map(value => value.trim())
        .map(value => createPill(value, colorMap, clickable))
        .join(' ');
}

function sortDatasets(field) {
    if (currentSort.field === field) {
        currentSort.ascending = !currentSort.ascending;
    } else {
        currentSort.field = field;
        currentSort.ascending = true;
    }

    filteredDatasets.sort((a, b) => {
        let comparison = 0;
        const valueA = a[field];
        const valueB = b[field];

        if (field === 'fileSize') {
            comparison = valueA - valueB;
        } else {
            comparison = String(valueA).localeCompare(String(valueB));
        }

        return currentSort.ascending ? comparison : -comparison;
    });

    renderContent();
}

function renderTable() {
    const tableBody = document.getElementById('dataset-table-body');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredDatasets.slice(startIndex, endIndex);

    tableBody.innerHTML = pageData.map(dataset => `
        <tr>
            <td>${dataset.name}</td>
            <td>${dataset.description}</td>
            <td>${createPills(dataset.category, CATEGORY_COLORS, true)}</td>
            <td>${createPills(dataset.provider, PROVIDER_COLORS, true)}</td>
            <td>${createPills(dataset.fileType, FILE_TYPE_COLORS, true)}</td>
            <td>${formatFileSize(dataset.fileSize)}</td>
            <td>
                <a title="Download Data" href="${dataset.downloadUrl}" class="btn btn-sm btn-outline-primary">
                    <i class="bi bi-download"></i>
                </a>
                <a title="Preview in OpenLayers" href="/cog.html?url=https://better-open-data.com/${dataset.downloadUrl}" 
                   class="btn btn-sm btn-outline-primary">
                    <i class="bi bi-map"></i>
                </a>
                <button class="btn btn-sm btn-outline-secondary copy-url" 
                        data-url="https://better-open-data.com/${dataset.downloadUrl}">
                    <i class="bi bi-clipboard"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderCards() {
    const cardContainer = document.getElementById('cardContainer');
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
                           <a title="Preview in Openlayers" 
                               href="/cog.html?url=${dataset.downloadUrl}" 
                               class="btn btn-sm btn-outline-primary">
                                <i class="bi bi-map"></i>
                            </a>
                            <button class="btn btn-sm btn-outline-secondary copy-url" 
                                    data-url="https://better-open-data.com/${dataset.downloadUrl}">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </div>
                        ${dataset.opendatani_url ? `
                            <div class="mt-2">
                                <a href="${dataset.opendatani_url}" target="_blank" 
                                   class="btn btn-sm btn-outline-secondary w-100">
                                    Original Data <i class="bi bi-box-arrow-up-right"></i>
                                </a>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderPagination() {
    const totalPages = Math.ceil(filteredDatasets.length / itemsPerPage);
    const pagination = document.getElementById('pagination');
    
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

function updateActiveFilters() {
    const activeFiltersContainer = document.getElementById('activeFilters');
    const activeFilterPills = document.getElementById('activeFilterPills');
    const hasActiveFilters = activeFilters.category.length > 0 || activeFilters.fileType.length > 0 || activeFilters.provider.length > 0;
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

    updateFilterPills(); // Add this line
    updateActiveFilters();
    updateDatasetCount(); // Add this line
    currentPage = 1;
    renderContent();
    renderPagination();
}

function clearFilters() {
    document.getElementById('search').value = '';
    activeFilters.category = [];
    activeFilters.fileType = [];
    activeFilters.provider = [];
    currentSort = { field: null, ascending: true };
    filteredDatasets = [...datasets];
    updateActiveFilters();
    updateDatasetCount(); // Add this line
    renderContent();
    renderPagination();
}

function setView(view) {
    const tableContainer = document.getElementById('tableContainer');
    const cardContainer = document.getElementById('cardContainer');
    const tableViewBtn = document.getElementById('tableView');
    const cardViewBtn = document.getElementById('cardView');

    currentView = view;
    
    if (view === 'table') {
        tableContainer.style.display = 'block';
        cardContainer.style.display = 'none';
        tableViewBtn.classList.add('active');
        cardViewBtn.classList.remove('active');
        renderTable();
    } else {
        tableContainer.style.display = 'none';
        cardContainer.style.display = 'flex';
        tableViewBtn.classList.remove('active');
        cardViewBtn.classList.add('active');
        renderCards();
    }
}

// Modify existing render function to handle both views
function renderContent() {
    if (currentView === 'table') {
        renderTable();
    } else {
        renderCards();
    }
    renderPagination();
}

function handlePillClick(value, type) {
    const filterArray = activeFilters[type];
    const index = filterArray.indexOf(value);
    
    if (index === -1) {
        filterArray.push(value);
    } else {
        filterArray.splice(index, 1);
    }
    
    applyFilters();
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

    document.getElementById('categoryFilters').innerHTML = categories
        .filter(cat => !activeFilters.category.includes(cat))
        .map(cat => createPill(cat, CATEGORY_COLORS, true))
        .join(' ');

    document.getElementById('providerFilters').innerHTML = providers
        .filter(prov => !activeFilters.provider.includes(prov))
        .map(prov => createPill(prov, PROVIDER_COLORS, true))
        .join(' ');

    document.getElementById('fileTypeFilters').innerHTML = fileTypes
        .filter(type => !activeFilters.fileType.includes(type))
        .map(type => createPill(type, FILE_TYPE_COLORS, true))
        .join(' ');
}

// Add this new function
function updateDatasetCount() {
    const count = filteredDatasets.length;
    const total = datasets.length;
    const countElement = document.getElementById('datasetCount');
    countElement.textContent = count === total ? 
        `(${count} total)` : 
        `(${count} of ${total})`;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadDatasets();
    
    document.getElementById('search').addEventListener('input', applyFilters);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    document.getElementById('itemsPerPage').addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderContent();
        renderPagination();
    });

    document.querySelector('thead').addEventListener('click', (e) => {
        const sortField = e.target.closest('.sortable')?.dataset.sort;
        if (sortField) {
            sortDatasets(sortField);
        }
    });

    document.getElementById('dataset-table-body').addEventListener('click', (e) => {
        if (e.target.closest('.copy-url')) {
            const button = e.target.closest('.copy-url');
            const url = button.dataset.url;
            navigator.clipboard.writeText(url).then(() => {
                // Temporarily change button appearance to show success
                button.innerHTML = '<i class="bi bi-check"></i>';
                button.classList.add('btn-success');
                button.classList.remove('btn-outline-secondary');
                setTimeout(() => {
                    button.innerHTML = '<i class="bi bi-clipboard"></i>';
                    button.classList.remove('btn-success');
                    button.classList.add('btn-outline-secondary');
                }, 1500);
            });
            return;
        }

        const pill = e.target.closest('.clickable-pill');
        if (pill) {
            const value = pill.dataset.value;
            if (pill.parentElement.cellIndex === 2) { // Category column
                handlePillClick(value, 'category');
            } else if (pill.parentElement.cellIndex === 3) { // Provider column
                handlePillClick(value, 'provider');
            } else if (pill.parentElement.cellIndex === 4) { // File Type column
                handlePillClick(value, 'fileType');
            }
        }
    });

    document.getElementById('pagination').addEventListener('click', (e) => {
        if (e.target.classList.contains('page-link')) {
            e.preventDefault();
            const newPage = parseInt(e.target.dataset.page);
            if (newPage && newPage !== currentPage && newPage > 0 && newPage <= Math.ceil(filteredDatasets.length / itemsPerPage)) {
                currentPage = newPage;
                renderContent();
                renderPagination();
            }
        }
    });

    // Add view toggle listeners
    document.getElementById('tableView').addEventListener('click', () => setView('table'));
    document.getElementById('cardView').addEventListener('click', () => setView('card'));

    // Add card container click handler for pills
    document.getElementById('cardContainer').addEventListener('click', (e) => {
        if (e.target.closest('.copy-url')) {
            const button = e.target.closest('.copy-url');
            const url = button.dataset.url;
            navigator.clipboard.writeText(url).then(() => {
                button.innerHTML = '<i class="bi bi-check"></i>';
                button.classList.add('btn-success');
                button.classList.remove('btn-outline-secondary');
                setTimeout(() => {
                    button.innerHTML = '<i class="bi bi-clipboard"></i>';
                    button.classList.remove('btn-success');
                    button.classList.add('btn-outline-secondary');
                }, 1500);
            });
            return;
        }

        const pill = e.target.closest('.clickable-pill');
        if (pill) {
            const value = pill.dataset.value;
            const pillContainer = pill.closest('.mb-2, .mb-3');
            if (pillContainer) {
                const allContainers = Array.from(pill.closest('.card-body').querySelectorAll('.mb-2, .mb-3'));
                const containerIndex = allContainers.indexOf(pillContainer);
                
                if (containerIndex === 0) { // First mb-2 is Category
                    handlePillClick(value, 'category');
                } else if (containerIndex === 1) { // Second mb-2 is Provider
                    handlePillClick(value, 'provider');
                } else if (containerIndex === 2) { // mb-3 is File Type
                    handlePillClick(value, 'fileType');
                }
            }
        }
    });

    // Add active filters click handler
    document.getElementById('activeFilterPills').addEventListener('click', (e) => {
        const removeButton = e.target.closest('button');
        if (removeButton) {
            const filterType = removeButton.dataset.filterType;
            const filterValue = removeButton.dataset.filterValue;
            const index = activeFilters[filterType].indexOf(filterValue);
            if (index > -1) {
                activeFilters[filterType].splice(index, 1);
                applyFilters();
            }
        }
    });

    // Add filter pills click handlers
    document.getElementById('categoryFilters').addEventListener('click', (e) => {
        const pill = e.target.closest('.clickable-pill');
        if (pill) {
            handlePillClick(pill.dataset.value, 'category');
        }
    });

    document.getElementById('providerFilters').addEventListener('click', (e) => {
        const pill = e.target.closest('.clickable-pill');
        if (pill) {
            handlePillClick(pill.dataset.value, 'provider');
        }
    });

    document.getElementById('fileTypeFilters').addEventListener('click', (e) => {
        const pill = e.target.closest('.clickable-pill');
        if (pill) {
            handlePillClick(pill.dataset.value, 'fileType');
        }
    });
});
