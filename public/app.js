// WIXX - Warehouse Inventory System
(function () {
  'use strict';

  // ============ API Helper ============
  const api = {
    async get(url) {
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) { toast(data.error || 'שגיאה', 'error'); return { ok: false, error: data.error }; }
        return { ok: true, data };
      } catch (e) { toast('שגיאת תקשורת', 'error'); return { ok: false, error: e.message }; }
    },
    async post(url, body) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) { toast(data.error || 'שגיאה', 'error'); return { ok: false, error: data.error }; }
        return { ok: true, data };
      } catch (e) { toast('שגיאת תקשורת', 'error'); return { ok: false, error: e.message }; }
    },
    async put(url, body) {
      try {
        const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) { toast(data.error || 'שגיאה', 'error'); return { ok: false, error: data.error }; }
        return { ok: true, data };
      } catch (e) { toast('שגיאת תקשורת', 'error'); return { ok: false, error: e.message }; }
    },
    async upload(url, formData) {
      try {
        const res = await fetch(url, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { toast(data.error || 'שגיאה', 'error'); return { ok: false, error: data.error }; }
        return { ok: true, data };
      } catch (e) { toast('שגיאת תקשורת', 'error'); return { ok: false, error: e.message }; }
    }
  };

  // ============ Toast ============
  function toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  // ============ Modal ============
  function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  // ============ Helpers ============
  const STATUS_LABELS = { open: 'פתוח', full: 'מלא', closed: 'סגור', archived: 'ארכיון', active: 'פעיל', completed: 'הושלם', cancelled: 'בוטל' };
  const ISSUE_LABELS = { unknown_barcode: 'ברקוד לא מזוהה', duplicate_suspect: 'חשד לכפילות', wrong_location: 'איתור שגוי', damaged: 'פגום', other: 'אחר' };

  function badge(status) {
    return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
  }

  function formatTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('he-IL');
  }

  function debounce(fn, ms) {
    let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  function formField(name, label, type = 'text', opts = {}) {
    if (type === 'select') {
      const options = (opts.options || []).map(o => {
        const val = typeof o === 'string' ? o : o.value;
        const text = typeof o === 'string' ? o : o.label;
        const sel = opts.value === val ? ' selected' : '';
        return `<option value="${val}"${sel}>${text}</option>`;
      }).join('');
      return `<div class="form-group"><label>${label}</label><select name="${name}">${options}</select></div>`;
    }
    if (type === 'textarea') {
      return `<div class="form-group"><label>${label}</label><textarea name="${name}" rows="3">${opts.value || ''}</textarea></div>`;
    }
    const req = opts.required ? ' required' : '';
    return `<div class="form-group"><label>${label}</label><input type="${type}" name="${name}" value="${opts.value || ''}"${req}></div>`;
  }

  function getFormData(container) {
    const data = {};
    container.querySelectorAll('input, select, textarea').forEach(el => {
      data[el.name] = el.type === 'number' ? (el.value ? Number(el.value) : 0) : el.value;
    });
    return data;
  }

  // ============ State ============
  const state = {
    activeSession: null,
    lastScanResult: null,
    sessionScanCount: 0,
    scanHistory: [],
    currentView: 'dashboard'
  };

  // ============ Navigation ============
  const viewLoaders = {
    dashboard: loadDashboard,
    scan: loadScanView,
    products: loadProducts,
    locations: loadLocations,
    inventory: loadInventory,
    containers: loadContainers,
    exceptions: loadExceptions,
    reports: () => {}
  };

  function switchView(name) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === name));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${name}`));
    state.currentView = name;
    if (viewLoaders[name]) viewLoaders[name]();
    if (name === 'scan') setTimeout(() => document.getElementById('barcode-input').focus(), 50);
  }

  document.getElementById('sidebar').addEventListener('click', function (e) {
    const item = e.target.closest('.nav-item');
    if (item) switchView(item.dataset.view);
  });

  // ============ Dashboard ============
  async function loadDashboard() {
    const r = await api.get('/api/reports/dashboard');
    if (!r.ok) return;
    const s = r.data;
    document.getElementById('stat-scans-today').textContent = s.scans_today;
    document.getElementById('stat-open-locations').textContent = s.open_locations;
    document.getElementById('stat-full-locations').textContent = s.full_locations;
    document.getElementById('stat-total-inventory').textContent = s.total_inventory;
    document.getElementById('stat-total-products').textContent = s.total_products;
    document.getElementById('stat-open-exceptions').textContent = s.open_exceptions;

    const sessionEl = document.getElementById('active-session-info');
    if (s.active_session) {
      sessionEl.className = 'info-box active-session';
      sessionEl.textContent = `סשן פעיל: ${s.active_session.container_number || 'ללא קונטיינר'} | התחיל ב-${formatTime(s.active_session.started_at)}`;
    } else {
      sessionEl.className = 'info-box';
      sessionEl.textContent = 'אין סשן קליטה פעיל';
    }

    const tbody = document.getElementById('recent-scans-body');
    tbody.innerHTML = (s.recent_scans || []).map(sc => `
      <tr><td>${formatTime(sc.scan_time)}</td><td>${sc.brand || '-'}</td><td>${sc.model || '-'}</td><td>${sc.size || '-'}</td><td>${sc.color || '-'}</td><td>${sc.location_code || '-'}</td></tr>
    `).join('');
  }

  document.getElementById('stat-exceptions-card').addEventListener('click', () => switchView('exceptions'));

  // ============ Scanning ============
  function focusBarcode() {
    setTimeout(() => document.getElementById('barcode-input').focus(), 50);
  }

  function setScanState(s) {
    document.getElementById('scan-result').classList.toggle('hidden', s !== 'result');
    document.getElementById('scan-exception').classList.toggle('hidden', s !== 'exception');
    document.getElementById('scan-success').classList.toggle('hidden', s !== 'success');
  }

  async function loadScanView() {
    const r = await api.get('/api/sessions/active');
    if (r.ok && r.data) {
      state.activeSession = r.data;
      document.getElementById('scan-session-info').textContent = `סשן פעיל: ${r.data.container_number || 'ללא קונטיינר'}`;
      document.getElementById('btn-new-session').classList.add('hidden');
      document.getElementById('btn-end-session').classList.remove('hidden');
    } else {
      state.activeSession = null;
      document.getElementById('scan-session-info').textContent = 'אין סשן פעיל';
      document.getElementById('btn-new-session').classList.remove('hidden');
      document.getElementById('btn-end-session').classList.add('hidden');
    }
    setScanState('idle');
    state.sessionScanCount = 0;
    state.scanHistory = [];
    document.getElementById('scan-count').textContent = '0';
    document.getElementById('scan-history-list').innerHTML = '';
    focusBarcode();
  }

  // New session
  document.getElementById('btn-new-session').addEventListener('click', async () => {
    const r = await api.get('/api/containers');
    if (!r.ok) return;
    const options = [{ value: '', label: '-- ללא קונטיינר --' }, ...r.data.filter(c => c.status === 'open').map(c => ({ value: c.id, label: c.container_number }))];
    openModal('פתיחת סשן קליטה',
      formField('container_id', 'קונטיינר', 'select', { options }) + formField('started_by', 'שם עובד'),
      '<button class="btn btn-primary" id="modal-save">פתח סשן</button>'
    );
    document.getElementById('modal-save').addEventListener('click', async () => {
      const data = getFormData(document.getElementById('modal-body'));
      const res = await api.post('/api/sessions', data);
      if (res.ok) { closeModal(); toast('סשן נפתח', 'success'); loadScanView(); }
    });
  });

  // End session
  document.getElementById('btn-end-session').addEventListener('click', async () => {
    if (!state.activeSession) return;
    const r = await api.put(`/api/sessions/${state.activeSession.id}/end`);
    if (r.ok) { toast('סשן נסגר', 'success'); loadScanView(); }
  });

  // Scan barcode
  async function doScan() {
    const input = document.getElementById('barcode-input');
    const barcode = input.value.trim();
    if (!barcode) return;
    input.value = '';

    const r = await api.post('/api/scan', { barcode, session_id: state.activeSession?.id });
    if (!r.ok) { focusBarcode(); return; }

    if (r.data.status === 'exception') {
      document.getElementById('exception-barcode').textContent = barcode;
      setScanState('exception');
      focusBarcode();
      return;
    }

    state.lastScanResult = r.data;
    const p = r.data.product;
    document.getElementById('scan-product-info').innerHTML = `
      <div class="product-name">${p.brand} ${p.model}</div>
      <div class="product-details">
        <span>מידה: <strong>${p.size}</strong></span>
        <span>צבע: <strong>${p.color}</strong></span>
        <span>ברקוד: <strong>${p.barcode}</strong></span>
        ${p.sku_code ? `<span>SKU: <strong>${p.sku_code}</strong></span>` : ''}
      </div>`;

    const loc = r.data.location;
    const locEl = document.getElementById('scan-location-info');
    if (loc) {
      locEl.className = 'location-card';
      locEl.innerHTML = `<div class="location-code">${loc.location_code}</div><div class="location-info">${loc.current_quantity} / ${loc.max_capacity} יחידות | אזור: ${loc.zone || '-'}</div>`;
      document.getElementById('btn-confirm-scan').disabled = false;
      document.getElementById('btn-location-full').disabled = false;
    } else {
      locEl.className = 'location-card no-location';
      locEl.innerHTML = '<div class="location-code">אין איתור פתוח למוצר זה</div><div class="location-info">יש לפתוח איתור חדש</div>';
      document.getElementById('btn-confirm-scan').disabled = true;
      document.getElementById('btn-location-full').disabled = true;
    }
    setScanState('result');
    focusBarcode();
  }

  document.getElementById('btn-scan').addEventListener('click', doScan);
  document.getElementById('barcode-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doScan();
  });

  // Confirm scan
  document.getElementById('btn-confirm-scan').addEventListener('click', async () => {
    const sr = state.lastScanResult;
    if (!sr || !sr.location) return;
    const r = await api.post('/api/scan/confirm', {
      product_id: sr.product.id, location_id: sr.location.id,
      session_id: state.activeSession?.id, barcode: sr.product.barcode
    });
    if (!r.ok) return;

    state.sessionScanCount++;
    document.getElementById('scan-count').textContent = state.sessionScanCount;
    state.scanHistory.unshift({ product: sr.product, location: sr.location });

    const histEl = document.getElementById('scan-history-list');
    const item = document.createElement('div');
    item.className = 'scan-history-item';
    item.innerHTML = `<span>${sr.product.brand} ${sr.product.model} | ${sr.product.size} | ${sr.product.color}</span><span>${sr.location.location_code}</span>`;
    histEl.prepend(item);

    if (r.data.location?.is_full) {
      toast(`איתור ${r.data.location.location_code} מלא!`, 'warning');
    }

    document.getElementById('success-message').textContent = `${sr.product.brand} ${sr.product.model} (${sr.product.size}) → ${sr.location.location_code}`;
    setScanState('success');
    setTimeout(() => { setScanState('idle'); focusBarcode(); }, 1500);
  });

  // Location full
  document.getElementById('btn-location-full').addEventListener('click', async () => {
    const sr = state.lastScanResult;
    if (!sr || !sr.location) return;
    const r = await api.post(`/api/locations/${sr.location.id}/mark-full`);
    if (!r.ok) return;

    toast(r.data.message, 'success');
    state.lastScanResult.location = { ...r.data.new_location, current_quantity: 0, max_capacity: sr.location.max_capacity, zone: sr.location.zone || '' };
    const locEl = document.getElementById('scan-location-info');
    locEl.className = 'location-card';
    locEl.innerHTML = `<div class="location-code">${r.data.new_location.location_code}</div><div class="location-info">0 / ${sr.location.max_capacity} יחידות (חדש)</div>`;
    document.getElementById('btn-confirm-scan').disabled = false;
    focusBarcode();
  });

  // New location
  document.getElementById('btn-new-location').addEventListener('click', () => {
    const sr = state.lastScanResult;
    openModal('פתיחת איתור חדש',
      formField('location_code', 'קוד איתור', 'text', { required: true }) +
      formField('zone', 'אזור') +
      formField('max_capacity', 'קיבולת מקסימלית', 'number', { value: '50' }),
      '<button class="btn btn-primary" id="modal-save">צור איתור</button>'
    );
    document.getElementById('modal-save').addEventListener('click', async () => {
      const data = getFormData(document.getElementById('modal-body'));
      if (sr) data.assigned_product_id = sr.product.id;
      const r = await api.post('/api/locations', data);
      if (!r.ok) return;
      closeModal();
      toast('איתור נוצר', 'success');
      // Re-scan to pick up new location
      if (sr) {
        const scanR = await api.post('/api/scan', { barcode: sr.product.barcode, session_id: state.activeSession?.id });
        if (scanR.ok && scanR.data.status === 'found') {
          state.lastScanResult = scanR.data;
          const loc = scanR.data.location;
          if (loc) {
            const locEl = document.getElementById('scan-location-info');
            locEl.className = 'location-card';
            locEl.innerHTML = `<div class="location-code">${loc.location_code}</div><div class="location-info">${loc.current_quantity} / ${loc.max_capacity} יחידות</div>`;
            document.getElementById('btn-confirm-scan').disabled = false;
            document.getElementById('btn-location-full').disabled = false;
          }
        }
      }
      focusBarcode();
    });
  });

  // Dismiss exception
  document.getElementById('btn-dismiss-exception').addEventListener('click', () => {
    setScanState('idle');
    focusBarcode();
  });

  // Undo scan
  document.getElementById('btn-undo-scan').addEventListener('click', async () => {
    if (!state.activeSession) { toast('אין סשן פעיל', 'warning'); return; }
    const r = await api.post('/api/scan/undo', { session_id: state.activeSession.id });
    if (!r.ok) return;
    if (state.sessionScanCount > 0) state.sessionScanCount--;
    document.getElementById('scan-count').textContent = state.sessionScanCount;
    const histEl = document.getElementById('scan-history-list');
    if (histEl.firstChild) histEl.removeChild(histEl.firstChild);
    toast('סריקה בוטלה', 'success');
    focusBarcode();
  });

  // ============ Products ============
  async function loadProducts() {
    const search = document.getElementById('products-search').value;
    const r = await api.get(`/api/products?search=${encodeURIComponent(search)}`);
    if (!r.ok) return;
    document.getElementById('products-body').innerHTML = r.data.map(p => `
      <tr>
        <td>${p.barcode}</td><td>${p.brand}</td><td>${p.model}</td><td>${p.color}</td><td>${p.size}</td><td>${p.sku_code || '-'}</td>
        <td class="actions"><button class="btn btn-sm btn-secondary" data-edit-product="${p.id}">ערוך</button></td>
      </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center;color:#999">אין מוצרים</td></tr>';
  }

  document.getElementById('products-search').addEventListener('input', debounce(loadProducts, 300));

  document.getElementById('btn-add-product').addEventListener('click', () => {
    openModal('הוספת מוצר',
      formField('barcode', 'ברקוד', 'text', { required: true }) +
      '<div class="form-row">' + formField('brand', 'מותג') + formField('model', 'דגם') + '</div>' +
      '<div class="form-row">' + formField('color', 'צבע') + formField('size', 'מידה') + '</div>' +
      '<div class="form-row">' + formField('sku_code', 'קוד SKU') + formField('season', 'עונה') + '</div>' +
      '<div class="form-row">' + formField('gender', 'מין', 'select', { options: ['', 'גבר', 'אישה', 'ילדים', 'יוניסקס'] }) + formField('category', 'קטגוריה') + '</div>' +
      formField('description', 'תיאור', 'textarea'),
      '<button class="btn btn-primary" id="modal-save">שמור</button>'
    );
    document.getElementById('modal-save').addEventListener('click', async () => {
      const data = getFormData(document.getElementById('modal-body'));
      if (!data.barcode) { toast('ברקוד הוא שדה חובה', 'warning'); return; }
      const r = await api.post('/api/products', data);
      if (r.ok) { closeModal(); toast('מוצר נוסף', 'success'); loadProducts(); }
    });
  });

  // Edit product (delegation)
  document.getElementById('products-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-edit-product]');
    if (!btn) return;
    const r = await api.get(`/api/products/${btn.dataset.editProduct}`);
    if (!r.ok) return;
    const p = r.data;
    openModal('עריכת מוצר',
      formField('barcode', 'ברקוד', 'text', { value: p.barcode, required: true }) +
      '<div class="form-row">' + formField('brand', 'מותג', 'text', { value: p.brand }) + formField('model', 'דגם', 'text', { value: p.model }) + '</div>' +
      '<div class="form-row">' + formField('color', 'צבע', 'text', { value: p.color }) + formField('size', 'מידה', 'text', { value: p.size }) + '</div>' +
      '<div class="form-row">' + formField('sku_code', 'קוד SKU', 'text', { value: p.sku_code }) + formField('season', 'עונה', 'text', { value: p.season }) + '</div>' +
      '<div class="form-row">' + formField('gender', 'מין', 'select', { value: p.gender, options: ['', 'גבר', 'אישה', 'ילדים', 'יוניסקס'] }) + formField('category', 'קטגוריה', 'text', { value: p.category }) + '</div>' +
      formField('description', 'תיאור', 'textarea', { value: p.description }),
      '<button class="btn btn-primary" id="modal-save">עדכן</button>'
    );
    document.getElementById('modal-save').addEventListener('click', async () => {
      const data = getFormData(document.getElementById('modal-body'));
      data.active = true;
      const res = await api.put(`/api/products/${p.id}`, data);
      if (res.ok) { closeModal(); toast('מוצר עודכן', 'success'); loadProducts(); }
    });
  });

  // CSV import
  document.getElementById('btn-import-csv').addEventListener('click', () => {
    document.getElementById('csv-file-input').click();
  });
  document.getElementById('csv-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.upload('/api/products/import-csv', fd);
    if (r.ok) {
      toast(`יובאו ${r.data.imported} מוצרים, דולגו ${r.data.skipped}`, 'success', 5000);
      loadProducts();
    }
    e.target.value = '';
  });

  // ============ Locations ============
  async function loadLocations() {
    const search = document.getElementById('locations-search').value;
    const status = document.getElementById('locations-status-filter').value;
    let url = `/api/locations?search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${status}`;
    const r = await api.get(url);
    if (!r.ok) return;
    document.getElementById('locations-body').innerHTML = r.data.map(l => {
      const prod = l.product_brand ? `${l.product_brand} ${l.product_model} (${l.product_size})` : '-';
      return `<tr>
        <td><strong>${l.location_code}</strong></td><td>${l.zone || '-'}</td><td>${prod}</td>
        <td>${l.current_quantity}</td><td>${l.max_capacity}</td><td>${badge(l.status)}</td>
        <td class="actions">
          ${l.status === 'open' ? `<button class="btn btn-sm btn-warning" data-loc-status="${l.id}" data-new-status="full">מלא</button>` : ''}
          ${l.status === 'open' ? `<button class="btn btn-sm btn-secondary" data-loc-status="${l.id}" data-new-status="closed">סגור</button>` : ''}
          ${l.status === 'closed' ? `<button class="btn btn-sm btn-primary" data-loc-status="${l.id}" data-new-status="open">פתח</button>` : ''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:#999">אין איתורים</td></tr>';
  }

  document.getElementById('locations-search').addEventListener('input', debounce(loadLocations, 300));
  document.getElementById('locations-status-filter').addEventListener('change', loadLocations);

  document.getElementById('btn-add-location').addEventListener('click', () => {
    openModal('הוספת איתור',
      formField('location_code', 'קוד איתור', 'text', { required: true }) +
      formField('zone', 'אזור') +
      formField('max_capacity', 'קיבולת מקסימלית', 'number', { value: '50' }) +
      formField('notes', 'הערות', 'textarea'),
      '<button class="btn btn-primary" id="modal-save">צור</button>'
    );
    document.getElementById('modal-save').addEventListener('click', async () => {
      const data = getFormData(document.getElementById('modal-body'));
      if (!data.location_code) { toast('קוד איתור הוא חובה', 'warning'); return; }
      const r = await api.post('/api/locations', data);
      if (r.ok) { closeModal(); toast('איתור נוצר', 'success'); loadLocations(); }
    });
  });

  document.getElementById('locations-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-loc-status]');
    if (!btn) return;
    const r = await api.put(`/api/locations/${btn.dataset.locStatus}/status`, { status: btn.dataset.newStatus });
    if (r.ok) { toast('סטטוס עודכן', 'success'); loadLocations(); }
  });

  // ============ Inventory ============
  let inventoryData = [];
  async function loadInventory() {
    const r = await api.get('/api/inventory');
    if (!r.ok) return;
    inventoryData = r.data;
    renderInventory();
  }

  function renderInventory() {
    const search = document.getElementById('inventory-search').value.toLowerCase();
    const filtered = search ? inventoryData.filter(i =>
      (i.location_code || '').toLowerCase().includes(search) ||
      (i.barcode || '').toLowerCase().includes(search) ||
      (i.brand || '').toLowerCase().includes(search) ||
      (i.model || '').toLowerCase().includes(search)
    ) : inventoryData;

    document.getElementById('inventory-body').innerHTML = filtered.map(i => `
      <tr><td><strong>${i.location_code}</strong></td><td>${i.barcode}</td><td>${i.brand}</td><td>${i.model}</td><td>${i.color}</td><td>${i.size}</td><td>${i.quantity}</td></tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center;color:#999">אין מלאי</td></tr>';
  }

  document.getElementById('inventory-search').addEventListener('input', debounce(renderInventory, 200));

  // ============ Containers ============
  async function loadContainers() {
    const r = await api.get('/api/containers');
    if (!r.ok) return;
    document.getElementById('containers-body').innerHTML = r.data.map(c => `
      <tr>
        <td><strong>${c.container_number}</strong></td><td>${formatDate(c.arrival_date)}</td><td>${c.supplier || '-'}</td>
        <td>${c.estimated_quantity}</td><td>${c.scanned_count || 0}</td><td>${badge(c.status)}</td>
        <td class="actions">
          ${c.status === 'open' ? `<button class="btn btn-sm btn-secondary" data-cont-status="${c.id}" data-new-status="closed">סגור</button>` : ''}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center;color:#999">אין קונטיינרים</td></tr>';
  }

  document.getElementById('btn-add-container').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    openModal('הוספת קונטיינר',
      formField('container_number', 'מספר קונטיינר', 'text', { required: true }) +
      formField('arrival_date', 'תאריך הגעה', 'date', { value: today }) +
      formField('supplier', 'ספק') +
      formField('estimated_quantity', 'כמות משוערת', 'number') +
      formField('notes', 'הערות', 'textarea'),
      '<button class="btn btn-primary" id="modal-save">צור</button>'
    );
    document.getElementById('modal-save').addEventListener('click', async () => {
      const data = getFormData(document.getElementById('modal-body'));
      if (!data.container_number) { toast('מספר קונטיינר הוא חובה', 'warning'); return; }
      const r = await api.post('/api/containers', data);
      if (r.ok) { closeModal(); toast('קונטיינר נוצר', 'success'); loadContainers(); }
    });
  });

  document.getElementById('containers-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cont-status]');
    if (!btn) return;
    const r = await api.put(`/api/containers/${btn.dataset.contStatus}/status`, { status: btn.dataset.newStatus });
    if (r.ok) { toast('סטטוס עודכן', 'success'); loadContainers(); }
  });

  // ============ Exceptions ============
  async function loadExceptions() {
    const status = document.getElementById('exceptions-status-filter').value;
    const url = status ? `/api/exceptions?status=${status}` : '/api/exceptions';
    const r = await api.get(url);
    if (!r.ok) return;
    document.getElementById('exceptions-body').innerHTML = r.data.map(ex => `
      <tr>
        <td><code>${ex.barcode_scanned}</code></td><td>${ISSUE_LABELS[ex.issue_type] || ex.issue_type}</td>
        <td>${badge(ex.status)}</td><td>${formatDate(ex.created_at)}</td><td>${ex.notes || '-'}</td>
        <td class="actions">
          ${ex.status === 'open' ? `<button class="btn btn-sm btn-primary" data-resolve-ex="${ex.id}">טפל</button>` : `${ex.resolved_by || ''}`}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:#999">אין חריגים</td></tr>';
  }

  document.getElementById('exceptions-status-filter').addEventListener('change', loadExceptions);

  document.getElementById('exceptions-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-resolve-ex]');
    if (!btn) return;
    openModal('טיפול בחריגה',
      formField('resolved_by', 'טופל ע"י') + formField('notes', 'הערות', 'textarea'),
      '<button class="btn btn-primary" id="modal-save">סמן כטופל</button>'
    );
    document.getElementById('modal-save').addEventListener('click', async () => {
      const data = getFormData(document.getElementById('modal-body'));
      const r = await api.put(`/api/exceptions/${btn.dataset.resolveEx}/resolve`, data);
      if (r.ok) { closeModal(); toast('חריגה טופלה', 'success'); loadExceptions(); }
    });
  });

  // ============ Reports ============
  document.getElementById('view-reports').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-primary');
    if (!btn) return;
    const card = btn.closest('.report-card');
    if (!card || !card.dataset.report) return;
    e.preventDefault();

    const output = document.getElementById('report-output');
    output.classList.remove('hidden');

    if (card.dataset.report === 'by-location') {
      const r = await api.get('/api/reports/by-location');
      if (!r.ok) return;
      output.innerHTML = '<h3>מלאי לפי איתור</h3><table class="data-table"><thead><tr><th>איתור</th><th>סטטוס</th><th>מותג</th><th>דגם</th><th>מידה</th><th>כמות</th><th>קיבולת</th></tr></thead><tbody>' +
        r.data.map(row => `<tr><td><strong>${row.location_code}</strong></td><td>${badge(row.status)}</td><td>${row.brand || '-'}</td><td>${row.model || '-'}</td><td>${row.size || '-'}</td><td>${row.quantity || 0}</td><td>${row.max_capacity}</td></tr>`).join('') +
        '</tbody></table>';
    } else if (card.dataset.report === 'by-product') {
      const r = await api.get('/api/reports/by-product');
      if (!r.ok) return;
      output.innerHTML = '<h3>מלאי לפי מוצר</h3><table class="data-table"><thead><tr><th>ברקוד</th><th>מותג</th><th>דגם</th><th>מידה</th><th>צבע</th><th>סה"כ</th><th>איתורים</th></tr></thead><tbody>' +
        r.data.map(row => `<tr><td>${row.barcode}</td><td>${row.brand}</td><td>${row.model}</td><td>${row.size}</td><td>${row.color}</td><td><strong>${row.total_quantity}</strong></td><td>${row.locations || '-'}</td></tr>`).join('') +
        '</tbody></table>';
    } else if (card.dataset.report === 'by-container') {
      const cr = await api.get('/api/containers');
      if (!cr.ok) return;
      const options = cr.data.map(c => ({ value: c.id, label: c.container_number }));
      openModal('בחר קונטיינר',
        formField('container_id', 'קונטיינר', 'select', { options }),
        '<button class="btn btn-primary" id="modal-save">הצג דוח</button>'
      );
      document.getElementById('modal-save').addEventListener('click', async () => {
        const data = getFormData(document.getElementById('modal-body'));
        closeModal();
        const r = await api.get(`/api/reports/by-container/${data.container_id}`);
        if (!r.ok) return;
        const s = r.data.summary;
        output.innerHTML = `<h3>דוח קונטיינר: ${r.data.container.container_number}</h3>
          <div class="stats-grid" style="margin-bottom:16px">
            <div class="stat-card"><div class="stat-value">${s.total_scans}</div><div class="stat-label">סה"כ סריקות</div></div>
            <div class="stat-card"><div class="stat-value">${s.unique_products}</div><div class="stat-label">מוצרים ייחודיים</div></div>
            <div class="stat-card"><div class="stat-value">${s.locations_used}</div><div class="stat-label">איתורים</div></div>
            <div class="stat-card"><div class="stat-value">${r.data.exceptions_count}</div><div class="stat-label">חריגים</div></div>
          </div>
          <table class="data-table"><thead><tr><th>זמן</th><th>מותג</th><th>דגם</th><th>מידה</th><th>איתור</th></tr></thead><tbody>` +
          r.data.scans.map(sc => `<tr><td>${formatTime(sc.scan_time)}</td><td>${sc.brand || '-'}</td><td>${sc.model || '-'}</td><td>${sc.size || '-'}</td><td>${sc.location_code || '-'}</td></tr>`).join('') +
          '</tbody></table>';
      });
    }
  });

  // ============ Init ============
  loadDashboard();
})();
