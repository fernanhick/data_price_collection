// State
let currentPage = 1;
let totalPages = 1;
let currentFilters = {};
let editingSkuId = null;
let deleteSkuId = null;

// Constants
const API_BASE = window.location.origin;
const ITEMS_PER_PAGE = 20;

// ======================
// Token Management
// ======================

function getToken() {
    return localStorage.getItem('admin_jwt_token');
}

function setToken(token) {
    // Remove all whitespace (spaces, newlines, tabs) from token
    const cleanToken = token.replace(/\s+/g, '');
    localStorage.setItem('admin_jwt_token', cleanToken);
}

function clearToken() {
    localStorage.removeItem('admin_jwt_token');
}

function isLoggedIn() {
    return !!getToken();
}

// ======================
// API Client
// ======================

async function apiRequest(method, endpoint, body = null) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);

        if (response.status === 401) {
            showError('Authentication failed. Please login again.');
            logout();
            return null;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ======================
// CRUD Operations
// ======================

async function loadSKUs(page = 1, filters = {}) {
    try {
        const params = new URLSearchParams({
            limit: ITEMS_PER_PAGE,
            offset: (page - 1) * ITEMS_PER_PAGE,
            ...filters,
        });

        const data = await apiRequest('GET', `/api/skus?${params}`);

        if (data) {
            renderSKUTable(data.skus);
            updatePagination(data);
            currentPage = page;
        }
    } catch (error) {
        showError('Failed to load sneakers: ' + error.message);
    }
}

async function createSKU(skuData) {
    try {
        const data = await apiRequest('POST', '/api/admin/skus', skuData);
        showSuccess('Sneaker created successfully!');
        closeModal();
        loadSKUs(currentPage, currentFilters);
        return data;
    } catch (error) {
        showError('Failed to create sneaker: ' + error.message);
        throw error;
    }
}

async function updateSKU(id, skuData) {
    try {
        const data = await apiRequest('PUT', `/api/admin/skus/${id}`, skuData);
        showSuccess('Sneaker updated successfully!');
        closeModal();
        loadSKUs(currentPage, currentFilters);
        return data;
    } catch (error) {
        showError('Failed to update sneaker: ' + error.message);
        throw error;
    }
}

async function deleteSKU(id) {
    try {
        const data = await apiRequest('DELETE', `/api/admin/skus/${id}`);
        showSuccess('Sneaker deleted successfully!');
        closeDeleteModal();
        loadSKUs(currentPage, currentFilters);
        return data;
    } catch (error) {
        showError('Failed to delete sneaker: ' + error.message);
        throw error;
    }
}

// ======================
// UI Rendering
// ======================

function renderSKUTable(skus) {
    const tbody = document.getElementById('skuTableBody');

    if (skus.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">No sneakers found</td></tr>';
        return;
    }

    tbody.innerHTML = skus.map(sku => `
        <tr>
            <td>${sku.id}</td>
            <td>${escapeHtml(sku.sku_code)}</td>
            <td>${escapeHtml(sku.brand)}</td>
            <td>${escapeHtml(sku.model)}</td>
            <td>${sku.colorway ? escapeHtml(sku.colorway) : '-'}</td>
            <td>
                <span class="tier-badge tier-${sku.tier}">Tier ${sku.tier}</span>
            </td>
            <td>${sku.retail_price ? '$' + sku.retail_price : '-'}</td>
            <td class="actions">
                <button class="btn-sm btn-edit" onclick="showEditModal(${sku.id})">Edit</button>
                <button class="btn-sm btn-delete" onclick="showDeleteConfirm(${sku.id}, '${escapeHtml(sku.sku_code)}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function updatePagination(data) {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');

    totalPages = Math.ceil(data.total / ITEMS_PER_PAGE);

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = !data.has_more;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

// ======================
// Modal Management
// ======================

function showCreateModal() {
    editingSkuId = null;
    document.getElementById('modalTitle').textContent = 'Create Sneaker';
    document.getElementById('skuForm').reset();
    document.getElementById('modal').style.display = 'flex';
}

async function showEditModal(id) {
    editingSkuId = id;
    document.getElementById('modalTitle').textContent = 'Edit Sneaker';

    try {
        const sku = await apiRequest('GET', `/api/skus/${id}`);

        if (sku) {
            // Populate form
            document.getElementById('skuCode').value = sku.sku_code || '';
            document.getElementById('brandStyleCode').value = sku.brand_style_code || '';
            document.getElementById('brand').value = sku.brand || '';
            document.getElementById('model').value = sku.model || '';
            document.getElementById('colorway').value = sku.colorway || '';
            document.getElementById('releaseDate').value = sku.release_date ? sku.release_date.split('T')[0] : '';
            document.getElementById('retailPrice').value = sku.retail_price || '';
            document.getElementById('category').value = sku.category || '';
            document.getElementById('tier').value = sku.tier || 2;
            document.getElementById('stockxId').value = sku.stockx_id || '';
            document.getElementById('goatId').value = sku.goat_id || '';
            document.getElementById('ebayQuery').value = sku.ebay_query || '';

            document.getElementById('modal').style.display = 'flex';
        }
    } catch (error) {
        showError('Failed to load sneaker details: ' + error.message);
    }
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
    document.getElementById('skuForm').reset();
    editingSkuId = null;
}

function showDeleteConfirm(id, skuCode) {
    deleteSkuId = id;
    document.getElementById('deleteMessage').textContent =
        `Are you sure you want to delete "${skuCode}"? This action cannot be undone.`;
    document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    deleteSkuId = null;
}

// ======================
// Form Handling
// ======================

function collectFormData() {
    const formData = {
        sku_code: document.getElementById('skuCode').value.trim(),
        brand_style_code: document.getElementById('brandStyleCode').value.trim(),
        brand: document.getElementById('brand').value.trim(),
        model: document.getElementById('model').value.trim(),
        tier: parseInt(document.getElementById('tier').value),
    };

    // Optional fields
    const colorway = document.getElementById('colorway').value.trim();
    if (colorway) formData.colorway = colorway;

    const releaseDate = document.getElementById('releaseDate').value;
    if (releaseDate) formData.release_date = releaseDate;

    const retailPrice = document.getElementById('retailPrice').value;
    if (retailPrice) formData.retail_price = parseFloat(retailPrice);

    const category = document.getElementById('category').value.trim();
    if (category) formData.category = category;

    const stockxId = document.getElementById('stockxId').value.trim();
    if (stockxId) formData.stockx_id = stockxId;

    const goatId = document.getElementById('goatId').value.trim();
    if (goatId) formData.goat_id = goatId;

    const ebayQuery = document.getElementById('ebayQuery').value.trim();
    if (ebayQuery) formData.ebay_query = ebayQuery;

    return formData;
}

// ======================
// Event Handlers
// ======================

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('tokenInput').value.trim();

    if (!token) {
        showError('Please enter a token');
        return;
    }

    setToken(token);

    // Try to load SKUs to verify token
    try {
        await loadSKUs(1);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
    } catch (error) {
        clearToken();
        showError('Invalid token. Please check and try again.');
    }
});

document.getElementById('logoutBtn')?.addEventListener('click', logout);

document.getElementById('createBtn')?.addEventListener('click', showCreateModal);

document.getElementById('skuForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = collectFormData();

    if (editingSkuId) {
        await updateSKU(editingSkuId, formData);
    } else {
        await createSKU(formData);
    }
});

document.getElementById('cancelBtn')?.addEventListener('click', closeModal);
document.getElementById('modalClose')?.addEventListener('click', closeModal);

document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => {
    if (deleteSkuId) {
        deleteSKU(deleteSkuId);
    }
});

document.getElementById('cancelDeleteBtn')?.addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalClose')?.addEventListener('click', closeDeleteModal);

// Search and filters
document.getElementById('searchInput')?.addEventListener('input', debounce((e) => {
    currentFilters = { ...currentFilters, search: e.target.value };
    loadSKUs(1, currentFilters);
}, 500));

document.getElementById('brandFilter')?.addEventListener('change', (e) => {
    if (e.target.value) {
        currentFilters = { ...currentFilters, brand: e.target.value };
    } else {
        delete currentFilters.brand;
    }
    loadSKUs(1, currentFilters);
});

document.getElementById('tierFilter')?.addEventListener('change', (e) => {
    if (e.target.value) {
        currentFilters = { ...currentFilters, tier: e.target.value };
    } else {
        delete currentFilters.tier;
    }
    loadSKUs(1, currentFilters);
});

// Pagination
document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (currentPage > 1) {
        loadSKUs(currentPage - 1, currentFilters);
    }
});

document.getElementById('nextBtn')?.addEventListener('click', () => {
    loadSKUs(currentPage + 1, currentFilters);
});

// ======================
// Utility Functions
// ======================

function logout() {
    clearToken();
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('tokenInput').value = '';
}

function showError(message) {
    showToast(message, 'error');
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ======================
// Initialization
// ======================

window.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadSKUs(1);
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboard').style.display = 'none';
    }
});
