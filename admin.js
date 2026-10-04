// ============ ADMİN: Sipariş onayları (filtre, toplu PDF, onay/ret, sevk) ============
const adminOrdersState = { orders: [], selected: new Set() };

function localDay(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadAdminOrders() {
  const tbody = document.querySelector('#admin-orders-table tbody');
  tbody.innerHTML = '<tr><td colspan="10">Yükleniyor...</td></tr>';
  try {
    adminOrdersState.orders = await apiCall('adminListOrders');
    const sellers = [...new Set(adminOrdersState.orders.map(o => o.ownerUsername))].sort();
    const cur = $('af-seller').value;
    $('af-seller').innerHTML = '<option value="">Tüm satıcılar</option>' + sellers.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (sellers.includes(cur)) $('af-seller').value = cur;
    const prods = new Map();
    adminOrdersState.orders.forEach(o => (o.items || []).forEach(it => prods.set(it.productCode, it.productName)));
    $('af-product-list').innerHTML = [...prods].map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('');
    renderAdminOrders();
  } catch (err) { tbody.innerHTML = `<tr><td colspan="10" class="error">${esc(err.message)}</td></tr>`; }
}

function filteredAdminOrders() {
  const seller = $('af-seller').value, status = $('af-status').value;
  const from = $('af-from').value, to = $('af-to').value;
  const q = $('af-product').value.trim().toLocaleLowerCase('tr');
  return adminOrdersState.orders.filter(o => {
    if (seller && o.ownerUsername !== seller) return false;
    if (status === 'approved' && o.status !== 'approved') return false;
    if (status === 'unapproved' && o.status === 'approved') return false;
    if ((status === 'pending' || status === 'rejected') && o.status !== status) return false;
    const day = localDay(o.createdAt);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (q && !(o.items || []).some(it => String(it.productCode).toLocaleLowerCase('tr').includes(q) || String(it.productName).toLocaleLowerCase('tr').includes(q))) return false;
    return true;
  });
}

function renderAdminOrders() {
  const list = filteredAdminOrders();
  const pending = adminOrdersState.orders.filter(o => o.status === 'pending').length;
  $('admin-pending-count').textContent = (pending ? `${pending} sipariş onay bekliyor` : 'Onay bekleyen sipariş yok') + ` · Listelenen: ${list.length} / ${adminOrdersState.orders.length}`;
  const tbody = document.querySelector('#admin-orders-table tbody');
  tbody.innerHTML = list.map(o => `<tr class="${o.flagBelowMin ? 'row-red' : ''}">
      <td><input type="checkbox" data-sel="${o.id}" ${adminOrdersState.selected.has(o.id) ? 'checked' : ''}></td>
      <td>${esc(orderNo(o))}</td><td>${esc(o.ownerUsername)}</td><td>${esc(o.customerName)}</td><td>${itemsSummary(o)}</td>
      <td class="num">${money(o.total)}<br><span class="hint">KDV hariç ${money(o.subtotal)}</span></td>
      <td>${warnBadges(o) || '-'}</td>
      <td>${o.status === 'approved' ? (o.shippedAt
        ? `<span class="chip green">Sevk: ${fmtDate(o.shippedAt)}</span> <button class="link" data-unship="${o.id}">Geri al</button>`
        : `<button class="secondary small" data-ship="${o.id}">Sevk edildi</button>`) : '-'}</td>
      <td>
        <button class="link" data-detail="${o.id}">Detay</button>
        ${o.status === 'pending'
          ? `<button class="primary small" data-approve="${o.id}">Onayla</button><button class="link" data-reject="${o.id}">Reddet</button>`
          : `<span class="badge ${o.status}">${STATUS_LABEL[o.status]}</span>`}
      </td>
      <td>${fmtDate(o.createdAt)}</td></tr>`).join('') || '<tr><td colspan="10">Filtreye uyan sipariş yok.</td></tr>';

  tbody.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => showOrderModal(adminOrdersState.orders.find(o => o.id === b.dataset.detail), true)));
  tbody.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => decideOrder(b.dataset.approve, 'approved')));
  tbody.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
    const reason = prompt('Onaylanmama sebebini yazın:');
    if (reason && reason.trim()) decideOrder(b.dataset.reject, 'rejected', reason);
  }));
  tbody.querySelectorAll('[data-ship]').forEach(b => b.addEventListener('click', () => markShipped(b.dataset.ship, true)));
  tbody.querySelectorAll('[data-unship]').forEach(b => b.addEventListener('click', () => { if (confirm('Sevk işaretini geri almak istiyor musunuz?')) markShipped(b.dataset.unship, false); }));
  tbody.querySelectorAll('input[data-sel]').forEach(cb => cb.addEventListener('change', () => {
    cb.checked ? adminOrdersState.selected.add(cb.dataset.sel) : adminOrdersState.selected.delete(cb.dataset.sel);
    updateAdminPdfButton();
  }));
  $('ao-select-all').checked = list.length > 0 && list.every(o => adminOrdersState.selected.has(o.id));
  updateAdminPdfButton();
}

function updateAdminPdfButton() {
  const n = adminOrdersState.selected.size;
  $('ao-pdf-btn').textContent = `Seçilenleri PDF indir (${n})`;
  $('ao-pdf-btn').disabled = n === 0;
}

async function decideOrder(orderId, status, reason) {
  try { await apiCall('adminSetOrderStatus', { orderId, status, reason }); loadAdminOrders(); }
  catch (err) { alert(err.message); }
}
async function markShipped(orderId, shipped) {
  try { await apiCall('adminMarkShipped', { orderId, shipped }); loadAdminOrders(); }
  catch (err) { alert(err.message); }
}

function bindAdminOrders() {
  ['af-seller', 'af-status', 'af-from', 'af-to'].forEach(id => $(id).addEventListener('change', renderAdminOrders));
  $('af-product').addEventListener('input', renderAdminOrders);
  $('af-clear').addEventListener('click', () => {
    ['af-seller', 'af-status', 'af-from', 'af-to', 'af-product'].forEach(id => { $(id).value = ''; });
    renderAdminOrders();
  });
  $('ao-select-all').addEventListener('change', (e) => {
    filteredAdminOrders().forEach(o => e.target.checked ? adminOrdersState.selected.add(o.id) : adminOrdersState.selected.delete(o.id));
    renderAdminOrders();
  });
  $('ao-pdf-btn').addEventListener('click', () => {
    const chosen = adminOrdersState.orders.filter(o => adminOrdersState.selected.has(o.id));
    if (!chosen.length) return;
    OrderPdf.downloadOrdersPdf(chosen.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), {
      admin: true, title: 'Sipariş Raporu (Yönetici)', subtitle: `${chosen.length} sipariş`
    });
  });
}

// ============ ADMİN: Müşteri onayları ve limitler ============
const adminCustState = { list: [] };

async function loadAdminCustomers() {
  const tbody = document.querySelector('#admin-customers-table tbody');
  tbody.innerHTML = '<tr><td colspan="7">Yükleniyor...</td></tr>';
  try {
    adminCustState.list = await apiCall('adminListCustomers');
    const sellers = [...new Set(adminCustState.list.map(c => c.ownerUsername))].sort();
    const cur = $('ac-seller').value;
    $('ac-seller').innerHTML = '<option value="">Tüm satıcılar</option>' + sellers.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (sellers.includes(cur)) $('ac-seller').value = cur;
    renderAdminCustomers();
  } catch (err) { tbody.innerHTML = `<tr><td colspan="7" class="error">${esc(err.message)}</td></tr>`; }
}

function renderAdminCustomers() {
  const seller = $('ac-seller').value, status = $('ac-status').value;
  const list = adminCustState.list.filter(c => (!seller || c.ownerUsername === seller) && (!status || c.approvalStatus === status))
    .sort((a, b) => String(a.ownerUsername).localeCompare(String(b.ownerUsername)) || String(a.customerName).localeCompare(String(b.customerName), 'tr'));
  const pending = adminCustState.list.filter(c => c.approvalStatus === 'pending').length;
  $('admin-cust-count').textContent = (pending ? `${pending} müşteri onay bekliyor` : 'Onay bekleyen müşteri yok') + ` · Listelenen: ${list.length}`;
  const tbody = document.querySelector('#admin-customers-table tbody');
  tbody.innerHTML = list.map(c => `<tr>
      <td><strong>${esc(c.ownerUsername)}</strong></td><td>${esc(c.customerName)}</td><td>${esc(c.taxId)}</td>
      <td>${statusBadge(c.approvalStatus)}${c.approvalStatus === 'rejected' ? `<br><span class="hint">${esc(c.approvalNote)}</span>` : ''}</td>
      <td class="num">${c.approvalStatus === 'approved' ? (c.orderLimit !== '' ? money(c.orderLimit) : 'Limitsiz') : '-'}</td>
      <td>${esc(c.deliveryAddress)}</td>
      <td><button class="link" data-detail="${c.id}">Detay</button>
        ${c.approvalStatus !== 'approved' ? `<button class="primary small" data-approve="${c.id}">Onayla</button>` : `<button class="link" data-limit="${c.id}">Limit</button>`}
        ${c.approvalStatus === 'pending' ? `<button class="link" data-reject="${c.id}">Reddet</button>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="7">Müşteri yok.</td></tr>';

  const find = (id) => adminCustState.list.find(c => c.id === id);
  tbody.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => showCustomerModal(find(b.dataset.detail))));
  tbody.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
    const limit = prompt('Sipariş limiti (KDV dahil, ₺). Limitsiz bırakmak için boş bırakın:', '');
    if (limit === null) return;
    try { await apiCall('adminDecideCustomer', { customerId: b.dataset.approve, decision: 'approved', orderLimit: limit }); loadAdminCustomers(); }
    catch (err) { alert(err.message); }
  }));
  tbody.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
    const reason = prompt('Onaylanmama sebebini yazın:');
    if (!reason || !reason.trim()) return;
    try { await apiCall('adminDecideCustomer', { customerId: b.dataset.reject, decision: 'rejected', reason }); loadAdminCustomers(); }
    catch (err) { alert(err.message); }
  }));
  tbody.querySelectorAll('[data-limit]').forEach(b => b.addEventListener('click', async () => {
    const c = find(b.dataset.limit);
    const limit = prompt('Sipariş limiti (KDV dahil, ₺). Kaldırmak için boş bırakın:', c.orderLimit === '' ? '' : String(c.orderLimit));
    if (limit === null) return;
    try { await apiCall('adminSetCustomerLimit', { customerId: c.id, orderLimit: limit }); loadAdminCustomers(); }
    catch (err) { alert(err.message); }
  }));
}

function showCustomerModal(c) {
  const row = (l, v) => `<tr><td class="hint" style="width:200px">${l}</td><td>${esc(v || '-')}</td></tr>`;
  $('modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal" style="width:620px;max-height:90vh;overflow:auto">
    <h3 style="margin-top:0">${esc(c.customerName)} ${statusBadge(c.approvalStatus)}</h3>
    <table>${row('Satıcı', c.ownerUsername)}${row('Vergi Levhasındaki Ad', c.taxPlateName)}${row('Vergi Kimlik No', c.taxId)}
      ${row('Müşteri Adresi', c.address)}${row('Teslimat Adresi', c.deliveryAddress)}
      ${row('Ödeme Sorumlusu', c.paymentResponsible)}${row('  Telefon / E-posta', c.paymentResponsiblePhone + ' / ' + c.paymentResponsibleEmail)}
      ${row('Depo Sorumlusu', c.warehouseResponsible)}${row('  Telefon / E-posta', c.warehouseResponsiblePhone + ' / ' + c.warehouseResponsibleEmail)}
      ${row('Siparişi Onaylayan', c.approverNames)}${row('  Telefon / E-posta', c.approverPhone + ' / ' + c.approverEmail)}
      ${row('Sipariş Limiti (KDV dahil)', c.orderLimit !== '' ? money(c.orderLimit) : (c.approvalStatus === 'approved' ? 'Limitsiz' : '-'))}
      ${c.approvalNote ? row('Ret Sebebi', c.approvalNote) : ''}</table>
    <div class="modal-actions"><button class="secondary" id="modal-close">Kapat</button></div></div></div>`;
  $('modal-close').addEventListener('click', () => { $('modal-root').innerHTML = ''; });
}

function bindAdminCustomers() {
  $('ac-seller').addEventListener('change', renderAdminCustomers);
  $('ac-status').addEventListener('change', renderAdminCustomers);
}

// ============ ADMİN: Ürünler + Excel toplu yükleme ============
const productFormState = { editingId: null, list: [], importRows: null };

async function loadAdminProducts() {
  resetProductForm();
  $('imp-result').innerHTML = ''; $('imp-preview').innerHTML = '';
  $('imp-upload-btn').classList.add('hidden'); productFormState.importRows = null;
  const tbody = document.querySelector('#admin-products-table tbody');
  tbody.innerHTML = '<tr><td colspan="7">Yükleniyor...</td></tr>';
  try {
    productFormState.list = await apiCall('listProducts');
    tbody.innerHTML = productFormState.list.map(p => `<tr class="${p.active ? '' : 'inactive'}">
        <td>${esc(p.code)}</td><td>${esc(p.name)}<br><span class="hint">${esc(p.description)}</span></td>
        <td class="num">${p.minPrice === '' ? '<span class="chip amber">eksik</span>' : money(p.minPrice)}</td>
        <td class="num">${p.caseQty === '' ? '<span class="chip amber">eksik</span>' : esc(p.caseQty)}</td>
        <td>${p.active ? 'Aktif' : 'Pasif'}</td>
        <td><button class="link" data-edit="${p.id}">Düzenle</button>
            <button class="link" data-toggle="${p.id}">${p.active ? 'Pasife al' : 'Aktif et'}</button></td></tr>`).join('')
      || '<tr><td colspan="7">Henüz ürün yok.</td></tr>';
    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const p = productFormState.list.find(x => x.id === b.dataset.edit);
      productFormState.editingId = p.id;
      $('ap-code').value = p.code; $('ap-name').value = p.name; $('ap-description').value = p.description;
      $('ap-minPrice').value = p.minPrice; $('ap-caseQty').value = p.caseQty;
      $('ap-title').textContent = 'Ürünü Düzenle';
      window.scrollTo(0, 0);
    }));
    tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const p = productFormState.list.find(x => x.id === b.dataset.toggle);
      try { await apiCall('adminSaveProduct', Object.assign({}, p, { active: !p.active })); loadAdminProducts(); }
      catch (err) { alert(err.message); }
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="7" class="error">${esc(err.message)}</td></tr>`; }
}

function resetProductForm() {
  productFormState.editingId = null;
  ['ap-code', 'ap-name', 'ap-description', 'ap-minPrice', 'ap-caseQty'].forEach(id => { $(id).value = ''; });
  $('ap-title').textContent = 'Yeni Ürün'; $('ap-error').textContent = '';
}

const IMPORT_COLUMNS = [['code', 'Ürün Kodu'], ['name', 'Ürün Adı'], ['description', 'Açıklama'], ['minPrice', 'Minimum Fiyat (KDV Hariç)'], ['caseQty', 'Koli Adeti']];
const normHeader = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr').replace(/[\s*]/g, '');

/** read-excel-file çıktısını (düz satır dizisi veya [{sheet,data}]) ürün satırlarına çevirir. */
function productRowsFromSheet(result) {
  const data = Array.isArray(result) && result.length && result[0] && Array.isArray(result[0].data) ? result[0].data : result;
  if (!data || !data.length) throw new Error('Dosyada veri bulunamadı.');
  const headers = data[0].map(normHeader);
  const idx = {}; const missing = [];
  IMPORT_COLUMNS.forEach(([key, label]) => {
    const i = headers.indexOf(normHeader(label));
    if (i === -1) missing.push(label); else idx[key] = i;
  });
  if (missing.length) throw new Error('Şablonda eksik sütun(lar): ' + missing.join(', ') + '. Lütfen şablonu yeniden indirip kullanın.');
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const cells = data[r] || [];
    if (cells.every(c => c === null || c === undefined || String(c).trim() === '')) continue; // boş satır
    const get = (k) => { const v = cells[idx[k]]; return v === null || v === undefined ? '' : v; };
    rows.push({ row: r + 1, code: String(get('code')).trim(), name: String(get('name')).trim(),
      description: String(get('description')).trim(), minPrice: get('minPrice'), caseQty: get('caseQty') });
  }
  if (!rows.length) throw new Error('Şablonda ürün satırı bulunamadı.');
  return rows;
}

function bindAdminProducts() {
  $('ap-cancel-btn').addEventListener('click', resetProductForm);
  $('ap-save-btn').addEventListener('click', async () => {
    $('ap-error').textContent = '';
    const payload = { code: val('ap-code'), name: val('ap-name'), description: val('ap-description'), minPrice: val('ap-minPrice'), caseQty: val('ap-caseQty') };
    if (productFormState.editingId) payload.id = productFormState.editingId;
    try { await apiCall('adminSaveProduct', payload); loadAdminProducts(); }
    catch (err) { $('ap-error').textContent = err.message; }
  });

  $('imp-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    $('imp-result').innerHTML = ''; $('imp-preview').innerHTML = '';
    $('imp-upload-btn').classList.add('hidden'); productFormState.importRows = null;
    if (!file) return;
    try {
      const rows = productRowsFromSheet(await readXlsxFile(file));
      productFormState.importRows = rows;
      $('imp-preview').innerHTML = `<p><strong>${rows.length}</strong> ürün satırı okundu. İlk satırlar:</p>
        <table><thead><tr><th>Satır</th><th>Kod</th><th>Ad</th><th>Açıklama</th><th class="num">Min. Fiyat</th><th class="num">Koli</th></tr></thead><tbody>` +
        rows.slice(0, 5).map(r => `<tr><td>${r.row}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.description)}</td><td class="num">${esc(r.minPrice)}</td><td class="num">${esc(r.caseQty)}</td></tr>`).join('') +
        '</tbody></table>';
      $('imp-upload-btn').classList.remove('hidden');
    } catch (err) { $('imp-result').innerHTML = `<p class="error">${esc(err.message)}</p>`; }
  });

  $('imp-upload-btn').addEventListener('click', async () => {
    if (!productFormState.importRows) return;
    $('imp-result').innerHTML = '<p class="hint">Yükleniyor...</p>';
    try {
      const r = await apiCall('adminImportProducts', { rows: productFormState.importRows });
      if (!r.imported) {
        $('imp-result').innerHTML = `<div class="notice err"><strong>${r.errorCount} hata bulundu, hiçbir ürün yüklenmedi.</strong> Dosyayı düzeltip tekrar yükleyin.<ul>` +
          r.errors.map(e => `<li>${esc(e)}</li>`).join('') + (r.errorCount > r.errors.length ? `<li>... ve ${r.errorCount - r.errors.length} hata daha</li>` : '') + '</ul></div>';
        return;
      }
      await loadAdminProducts();
      $('imp-result').innerHTML = `<div class="notice ok">Yükleme tamamlandı: <strong>${r.created}</strong> yeni ürün eklendi, <strong>${r.updated}</strong> mevcut ürün güncellendi.</div>`;
      $('imp-file').value = '';
    } catch (err) { $('imp-result').innerHTML = `<p class="error">${esc(err.message)}</p>`; }
  });
}

// ============ ADMİN: Ödeme planları ============
const planFormState = { editingId: null, list: [] };

async function loadAdminPlans() {
  resetPlanForm();
  const tbody = document.querySelector('#admin-plans-table tbody');
  tbody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
  try {
    planFormState.list = await apiCall('listPaymentPlans');
    tbody.innerHTML = planFormState.list.map(p => `<tr class="${p.active ? '' : 'inactive'}">
        <td>${esc(p.name)}</td><td>${PLAN_TYPE_LABEL[p.type]}</td><td class="num">%${esc(p.costPercent)}</td><td>${p.active ? 'Aktif' : 'Pasif'}</td>
        <td><button class="link" data-edit="${p.id}">Düzenle</button>
            <button class="link" data-toggle="${p.id}">${p.active ? 'Pasife al' : 'Aktif et'}</button></td></tr>`).join('')
      || '<tr><td colspan="5">Henüz plan yok.</td></tr>';
    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const p = planFormState.list.find(x => x.id === b.dataset.edit);
      planFormState.editingId = p.id;
      $('pp-name').value = p.name; $('pp-type').value = p.type; $('pp-cost').value = p.costPercent;
      syncPlanCost(); $('pp-title').textContent = 'Ödeme Planını Düzenle';
      window.scrollTo(0, 0);
    }));
    tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const p = planFormState.list.find(x => x.id === b.dataset.toggle);
      try { await apiCall('adminSavePaymentPlan', Object.assign({}, p, { active: !p.active })); loadAdminPlans(); }
      catch (err) { alert(err.message); }
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" class="error">${esc(err.message)}</td></tr>`; }
}

function syncPlanCost() {
  const cash = $('pp-type').value === 'cash';
  $('pp-cost').disabled = cash;
  if (cash) $('pp-cost').value = 0;
}
function resetPlanForm() {
  planFormState.editingId = null;
  $('pp-name').value = ''; $('pp-type').value = 'cash'; $('pp-cost').value = 0;
  syncPlanCost(); $('pp-title').textContent = 'Yeni Ödeme Planı'; $('pp-error').textContent = '';
}
function bindAdminPlans() {
  $('pp-type').addEventListener('change', syncPlanCost);
  $('pp-cancel-btn').addEventListener('click', resetPlanForm);
  $('pp-save-btn').addEventListener('click', async () => {
    $('pp-error').textContent = '';
    const payload = { name: val('pp-name'), type: $('pp-type').value, costPercent: $('pp-cost').value };
    if (planFormState.editingId) payload.id = planFormState.editingId;
    try { await apiCall('adminSavePaymentPlan', payload); loadAdminPlans(); }
    catch (err) { $('pp-error').textContent = err.message; }
  });
}

// ============ ADMİN: Kullanıcılar ============
async function loadAdminUsers() {
  $('au-error').textContent = '';
  const tbody = document.querySelector('#admin-users-table tbody');
  tbody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
  try {
    const users = await apiCall('adminListUsers');
    tbody.innerHTML = users.map(u => `<tr class="${u.active ? '' : 'inactive'}">
        <td>${esc(u.username)}${u.username === state.username ? ' <span class="hint">(siz)</span>' : ''}</td>
        <td>${esc(u.email)}</td>
        <td><select data-role="${esc(u.username)}" ${u.username === state.username ? 'disabled' : ''}>
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Satıcı</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
        <td>${u.active ? 'Aktif' : 'Pasif'}</td>
        <td><button class="link" data-reset="${esc(u.username)}">Şifre sıfırla</button>
            <button class="link" data-toggle="${esc(u.username)}" ${u.username === state.username ? 'disabled' : ''}>${u.active ? 'Pasife al' : 'Aktif et'}</button></td></tr>`).join('')
      || '<tr><td colspan="5">Henüz kullanıcı yok.</td></tr>';
    tbody.querySelectorAll('[data-role]').forEach(sel => sel.addEventListener('change', async () => {
      try { await apiCall('adminUpdateUser', { username: sel.dataset.role, role: sel.value }); loadAdminUsers(); }
      catch (err) { alert(err.message); loadAdminUsers(); }
    }));
    tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const u = users.find(x => x.username === b.dataset.toggle);
      try { await apiCall('adminUpdateUser', { username: u.username, active: !u.active }); loadAdminUsers(); }
      catch (err) { alert(err.message); }
    }));
    tbody.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', async () => {
      const pw = prompt('Yeni şifre (en az 6 karakter):');
      if (!pw) return;
      try { await apiCall('adminResetPassword', { username: b.dataset.reset, newPassword: pw }); alert('Şifre güncellendi.'); }
      catch (err) { alert(err.message); }
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" class="error">${esc(err.message)}</td></tr>`; }
}
function bindAdminUsers() {
  $('au-save-btn').addEventListener('click', async () => {
    $('au-error').textContent = '';
    try {
      await apiCall('adminCreateUser', { username: val('au-username'), email: val('au-email'), password: $('au-password').value, role: $('au-role').value });
      $('au-username').value = ''; $('au-email').value = ''; $('au-password').value = '';
      loadAdminUsers();
    } catch (err) { $('au-error').textContent = err.message; }
  });
}
