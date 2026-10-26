// ==========================================
// customer-details.js - تفاصيل العميل سحابياً ومحلياً (حماية مزدوجة)
// ==========================================
import { db, doc, getDoc, updateDoc, setDoc } from './firebase-config.js';

let currentCustomer = null;
let customerCode = null;
const CUSTOMER_DETAIL_LOCAL_KEY = 'asgate_customer_detail_local_v1';
const VISITS_LOCAL_KEY = 'asgate_visits_local_cache_v1';

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHTML = escapeHTML;

function formatDateDisplay(dateString) {
    if (!dateString) return '-';
    let cleanDate = String(dateString).trim();
    if (cleanDate.includes('/')) {
        cleanDate = cleanDate.replace(/\//g, '-');
    }
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
        if (parts[0].length === 4) { 
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }
    return cleanDate;
}

function saveCustomerLocally() {
    if (!customerCode || !currentCustomer) return;
    try {
        let cache = JSON.parse(localStorage.getItem(CUSTOMER_DETAIL_LOCAL_KEY) || '{}');
        cache[customerCode] = currentCustomer;
        localStorage.setItem(CUSTOMER_DETAIL_LOCAL_KEY, JSON.stringify(cache));

        let mainCusts = JSON.parse(localStorage.getItem('crm_customers') || '[]');
        const idx = mainCusts.findIndex(c => c.code === customerCode);
        if (idx > -1) {
            mainCusts[idx] = { ...mainCusts[idx], ...currentCustomer };
            localStorage.setItem('crm_customers', JSON.stringify(mainCusts));
            localStorage.setItem('asgate_customers_cache_v1', JSON.stringify(mainCusts));
        }
    } catch (e) {
        console.error("خطأ في الحفظ المحلي لتفاصيل العميل:", e);
    }
}

async function initPage() {
    const urlParams = new URLSearchParams(window.location.search);
    customerCode = urlParams.get('code') || localStorage.getItem('last_customer_code');
    
    // إذا لم يحدد الكود، نأخذ أول عميل موجود في الكاش تلقائياً
    if (!customerCode) {
        try {
            const allCusts = JSON.parse(localStorage.getItem('crm_customers') || '[]');
            if (allCusts.length > 0) {
                customerCode = allCusts[0].code;
            }
        } catch(e){}
    }

    if (!customerCode) {
        customerCode = "CUST-00001";
    }

    try {
        localStorage.setItem('last_customer_code', customerCode);
    } catch(e){}

    // 1. الاسترجاع الفوري من الذاكرة المحلية كبديل فوري (Zero latency)
    try {
        const cache = JSON.parse(localStorage.getItem(CUSTOMER_DETAIL_LOCAL_KEY) || '{}');
        if (cache[customerCode]) {
            currentCustomer = cache[customerCode];
            populateCustomerUI();
        } else {
            const allCusts = JSON.parse(localStorage.getItem('crm_customers') || '[]');
            const found = allCusts.find(c => c.code === customerCode);
            if (found) {
                currentCustomer = found;
                populateCustomerUI();
            }
        }
    } catch(e) {
        console.error("خطأ في قراءة الذاكرة المحلية:", e);
    }

    await loadCustomerData();
}

function populateCustomerUI() {
    if (!currentCustomer) return;
    
    if (!currentCustomer.managers || currentCustomer.managers.length === 0) {
        if (currentCustomer.mgr || currentCustomer.mob || currentCustomer.email) {
            const d = new Date();
            const fallbackDate = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
            
            currentCustomer.managers = [{
                id: Date.now(),
                name: currentCustomer.mgr || "",
                phone: currentCustomer.mob || "",
                altPhone: "",
                email: currentCustomer.email || "",
                jobTitle: "المسؤول الرئيسي",
                date: currentCustomer.creationDate || currentCustomer.date || fallbackDate,
                isPrimary: true
            }];
            saveToFirestore(); 
        } else {
            currentCustomer.managers = [];
        }
    }

    // ربط سجل الطلبات والزيارات والفرص من قواعد البيانات العامة تلقائياً
    try {
        const allSales = JSON.parse(localStorage.getItem('asgate_sales_db') || '[]');
        const custSales = allSales.filter(s => (s.comp && currentCustomer.comp && s.comp.trim() === currentCustomer.comp.trim()) || (s.cr && currentCustomer.cr1 && s.cr === currentCustomer.cr1));
        if (custSales.length > 0) {
            currentCustomer.orders = custSales.map(s => ({
                id: '#' + s.id,
                title: s.type || 'طلب مبيعات',
                date: s.date || '-',
                amount: (s.completedSum ? s.completedSum.toLocaleString() : '0') + ' ر.س',
                status: s.status || 'جديد'
            }));
            currentCustomer.sales = custSales.map(s => ({
                invId: 'INV-' + s.id,
                date: s.date || '-',
                total: (s.completedSum ? s.completedSum.toLocaleString() : '0') + ' ر.س',
                status: s.status || 'معتمد'
            }));
        }
    } catch(e){}

    try {
        const rawVisits = localStorage.getItem(VISITS_LOCAL_KEY);
        if (rawVisits) {
            const parsed = JSON.parse(rawVisits);
            const allVisits = Array.isArray(parsed) ? parsed : Object.values(parsed);
            const custVisits = allVisits.filter(v => (v.comp && currentCustomer.comp && v.comp.trim() === currentCustomer.comp.trim()) || (v.record && currentCustomer.cr1 && v.record === currentCustomer.cr1));
            if (custVisits.length > 0) {
                currentCustomer.visits = custVisits.map(v => ({
                    date: v.visitDate || '-',
                    visitor: v.owner || 'المستخدم',
                    purpose: v.curServ || 'زيارة ميدانية',
                    result: v.status || 'مكتملة'
                }));
            }
        }
    } catch(e){}

    try {
        const rawOpps = localStorage.getItem('asgate_opportunities_local_cache_v1');
        if (rawOpps) {
            const parsed = JSON.parse(rawOpps);
            const allOpps = Array.isArray(parsed) ? parsed : Object.values(parsed);
            const custOpps = allOpps.filter(o => (o.comp && currentCustomer.comp && o.comp.trim() === currentCustomer.comp.trim()) || (o.record && currentCustomer.cr1 && o.record === currentCustomer.cr1));
            if (custOpps.length > 0) {
                currentCustomer.opportunities = custOpps.map(o => ({
                    title: o.curServ || 'فرصة بيعية',
                    value: (Number(o.oppValue) || 0).toLocaleString() + ' ر.س',
                    stage: o.status || 'مهتم',
                    probability: o.status === 'رابح' ? '100%' : (o.status === 'فقدان' ? '0%' : '60%')
                }));
            }
        }
    } catch(e){}

    currentCustomer.orders = currentCustomer.orders || [];
    currentCustomer.visits = currentCustomer.visits || [];
    currentCustomer.opportunities = currentCustomer.opportunities || [];
    currentCustomer.sales = currentCustomer.sales || [];
    currentCustomer.attachments = currentCustomer.attachments || [];
    currentCustomer.primaryContact = currentCustomer.primaryContact || {};

    const cName = document.getElementById('c-name');
    if (cName) cName.textContent = currentCustomer.comp || currentCustomer.name || 'عميل غير مسمى';
    
    const cCode = document.getElementById('c-code');
    if (cCode) cCode.textContent = customerCode || currentCustomer.code || '-';

    const cr1 = document.getElementById('c-cr1');
    if (cr1) cr1.textContent = currentCustomer.cr1 || currentCustomer.cr || '-';
    
    const cr2 = document.getElementById('c-cr2');
    if (cr2) cr2.textContent = currentCustomer.cr2 || '-';
    
    const city = document.getElementById('c-city');
    if (city) city.textContent = currentCustomer.city || '-';
    
    const neighborhood = document.getElementById('c-neighborhood');
    if (neighborhood) neighborhood.textContent = currentCustomer.neighborhood || currentCustomer.address || '-';
    
    const classEl = document.getElementById('c-class');
    if (classEl) classEl.textContent = currentCustomer.classification || currentCustomer.source || '-';
    
    const statusEl = document.getElementById('c-status');
    if (statusEl) statusEl.textContent = currentCustomer.status || 'نشط';
    
    const owner = document.getElementById('c-owner');
    if (owner) owner.textContent = currentCustomer.owner || '-';
    
    const source = document.getElementById('c-source');
    if (source) source.textContent = currentCustomer.source || currentCustomer.date || '-';

    renderManagersTable();
    
    // تنشيط أول تبويب
    const activeTab = document.querySelector('.tab-btn.active');
    const tabName = activeTab ? activeTab.id.replace('btn-', '') : 'orders';
    if (typeof window.switchTab === 'function') {
        window.switchTab(tabName);
    }
}

async function loadCustomerData() {
    if (!db) return;
    try {
        const docRef = doc(db, "customers", customerCode);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentCustomer = docSnap.data();
            currentCustomer.code = customerCode;
            saveCustomerLocally();
            populateCustomerUI();
        } else if (!currentCustomer) {
            const cName = document.getElementById('c-name');
            if (cName) cName.textContent = "لم يتم العثور على بيانات العميل";
        }
    } catch (error) {
        console.warn("إشعار جلب بيانات العميل سحابياً (العمل محلياً):", error);
    }
}

function renderManagersTable() {
    const tbody = document.getElementById('managerTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';

    if (!currentCustomer.managers || currentCustomer.managers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; color:#94a3b8;">لا يوجد مسؤولون مسجلون. اضغط إضافة مسؤول جديد</td></tr>`;
        return;
    }

    currentCustomer.managers.forEach((mgr, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center">
                <input type="radio" name="primaryManager" ${mgr.isPrimary ? 'checked' : ''} onchange="window.setPrimaryManager(${index})">
            </td>
            <td><input type="text" value="${escapeHTML(mgr.name || '')}" onchange="window.updateManager(${index}, 'name', this.value)"></td>
            <td><input type="text" value="${escapeHTML(mgr.phone || '')}" onchange="window.updateManager(${index}, 'phone', this.value)"></td>
            <td><input type="text" value="${escapeHTML(mgr.altPhone || '')}" onchange="window.updateManager(${index}, 'altPhone', this.value)"></td>
            <td><input type="email" value="${escapeHTML(mgr.email || '')}" onchange="window.updateManager(${index}, 'email', this.value)"></td>
            <td><input type="text" value="${escapeHTML(mgr.jobTitle || '')}" onchange="window.updateManager(${index}, 'jobTitle', this.value)"></td>
            <td dir="ltr" style="text-align: center;"><strong>${formatDateDisplay(mgr.date)}</strong></td>
            <td class="text-center">
                <button class="btn-icon" onclick="window.deleteManagerRow(${index})" title="حذف"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.setPrimaryManager = function(selectedIndex) {
    if (!currentCustomer || !currentCustomer.managers) return;
    currentCustomer.managers.forEach((mgr, idx) => {
        mgr.isPrimary = (idx === selectedIndex);
    });
    
    const selectedMgr = currentCustomer.managers[selectedIndex];
    if(selectedMgr) {
        currentCustomer.primaryContact = { name: selectedMgr.name, phone: selectedMgr.phone, email: selectedMgr.email };
        currentCustomer.mgr = selectedMgr.name;
        currentCustomer.mob = selectedMgr.phone;
        currentCustomer.email = selectedMgr.email;
    }

    saveToFirestore();
};

window.addNewManagerRow = function() {
    if (!currentCustomer) return;
    const d = new Date();
    const todayStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    
    if (!currentCustomer.managers) currentCustomer.managers = [];
    const newMgr = {
        id: Date.now(), name: "", phone: "", altPhone: "", email: "", jobTitle: "", date: todayStr,
        isPrimary: currentCustomer.managers.length === 0
    };
    
    currentCustomer.managers.push(newMgr);
    if(newMgr.isPrimary) {
        window.setPrimaryManager(currentCustomer.managers.length - 1);
    } else {
        saveToFirestore();
    }
    
    renderManagersTable();
};

window.updateManager = function(index, field, value) {
    if(!currentCustomer || !currentCustomer.managers[index]) return;
    currentCustomer.managers[index][field] = value;
    
    if (currentCustomer.managers[index].isPrimary && (field === 'name' || field === 'phone' || field === 'email')) {
        if (!currentCustomer.primaryContact) currentCustomer.primaryContact = {};
        currentCustomer.primaryContact[field] = value;
        
        if (field === 'name') currentCustomer.mgr = value;
        if (field === 'phone') currentCustomer.mob = value;
        if (field === 'email') currentCustomer.email = value;
    }
    
    saveToFirestore();
};

window.deleteManagerRow = function(index) {
    if (!currentCustomer || !currentCustomer.managers) return;
    if (confirm("هل أنت متأكد من حذف هذا المسؤول؟")) {
        const isWasPrimary = currentCustomer.managers[index].isPrimary;
        currentCustomer.managers.splice(index, 1);
        
        if (isWasPrimary && currentCustomer.managers.length > 0) {
            currentCustomer.managers[0].isPrimary = true;
            window.setPrimaryManager(0);
        } else {
            if (currentCustomer.managers.length === 0) {
                currentCustomer.primaryContact = {};
                currentCustomer.mgr = "";
                currentCustomer.mob = "";
                currentCustomer.email = "";
            }
            saveToFirestore();
        }
        renderManagersTable();
    }
};

window.switchTab = function(tabName) {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const activeBtn = document.getElementById(`btn-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    const thead = document.getElementById('tableHeadRow');
    const tbody = document.getElementById('contentBody');
    const title = document.getElementById('tab-title');

    if(!tbody || !thead || !title || !currentCustomer) return;
    tbody.innerHTML = '';

    if (tabName === 'orders') {
        title.textContent = 'سجل أوامر المبيعات والطلبات';
        thead.innerHTML = `<th>رقم الطلب</th><th>تفاصيل الطلب</th><th>التاريخ</th><th>المبلغ الإجمالي</th><th>الحالة</th><th>إجراء</th>`;
        if (!currentCustomer.orders || currentCustomer.orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color:#94a3b8;">لا توجد طلبات مسجلة لهذا العميل بعد</td></tr>`;
        } else {
            currentCustomer.orders.forEach(item => {
                const orderIdNum = item.id.replace('#', '');
                tbody.innerHTML += `<tr>
                    <td><a href="order_details.html?id=${encodeURIComponent(orderIdNum)}" style="color:#2563eb; font-weight:700; text-decoration:none;">${escapeHTML(item.id)}</a></td>
                    <td>${escapeHTML(item.title)}</td>
                    <td dir="ltr" style="text-align: right;"><strong>${formatDateDisplay(item.date)}</strong></td>
                    <td style="font-weight:700; color:#16a34a;">${escapeHTML(item.amount)}</td>
                    <td><span class="status-badge active">${escapeHTML(item.status)}</span></td>
                    <td><a href="order_details.html?id=${encodeURIComponent(orderIdNum)}" class="btn btn-outline" style="padding:2px 8px; font-size:11px;">عرض الفاتورة</a></td>
                </tr>`;
            });
        }
    } else if (tabName === 'visits') {
        title.textContent = 'سجل الزيارات الميدانية';
        thead.innerHTML = `<th>تاريخ الزيارة</th><th>الزائر (الموظف)</th><th>الهدف من الزيارة</th><th>النتيجة / الملاحظات</th>`;
        if (!currentCustomer.visits || currentCustomer.visits.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">لا توجد زيارات مسجلة لهذا العميل بعد</td></tr>`;
        } else {
            currentCustomer.visits.forEach(item => {
                tbody.innerHTML += `<tr><td dir="ltr" style="text-align: right;"><strong>${formatDateDisplay(item.date)}</strong></td><td>${escapeHTML(item.visitor)}</td><td>${escapeHTML(item.purpose)}</td><td>${escapeHTML(item.result)}</td></tr>`;
            });
        }
    } else if (tabName === 'opportunities') {
        title.textContent = 'الفرص البيعية المرتبطة';
        thead.innerHTML = `<th>اسم الفرصة</th><th>القيمة التقديرية</th><th>المرحلة</th><th>نسبة النجاح</th>`;
        if (!currentCustomer.opportunities || currentCustomer.opportunities.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">لا توجد فرص بيعية مسجلة لهذا العميل بعد</td></tr>`;
        } else {
            currentCustomer.opportunities.forEach(item => {
                tbody.innerHTML += `<tr><td>${escapeHTML(item.title)}</td><td style="font-weight:700; color:#2563eb;">${escapeHTML(item.value)}</td><td>${escapeHTML(item.stage)}</td><td>${escapeHTML(item.probability)}</td></tr>`;
            });
        }
    } else if (tabName === 'sales') {
        title.textContent = 'سجل الفواتير والمبيعات';
        thead.innerHTML = `<th>رقم الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th>`;
        if (!currentCustomer.sales || currentCustomer.sales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">لا توجد فواتير مسجلة لهذا العميل بعد</td></tr>`;
        } else {
            currentCustomer.sales.forEach(item => {
                tbody.innerHTML += `<tr><td><b>${escapeHTML(item.invId)}</b></td><td dir="ltr" style="text-align: right;"><strong>${formatDateDisplay(item.date)}</strong></td><td style="font-weight:700; color:#16a34a;">${escapeHTML(item.total)}</td><td>${escapeHTML(item.status)}</td></tr>`;
            });
        }
    } else if (tabName === 'attachments') {
        title.textContent = 'الملفات والمرفقات الرسمية';
        thead.innerHTML = `<th>اسم الملف</th><th>تاريخ الإضافة</th><th>الحجم</th><th>تحميل</th>`;
        if (!currentCustomer.attachments || currentCustomer.attachments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">لا توجد مرفقات مسجلة لهذا العميل بعد</td></tr>`;
        } else {
            currentCustomer.attachments.forEach(item => {
                tbody.innerHTML += `<tr><td>${escapeHTML(item.name)}</td><td dir="ltr" style="text-align: right;"><strong>${formatDateDisplay(item.date)}</strong></td><td>${escapeHTML(item.size)}</td><td><button class="btn btn-outline" style="padding: 2px 8px;"><i class="fas fa-download"></i></button></td></tr>`;
            });
        }
    }
};

window.createNewVisit = async function() {
    if (!currentCustomer) {
        alert('بيانات العميل غير محملة بعد');
        return;
    }

    const today = new Date();
    const dStr = String(today.getDate()).padStart(2, '0') + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + today.getFullYear();
    const tStr = String(today.getHours()).padStart(2, '0') + ":" + String(today.getMinutes()).padStart(2, '0');
    const visitId = 'visit_' + Date.now();

    const newVisitData = {
        id: visitId,
        createdAt: Date.now(),
        comp: currentCustomer.comp || currentCustomer.name || '',
        address: currentCustomer.neighborhood || currentCustomer.address || currentCustomer.city || '',
        mgr: currentCustomer.mgr || currentCustomer.primaryContact?.name || '',
        mob: currentCustomer.mob || currentCustomer.primaryContact?.phone || '',
        email: currentCustomer.email || currentCustomer.primaryContact?.email || '',
        record: currentCustomer.cr1 || currentCustomer.cr || '',
        visitDate: dStr,
        curServ: 'زيارة ميدانية',
        oppValue: '0',
        notes: '[]',
        status: 'زيارة',
        editDate: `${dStr} ${tStr}`,
        owner: currentCustomer.owner || 'المستخدم',
        products: []
    };

    try {
        let visitsCache = {};
        try {
            const raw = localStorage.getItem(VISITS_LOCAL_KEY);
            if (raw) visitsCache = JSON.parse(raw);
            if (Array.isArray(visitsCache)) {
                let obj = {};
                visitsCache.forEach(v => { obj[v.id] = v; });
                visitsCache = obj;
            }
        } catch(e){}
        visitsCache[visitId] = newVisitData;
        localStorage.setItem(VISITS_LOCAL_KEY, JSON.stringify(visitsCache));

        if (db) {
            await setDoc(doc(db, "visits", visitId), newVisitData);
        }

        if (!currentCustomer.visits) currentCustomer.visits = [];
        currentCustomer.visits.unshift({
            date: dStr,
            visitor: currentCustomer.owner || 'المستخدم',
            purpose: 'زيارة ميدانية جديدة',
            result: 'تم التجهيز والربط مع صفحة الزيارات'
        });

        await saveToFirestore();
        populateCustomerUI();

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'تم إنشاء الزيارة بنجاح',
                text: 'تمت إضافة الزيارة في جدول الزيارات الميدانية وسجل زيارات العميل',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            alert('تم إنشاء الزيارة بنجاح!');
        }

        if (typeof window.switchTab === 'function') {
            window.switchTab('visits');
        }

    } catch (error) {
        console.error("خطأ في إضافة الزيارة:", error);
        alert('حدث خطأ أثناء إضافة الزيارة الجديدة.');
    }
};

async function saveToFirestore() {
    saveCustomerLocally(); 
    if (db && customerCode) {
        try {
            await updateDoc(doc(db, "customers", customerCode), currentCustomer);
        } catch (error) {
            console.warn("إشعار حفظ تفاصيل العميل سحابياً:", error);
        }
    }
}

window.openEditModal = function() {
    if (!currentCustomer) return;
    
    document.getElementById('editCode').value = currentCustomer.code || customerCode || '';
    document.getElementById('editComp').value = currentCustomer.comp || currentCustomer.name || '';
    document.getElementById('editCity').value = currentCustomer.city || '';
    document.getElementById('editAddress').value = currentCustomer.neighborhood || currentCustomer.address || '';
    document.getElementById('editCr1').value = currentCustomer.cr1 || currentCustomer.cr || '';
    document.getElementById('editCr2').value = currentCustomer.cr2 || '';
    document.getElementById('editOwner').value = currentCustomer.owner || '';
    document.getElementById('editSource').value = currentCustomer.source || currentCustomer.date || '';
    
    const classSelect = document.getElementById('editClass');
    if (classSelect) classSelect.value = currentCustomer.classification || 'صغير';
    
    const statusSelect = document.getElementById('editStatus');
    if (statusSelect) statusSelect.value = currentCustomer.status || 'نشط';

    document.getElementById('editCustomerModal').style.display = 'flex';
};

window.closeEditModal = function() {
    document.getElementById('editCustomerModal').style.display = 'none';
};

window.saveCustomerEdits = async function(event) {
    if (!currentCustomer || !customerCode) return;

    const newComp = document.getElementById('editComp').value.trim();
    if (newComp === '') {
        alert('اسم الشركة مطلوب');
        return;
    }

    currentCustomer.comp = newComp;
    currentCustomer.name = newComp; 
    currentCustomer.city = document.getElementById('editCity').value;
    currentCustomer.neighborhood = document.getElementById('editAddress').value;
    currentCustomer.address = document.getElementById('editAddress').value;
    currentCustomer.cr1 = document.getElementById('editCr1').value;
    currentCustomer.cr2 = document.getElementById('editCr2').value;
    currentCustomer.classification = document.getElementById('editClass').value;
    currentCustomer.status = document.getElementById('editStatus').value;
    currentCustomer.owner = document.getElementById('editOwner').value; 

    try {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;

        await saveToFirestore();
        populateCustomerUI();

        closeEditModal();
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        if (typeof Swal !== 'undefined') {
            Swal.fire('نجاح', 'تم تحديث بيانات العميل بنجاح وتمت المزامنة!', 'success');
        } else {
            alert('تم تحديث البيانات بنجاح!');
        }

    } catch (error) {
        console.error("خطأ في تحديث البيانات:", error);
        alert('حدث خطأ أثناء حفظ التعديلات.');
        if (event.target) event.target.disabled = false;
    }
};

window.openNoteModal = function() { const m = document.getElementById('noteModal'); if(m) m.style.display = 'flex'; };
window.closeNoteModal = function() { const m = document.getElementById('noteModal'); if(m) m.style.display = 'none'; };

window.handleFileSelect = function(input) {
    const fileName = input.files[0] ? input.files[0].name : "لم يتم اختيار ملف";
    const el = document.getElementById('fileName');
    if(el) el.textContent = fileName;
};

window.saveActivity = function() {
    const noteEl = document.getElementById('activityNote');
    const note = noteEl ? noteEl.value : '';
    if (note.trim() === '') return alert('يرجى كتابة الملاحظة أولاً');
    
    const d = new Date();
    const dStr = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
    if (!currentCustomer.notesHistory) currentCustomer.notesHistory = [];
    currentCustomer.notesHistory.push({
        user: currentCustomer.owner || 'المستخدم',
        date: dStr,
        time: String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0'),
        text: note.trim()
    });
    currentCustomer.notesText = note.trim();
    saveToFirestore();

    alert('تم حفظ النشاط بنجاح');
    if(noteEl) noteEl.value = '';
    window.closeNoteModal();
};

document.addEventListener('DOMContentLoaded', initPage);
