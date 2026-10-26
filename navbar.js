// ==========================================
// navbar.js - الشريط العلوي الموحد لنظام ASGate CRM
// 1. استهلاك كوتا صفر (0 Cloud Reads) للبحث الشامل عبر فحص الكاش المحلي أولاً
// 2. ترتيب الصفحات المعتمد: الرئيسية - الزيارات - الفرص - العملاء - المبيعات - التذكيرات
// 3. دعم الوضع الليلي (Dark Mode) والحفظ التلقائي في الذاكرة المحلية
// 4. حماية من ثغرات XSS وتعقيم المدخلات
// ==========================================

let searchTimeout = null;
let isNavbarInitialized = false;

const navbarStyles = `
#navbarPlaceholder {
    height: 58px;
    min-height: 58px;
    max-height: 58px;
    flex-shrink: 0;
    flex-grow: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    display: block;
    overflow: visible;
    box-sizing: border-box;
}

.top-navbar[data-unified="true"] {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #ffffff;
    height: 58px;
    min-height: 58px;
    max-height: 58px;
    padding: 0 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    position: sticky;
    top: 0;
    z-index: 99999;
    border-bottom: 1px solid #e2e8f0;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    font-family: 'Cairo', sans-serif;
    line-height: 1;
    gap: 15px;
}

.top-navbar * {
    box-sizing: border-box;
    font-family: 'Cairo', sans-serif;
}

.top-navbar .nav-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 15px;
    color: #0f172a;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1;
    text-decoration: none;
}

.top-navbar .nav-links {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    height: 100%;
    flex-shrink: 0;
}

.top-navbar .nav-links a {
    text-decoration: none;
    color: #334155;
    font-weight: 700;
    font-size: 12.5px;
    padding: 0 11px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    border-radius: 6px;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    line-height: 1;
    white-space: nowrap;
}

.top-navbar .nav-links a:hover {
    background-color: #f1f5f9;
    color: #2563eb;
}

.top-navbar .nav-links a.active {
    background-color: #2563eb !important;
    color: #ffffff !important;
    font-weight: 800;
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
}

.top-navbar .nav-search-container { 
    position: relative; 
    width: 100%; 
    max-width: 320px;
    height: 36px;
    flex-shrink: 1;
    display: flex;
    align-items: center;
}
.top-navbar .nav-search-input-wrapper { 
    position: relative; 
    display: flex; 
    align-items: center;
    width: 100%;
    height: 100%;
}
.top-navbar .nav-search-input-wrapper i.search-icon { 
    position: absolute; 
    right: 14px; 
    color: #94a3b8; 
    font-size: 13px;
    line-height: 1;
    pointer-events: none;
}
.top-navbar #globalSearchInput {
    width: 100%;
    padding: 0 38px 0 15px;
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    background-color: #f8fafc;
    color: #1e293b;
    font-family: 'Cairo', sans-serif;
    font-size: 12px;
    outline: none;
    height: 36px;
    min-height: 36px;
    max-height: 36px;
    line-height: 36px;
    box-sizing: border-box;
    transition: all 0.2s ease;
}
.top-navbar #globalSearchInput:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    background-color: #ffffff;
}
.top-navbar .search-results-dropdown {
    position: absolute; 
    top: calc(100% + 8px); 
    right: 0; 
    left: 0;
    background: #ffffff; 
    border: 1px solid #e2e8f0; 
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15); 
    max-height: 380px; 
    overflow-y: auto;
    display: none; 
    z-index: 1050; 
    text-align: right;
}
.top-navbar .search-results-dropdown.show { display: block; }
.top-navbar .search-result-item {
    display: flex; 
    flex-direction: column; 
    gap: 4px; 
    padding: 10px 14px;
    border-bottom: 1px solid #f1f5f9; 
    text-decoration: none; 
    color: #1e293b;
    transition: background-color 0.15s ease;
}
.top-navbar .search-result-item:hover { background-color: #f8fafc; }
.top-navbar .result-header { display: flex; justify-content: space-between; align-items: center; }
.top-navbar .result-title { font-weight: 700; font-size: 12.5px; color: #1e293b; }
.top-navbar .result-badge { font-size: 10px; padding: 2px 8px; border-radius: 12px; font-weight: 700; }
.badge-customers { background: #e0f2fe; color: #0284c7; }
.badge-visits { background: #dcfce7; color: #16a34a; }
.badge-opportunities { background: #fef3c7; color: #d97706; }
.badge-sales { background: #f3e8ff; color: #7e22ce; }
.badge-reminders { background: #fee2e2; color: #dc2626; }
.top-navbar .result-details { font-size: 11px; color: #64748b; }
.top-navbar .search-no-results { padding: 16px; text-align: center; color: #64748b; font-size: 12px; }
.top-navbar .nav-actions { display: flex; align-items: center; gap: 8px; height: 100%; flex-shrink: 0; }
.top-navbar .nav-btn {
    background: transparent; 
    border: 1px solid #e2e8f0; 
    color: #475569;
    width: 36px; 
    height: 36px; 
    min-width: 36px; 
    min-height: 36px;
    max-width: 36px; 
    max-height: 36px;
    border-radius: 8px;
    cursor: pointer; 
    display: flex; 
    align-items: center;
    justify-content: center; 
    font-size: 14px;
    line-height: 1;
    padding: 0;
    transition: all 0.2s ease;
}
.top-navbar .nav-btn:hover { background-color: #f1f5f9; color: #2563eb; border-color: #cbd5e1; }

body.dark-mode .top-navbar[data-unified="true"] { background-color: #1e293b; border-bottom-color: #334155; }
body.dark-mode .top-navbar .nav-brand { color: #f8fafc; }
body.dark-mode .top-navbar .nav-links a { color: #cbd5e1; }
body.dark-mode .top-navbar .nav-links a:hover { background-color: #334155; color: #60a5fa; }
body.dark-mode .top-navbar .nav-links a.active { background-color: #2563eb !important; color: #ffffff !important; }
body.dark-mode .top-navbar #globalSearchInput { background-color: #0f172a; border-color: #334155; color: #f8fafc; }
body.dark-mode .top-navbar .search-results-dropdown { background-color: #1e293b; border-color: #334155; }
body.dark-mode .top-navbar .search-result-item { border-bottom-color: #334155; color: #f8fafc; }
body.dark-mode .top-navbar .search-result-item:hover { background-color: #334155; }
body.dark-mode .top-navbar .result-title { color: #f8fafc; }
body.dark-mode .top-navbar .result-details { color: #94a3b8; }
body.dark-mode .top-navbar .nav-btn { border-color: #334155; color: #cbd5e1; }
body.dark-mode .top-navbar .nav-btn:hover { background-color: #334155; color: #60a5fa; }
`;

function injectNavbarStyles() {
    if (document.getElementById('unified-navbar-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'unified-navbar-styles';
    styleEl.textContent = navbarStyles;
    document.head.insertBefore(styleEl, document.head.firstChild);
}

function injectNavbarHTML() {
    const placeholder = document.getElementById('navbarPlaceholder');
    if (!placeholder) return;
    if (placeholder.querySelector('.top-navbar')) {
        return;
    }

    placeholder.innerHTML = `
    <nav class="top-navbar" data-unified="true">
        <div style="display:flex; align-items:center; gap:16px; height:100%;">
            <a href="index.html" class="nav-brand">
                <i class="fas fa-layer-group" style="color:#2563eb;"></i> ASGate CRM
            </a>
            <ul class="nav-links">
                <li><a href="index.html" id="nav-index"><i class="fas fa-home"></i> الرئيسية</a></li>
                <li><a href="visits.html" id="nav-visits"><i class="fas fa-map-marker-alt"></i> الزيارات</a></li>
                <li><a href="opportunities.html" id="nav-opportunities"><i class="fas fa-lightbulb"></i> الفرص البيعية</a></li>
                <li><a href="customers.html" id="nav-customers"><i class="fas fa-users"></i> العملاء</a></li>
                <li><a href="sales.html" id="nav-sales"><i class="fas fa-shopping-cart"></i> المبيعات</a></li>
                <li><a href="reminders.html" id="nav-reminders"><i class="fas fa-bell"></i> التذكيرات</a></li>
            </ul>
        </div>
        <div style="display:flex; align-items:center; gap:10px; height:100%;">
            <div class="nav-search-container">
                <div class="nav-search-input-wrapper">
                    <i class="fas fa-search search-icon"></i>
                    <input type="text" id="globalSearchInput" placeholder="بحث شامل في النظام...">
                </div>
                <div id="searchResults" class="search-results-dropdown"></div>
            </div>
            <div class="nav-actions">
                <button class="nav-btn" id="darkModeToggle" title="تبديل الوضع الليلي"><i class="fas fa-moon"></i></button>
            </div>
        </div>
    </nav>
    `;
}

function getCleanPageKey(urlStr) {
    if (!urlStr) return '';
    let clean = String(urlStr).split('?')[0].split('#')[0].toLowerCase();
    clean = clean.split('/').pop().trim();
    clean = clean.replace(/^(\.|\/)+/, '');
    if (clean === '' || clean === 'index' || clean === 'index.html') return 'index';
    return clean.replace(/\.html$/, '');
}

function highlightActiveLink() {
    const currentPageKey = getCleanPageKey(window.location.pathname);
    
    document.querySelectorAll('.top-navbar .nav-links a').forEach(link => {
        link.classList.remove('active');
        const linkPageKey = getCleanPageKey(link.getAttribute('href'));
        
        if (currentPageKey === linkPageKey) {
            link.classList.add('active');
        } else if (currentPageKey === 'customer-details' && linkPageKey === 'customers') {
            link.classList.add('active');
        } else if (currentPageKey === 'order_details' && linkPageKey === 'sales') {
            link.classList.add('active');
        }
    });
}

function toggleDarkModeHandler() {
    document.body.classList.toggle('dark-mode');
    const darkActive = document.body.classList.contains('dark-mode');
    try { localStorage.setItem('crm_dark_mode', darkActive ? 'true' : 'false'); } catch(e) {}
    
    const icon = document.querySelector('#darkModeToggle i');
    if (icon) {
        if (darkActive) { icon.classList.replace('fa-moon', 'fa-sun'); }
        else { icon.classList.replace('fa-sun', 'fa-moon'); }
    }
}

function initDarkMode() {
    const toggleBtn = document.getElementById('darkModeToggle');
    if (!toggleBtn) return;
    
    const icon = toggleBtn.querySelector('i');
    let isDark = false;
    try { isDark = localStorage.getItem('crm_dark_mode') === 'true'; } catch(e) {}
    if (isDark) {
        document.body.classList.add('dark-mode');
        if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
    }

    toggleBtn.removeEventListener('click', toggleDarkModeHandler);
    toggleBtn.addEventListener('click', toggleDarkModeHandler);
}

function getLocalSearchIndex() {
    const allData = [];

    // 1. العملاء
    try {
        const custs = JSON.parse(localStorage.getItem('crm_customers') || '[]');
        custs.forEach(c => {
            allData.push({
                type: 'customer',
                title: c.comp || c.name || 'عميل',
                code: c.code || '',
                details: `المسؤول: ${c.mgr || '-'} | هاتف: ${c.mob || '-'} | المدينة: ${c.city || '-'}`,
                url: `customer-details.html?code=${encodeURIComponent(c.code || '')}`,
                searchTokens: [c.comp, c.name, c.mgr, c.mob, c.email, c.city, c.code, c.cr1, c.cr].join(' ').toLowerCase()
            });
        });
    } catch(e){}

    // 2. الزيارات
    try {
        const rawVisits = localStorage.getItem('asgate_visits_local_cache_v1');
        if (rawVisits) {
            const parsed = JSON.parse(rawVisits);
            const visits = Array.isArray(parsed) ? parsed : Object.values(parsed);
            visits.forEach(v => {
                allData.push({
                    type: 'visit',
                    title: v.comp || v.mgr || 'زيارة',
                    code: v.id || '',
                    details: `تاريخ: ${v.visitDate || '-'} | الحالة: ${v.status || '-'} | المسؤول: ${v.mgr || '-'}`,
                    url: `visits.html`,
                    searchTokens: [v.comp, v.mgr, v.mob, v.curServ, v.status, v.owner].join(' ').toLowerCase()
                });
            });
        }
    } catch(e){}

    // 3. الفرص البيعية
    try {
        const rawOpps = localStorage.getItem('asgate_opportunities_local_cache_v1');
        if (rawOpps) {
            const parsed = JSON.parse(rawOpps);
            const opps = Array.isArray(parsed) ? parsed : Object.values(parsed);
            opps.forEach(o => {
                allData.push({
                    type: 'opportunity',
                    title: o.comp || o.mgr || 'فرصة بيعية',
                    code: o.id || '',
                    details: `قيمة: ${o.oppValue || 0} ر.س | الحالة: ${o.status || '-'} | المسؤول: ${o.mgr || '-'}`,
                    url: `opportunities.html`,
                    searchTokens: [o.comp, o.mgr, o.mob, o.curServ, o.status, o.owner].join(' ').toLowerCase()
                });
            });
        }
    } catch(e){}

    // 4. المبيعات
    try {
        const sales = JSON.parse(localStorage.getItem('asgate_sales_db') || '[]');
        sales.forEach(s => {
            allData.push({
                type: 'sale',
                title: `${s.type || 'طلب مبيعات'} - ${s.comp || ''}`,
                code: s.id ? `#${s.id}` : '',
                details: `الشركة: ${s.comp || '-'} | الحالة: ${s.status || '-'} | التاريخ: ${s.date || '-'}`,
                url: `order_details.html?id=${encodeURIComponent(s.id || '')}`,
                searchTokens: [s.id, s.type, s.comp, s.cr, s.status, s.owner].join(' ').toLowerCase()
            });
        });
    } catch(e){}

    // 5. التذكيرات
    try {
        const reminders = JSON.parse(localStorage.getItem('asgate_reminders_data_v1') || '[]');
        reminders.forEach((r) => {
            if (r.title || r.text) {
                allData.push({
                    type: 'reminder',
                    title: r.title || 'تذكير',
                    code: r.date || '',
                    details: `${(r.text || '').substring(0, 50)}...`,
                    url: `reminders.html`,
                    searchTokens: [r.title, r.text, r.date].join(' ').toLowerCase()
                });
            }
        });
    } catch(e){}

    return allData;
}

function handleSearchInput(e) {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim().toLowerCase();
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;

    if (query.length < 2) { 
        resultsContainer.classList.remove('show'); 
        return; 
    }
    
    searchTimeout = setTimeout(() => { 
        performGlobalSearch(query, resultsContainer); 
    }, 150);
}

function handleDocumentClick(e) {
    const resultsContainer = document.getElementById('searchResults');
    if (resultsContainer && !e.target.closest('.nav-search-container')) {
        resultsContainer.classList.remove('show');
    }
}

function initGlobalSearch() {
    const globalInput = document.getElementById('globalSearchInput');
    if (!globalInput) return;

    globalInput.removeEventListener('input', handleSearchInput);
    globalInput.addEventListener('input', handleSearchInput);

    document.removeEventListener('click', handleDocumentClick);
    document.addEventListener('click', handleDocumentClick);
}

function performGlobalSearch(query, container) {
    const searchIndex = getLocalSearchIndex();
    const matched = searchIndex.filter(item => item.searchTokens.includes(query)).slice(0, 10);
    renderSearchResults(matched, container, query);
}

function renderSearchResults(results, container, query) {
    container.innerHTML = '';
    if (results.length === 0) {
        container.innerHTML = `<div class="search-no-results">لا توجد نتائج مطابقة لـ "${escapeHTML(query)}"</div>`;
    } else {
        results.forEach(res => {
            let badgeClass = 'badge-customers'; 
            let badgeText = 'عميل';
            if (res.type === 'visit') { badgeClass = 'badge-visits'; badgeText = 'زيارة'; }
            if (res.type === 'opportunity') { badgeClass = 'badge-opportunities'; badgeText = 'فرصة'; }
            if (res.type === 'sale') { badgeClass = 'badge-sales'; badgeText = 'مبيعات'; }
            if (res.type === 'reminder') { badgeClass = 'badge-reminders'; badgeText = 'تذكير'; }
            
            const item = document.createElement('a');
            item.href = res.url;
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="result-header">
                    <span class="result-title">${escapeHTML(res.title)} ${res.code ? `<span style="color:#64748b; font-size:10px;">(${escapeHTML(res.code)})</span>` : ''}</span>
                    <span class="result-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="result-details"><span>${escapeHTML(res.details)}</span></div>
            `;
            container.appendChild(item);
        });
    }
    container.classList.add('show');
}

function escapeHTML(str) { 
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])); 
}

function initNavbarComponent() {
    if (isNavbarInitialized) return;
    isNavbarInitialized = true;
    injectNavbarStyles();
    injectNavbarHTML();
    highlightActiveLink();
    initDarkMode();
    initGlobalSearch();
}

export function initNavbar() { initNavbarComponent(); }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbarComponent);
} else {
    initNavbarComponent();
}
