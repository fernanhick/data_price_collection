// Debug logging
console.log('=== ADMIN APP.JS LOADING ===');
console.log('Window location:', window.location.href);
console.log('Document ready state:', document.readyState);

// State
let currentPage = 1;
let totalPages = 1;
let currentFilters = {};
let editingSkuId = null;
let deleteSkuId = null;

// Constants
const API_BASE = window.location.origin;
const ITEMS_PER_PAGE = 20;

console.log('API_BASE:', API_BASE);
console.log('State initialized');

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

async function loadRecentSKUs() {
    try {
        const data = await apiRequest('GET', '/api/admin/activity/recent-skus?limit=10');

        if (data) {
            renderRecentSKUs(data.skus);
        }
    } catch (error) {
        showError('Failed to load recent SKUs: ' + error.message);
    }
}

async function loadRecentPrices() {
    try {
        const data = await apiRequest('GET', '/api/admin/activity/recent-prices?limit=10');

        if (data) {
            renderRecentPrices(data.prices);
        }
    } catch (error) {
        showError('Failed to load recent prices: ' + error.message);
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
            <td>${escapeHtml(sku.style_code || sku.sku_code)}</td>
            <td>${escapeHtml(sku.brand)}</td>
            <td>${escapeHtml(sku.model)}</td>
            <td>${sku.colorway ? escapeHtml(sku.colorway) : '-'}</td>
            <td>
                <span class="tier-badge tier-${sku.tier}">Tier ${sku.tier}</span>
            </td>
            <td>${sku.retail_price ? '$' + sku.retail_price : '-'}</td>
            <td class="actions">
                <button class="btn-sm btn-edit" onclick="showEditModal(${sku.id})">Edit</button>
                <button class="btn-sm btn-delete" onclick="showDeleteConfirm(${sku.id}, '${escapeHtml(sku.style_code || sku.sku_code)}')">Delete</button>
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

function renderRecentSKUs(skus) {
    const container = document.getElementById('recentSkusList');

    if (!skus || skus.length === 0) {
        container.innerHTML = '<div class="no-activity">No recent SKUs</div>';
        return;
    }

    container.innerHTML = skus.map(sku => {
        const timeAgo = formatTimeAgo(new Date(sku.created_at));
        return `
            <div class="activity-item">
                <div class="activity-item-main">
                    <span class="activity-sku-code">${escapeHtml(sku.sku_code)}</span>
                    <span class="activity-brand">${escapeHtml(sku.brand)} ${escapeHtml(sku.model)}</span>
                </div>
                <div class="activity-item-meta">
                    <span class="tier-badge tier-${sku.tier}">T${sku.tier}</span>
                    ${sku.retail_price ? `<span class="activity-price">$${sku.retail_price}</span>` : ''}
                    <span class="activity-time">${timeAgo}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecentPrices(prices) {
    const container = document.getElementById('recentPricesList');

    if (!prices || prices.length === 0) {
        container.innerHTML = '<div class="no-activity">No recent prices</div>';
        return;
    }

    container.innerHTML = prices.map(price => {
        const timeAgo = formatTimeAgo(new Date(price.timestamp));
        return `
            <div class="activity-item">
                <div class="activity-item-main">
                    <span class="activity-sku-code">${escapeHtml(price.sku_code)}</span>
                    <span class="activity-brand">${escapeHtml(price.brand)} ${escapeHtml(price.model)}</span>
                </div>
                <div class="activity-item-meta">
                    <span class="activity-source">${escapeHtml(price.source)}</span>
                    <span class="activity-price">$${price.price}</span>
                    <span class="activity-time">${timeAgo}</span>
                </div>
            </div>
        `;
    }).join('');
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
            // Populate form with style_code
            document.getElementById('brandStyleCode').value = sku.style_code || '';
            document.getElementById('skuCode').value = sku.sku_code || '';
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
    const brandStyleCode = document.getElementById('brandStyleCode').value.trim();
    const skuCode = document.getElementById('skuCode').value.trim();

    const formData = {
        style_code: brandStyleCode,  // Primary identifier (required)
        sku_code: skuCode || brandStyleCode,  // Auto-generate from style_code if empty
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

console.log('=== ATTACHING EVENT HANDLERS ===');
const loginForm = document.getElementById('loginForm');
console.log('Login form element:', loginForm);

if (loginForm) {
    console.log('Attaching login form submit handler');
    loginForm.addEventListener('submit', async (e) => {
        console.log('LOGIN FORM SUBMITTED!');
        e.preventDefault();

    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!email || !password) {
        errorDiv.textContent = 'Please enter email and password';
        errorDiv.style.display = 'block';
        return;
    }

    // Disable submit button during login
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    errorDiv.style.display = 'none';

    try {
        // Call login endpoint
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store token
        setToken(data.token);

        // Load dashboard
        await loadSKUs(1);
        loadRecentSKUs();
        loadRecentPrices();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        showSuccess(`Welcome, ${data.user.name || data.user.email}!`);
    } catch (error) {
        clearToken();
        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
    });
} else {
    console.error('ERROR: Login form element not found!');
}

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

// Activity refresh buttons
document.getElementById('refreshSkusBtn')?.addEventListener('click', () => {
    loadRecentSKUs();
    showSuccess('SKU activity refreshed');
});

document.getElementById('refreshPricesBtn')?.addEventListener('click', () => {
    loadRecentPrices();
    showSuccess('Price activity refreshed');
});

// ======================
// Utility Functions
// ======================

function logout() {
    clearToken();
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('emailInput').value = '';
    document.getElementById('passwordInput').value = '';
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) errorDiv.style.display = 'none';
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

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';

    return date.toLocaleDateString();
}

// ======================
// Initialization
// ======================

window.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadSKUs(1);
        loadRecentSKUs();
        loadRecentPrices();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboard').style.display = 'none';
    }
});

// Script loaded completely
console.log('=== APP.JS LOADED COMPLETELY ===');
