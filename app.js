// API_URL, config.js içinde tanımlıdır.

const state = {
  token: localStorage.getItem('token') || '',
  username: localStorage.getItem('username') || '',
  role: localStorage.getItem('role') || '',
  products: [],
  plans: [],
  myCustomers: [],
  editingCustomerId: null,
  editingProductId: null
};

const CUSTOMER_FIELDS = [
  ['customerName', 'Müşteri Adı', 'input'],
  ['taxPlateName', 'Vergi Levhasındaki Ad', 'input'],
  ['taxId', 'Vergi Kimlik No', 'input'],
  ['deliveryAddress', 'Teslimat Adresi', 'textarea'],
  ['paymentResponsible', 'Ödeme Sorumlusu', 'input'],
  ['warehouseResponsible', 'Depo Sorumlusu', 'input'],
  ['approverNames', 'Siparişi Onaylayan İsim(ler)', 'input'],
  ['phones', 'Telefon Numaraları', 'input'],
  ['emails', 'E-posta Adresleri', 'input']
];

// ---------- API ----------
async function apiCall(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // CORS preflight'ı önler
    body: JSON.stringify({ action, token: state.token, payload: payload || {} })
  });
  const json = await res.json();
  if (!json.ok) {
    if (/oturum/i.test(json.error || '') && state.token) { clearSession(); renderHeader(); showView('login'); }
    throw new Error(json.error || 'Bilinmeyen hata');
  }
  return json.data;
}

function setSession(d) {
  state.token = d.token; state.username = d.username; state.role = d.role;
  localStorage.setItem('token', d.token);
  localStorage.setItem('username', d.username);
  localStorage.setItem('role', d.role);
}
function clearSession() {
  state.token = ''; state.username = ''; state.role = '';
  localStorage.clear();
}

// ---------- Yardımcılar ----------
const $ = (id) => document.getElementById(id);
const val = (id) => $(id).value.trim();
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function money(n) {
  return (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}
function num(v) { return Number(String(v).replace(',', '.')) || 0; }
const STATUS_LABEL = { approved: 'Onaylandı', pending: 'Bekliyor', rejected: 'Onaylanmadı' };
function itemsSummary(o) {
  const items = o.items || [];
  if (!items.length) return '-';
  return esc(items[0].productName) + (items.length > 1 ? ` +${items.length - 1} ürün` : '');
}

function customerFieldsHtml(prefix) {
  return CUSTOMER_FIELDS.map(([key, label, type]) =>
    `<label>${label}</label>` +
    (type === 'textarea' ? `<textarea id="${prefix}-${key}"></textarea>` : `<input id="${prefix}-${key}" />`)
  ).join('');
}
function readCustomerFields(prefix) {
  const c = {};
  CUSTOMER_FIELDS.forEach(([key]) => { c[key] = val(`${prefix}-${key}`); });
  return c;
}
function fillCustomerFields(prefix, c) {
  CUSTOMER_FIELDS.forEach(([key]) => { $(`${prefix}-${key}`).value = (c && c[key]) || ''; });
}

// ---------- Görünüm yönetimi ----------
const VIEWS = ['login', 'new-order', 'my-orders', 'my-customers', 'admin', 'admin-customers', 'admin-products', 'admin-plans', 'admin-users'];
const LOADERS = {
  'new-order': loadNewOrderView,
  'my-orders': loadMyOrders,
  'my-customers': loadMyCustomers,
  'admin': loadAdminOrders,
  'admin-customers': loadAdminCustomers,
  'admin-products': loadAdminProducts,
  'admin-plans': loadAdminPlans,
  'admin-users': loadAdminUsers
};

function showView(name) {
  VIEWS.forEach(v => $('view-' + v).classList.toggle('hidden', v !== name));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (LOADERS[name]) LOADERS[name]();
}

function renderHeader() {
  $('app-header').classList.toggle('hidden', !state.token);
  document.querySelectorAll('.admin-only').forEach(b => b.classList.toggle('hidden', state.role !== 'admin'));
  $('current-user').textContent = state.username
    ? `${state.username} (${state.role === 'admin' ? 'admin' : 'satıcı'})` : '';
}

document.querySelectorAll('nav button[data-view]').forEach(b =>
  b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- Giriş / çıkış ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    const d = await apiCall('login', { username: val('login-username'), password: $('login-password').value });
    setSession(d);
    renderHeader();
    showView(state.role === 'admin' ? 'admin' : 'new-order');
  } catch (err) { $('login-error').textContent = err.message; }
});

$('logout-btn').addEventListener('click', async () => {
  try { await apiCall('logout', {}); } catch (e) { /* yoksay */ }
  clearSession(); renderHeader(); showView('login');
});

// ---------- Yeni sipariş ----------
async function loadNewOrderView() {
  $('order-error').textContent = ''; $('order-success').textContent = '';
  const errors = [];
  try { state.myCustomers = await apiCall('listMyCustomers'); } catch (e) { errors.push('Müşteriler: ' + e.message); }
  try { state.products = await apiCall('listProducts'); } catch (e) { errors.push('Ürünler: ' + e.message); }
  try { state.plans = await apiCall('listPaymentPlans'); } catch (e) { errors.push('Ödeme planları: ' + e.message); }
  fillCustomerSelect();
  $('order-paymentPlan').innerHTML = '<option value="">Plan seçin...</option>' +
    state.plans.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  $('order-items').innerHTML = '';
  addItemRow();
  updateTotal();
  if (!state.products.length) errors.push('Henüz sisteme ürün eklenmemiş (admin eklemeli).');
  if (!state.plans.length) errors.push('Henüz ödeme planı tanımlanmamış (admin eklemeli).');
  $('order-error').textContent = errors.join(' | ');
}

function fillCustomerSelect(selectId) {
  $('order-customer').innerHTML = '<option value="">Müşteri seçin...</option>' +
    state.myCustomers.map(c => `<option value="${c.id}">${esc(c.customerName)}</option>`).join('') +
    '<option value="__new__">+ Yeni müşteri ekle</option>';
  if (selectId) $('order-customer').value = selectId;
}

$('order-customer').addEventListener('change', (e) =>
  $('new-customer-box').classList.toggle('hidden', e.target.value !== '__new__'));

$('save-new-customer-btn').addEventListener('click', async () => {
  $('order-error').textContent = '';
  try {
    const saved = await apiCall('saveCustomer', readCustomerFields('nc'));
    state.myCustomers.push(saved);
    fillCustomerSelect(saved.id);
    fillCustomerFields('nc', null);
    $('new-customer-box').classList.add('hidden');
  } catch (err) { $('order-error').textContent = err.message; }
});

function addItemRow() {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML =
    `<select class="it-product"><option value="">Ürün seçin...</option>` +
    state.products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.code)})</option>`).join('') +
    `</select>` +
    `<input class="it-qty" type="number" min="0" step="any" placeholder="Adet" />` +
    `<input class="it-price" type="number" min="0" step="0.01" placeholder="Birim fiyat (₺)" />` +
    `<span class="it-total">0,00 ₺</span>` +
    `<button type="button" class="link it-remove">Sil</button>`;
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', updateTotal));
  row.querySelector('.it-remove').addEventListener('click', () => {
    if ($('order-items').children.length > 1) { row.remove(); updateTotal(); }
  });
  $('order-items').appendChild(row);
}
$('add-item-btn').addEventListener('click', addItemRow);

function updateTotal() {
  let total = 0;
  document.querySelectorAll('#order-items .item-row').forEach(row => {
    const line = num(row.querySelector('.it-qty').value) * num(row.querySelector('.it-price').value);
    row.querySelector('.it-total').textContent = money(line);
    total += line;
  });
  $('order-total').textContent = money(total);
}

$('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('order-error'), okEl = $('order-success');
  errorEl.textContent = ''; okEl.textContent = '';

  const customerId = $('order-customer').value;
  if (!customerId || customerId === '__new__') {
    errorEl.textContent = 'Lütfen bir müşteri seçin (veya önce yeni müşteri kaydedin).'; return;
  }
  const items = [];
  for (const row of document.querySelectorAll('#order-items .item-row')) {
    const productId = row.querySelector('.it-product').value;
    const quantity = row.querySelector('.it-qty').value;
    const unitPrice = row.querySelector('.it-price').value;
    if (!productId && !quantity && !unitPrice) continue; // tamamen boş satırı atla
    if (!productId || !(num(quantity) > 0) || unitPrice === '') {
      errorEl.textContent = 'Her ürün satırında ürün, adet ve fiyat dolu olmalı.'; return;
    }
    items.push({ productId, quantity, unitPrice });
  }
  if (!items.length) { errorEl.textContent = 'En az bir ürün satırı girin.'; return; }

  try {
    await apiCall('createOrder', {
      customerId, items,
      paymentPlan: $('order-paymentPlan').value,
      deliveryDate: $('order-deliveryDate').value,
      note: val('order-note')
    });
    okEl.textContent = 'Sipariş oluşturuldu ve admin onayına gönderildi.';
    $('order-form').reset();
    $('order-items').innerHTML = ''; addItemRow(); updateTotal();
    $('new-customer-box').classList.add('hidden');
  } catch (err) { errorEl.textContent = err.message; }
});

// ---------- Sipariş detay penceresi ----------
function showOrderModal(o, isAdmin) {
  const rows = (o.items || []).map(it => `<tr>
      <td>${esc(it.productName)}<br><span class="hint">${esc(it.productCode)}</span></td>
      <td class="num">${esc(it.quantity)}</td>
      <td class="num">${money(it.unitPrice)}</td>
      <td class="num">${money(it.lineTotal)}</td></tr>`).join('');
  $('modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal" style="width:560px">
    <h3 style="margin-top:0">${esc(o.customerName)}</h3>
    ${isAdmin ? `<div class="hint">Satıcı: ${esc(o.ownerUsername)}</div>` : ''}
    <div class="hint">Ödeme planı: ${esc(o.paymentPlan)} · Teslimat: ${esc(o.deliveryDate)}</div>
    <table style="margin-top:10px"><thead><tr><th>Ürün</th><th class="num">Adet</th><th class="num">Fiyat</th><th class="num">Tutar</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="total-line">Toplam: ${money(o.total)}</div>
    ${o.note ? `<p class="hint">Not: ${esc(o.note)}</p>` : ''}
    <p><span class="badge ${o.status}">${STATUS_LABEL[o.status]}</span></p>
    ${o.status === 'rejected' ? `<p class="error"><strong>Onaylanmama sebebi:</strong> ${esc(o.rejectionReason || 'Belirtilmemiş')}</p>` : ''}
    <button class="primary" id="modal-close">Kapat</button></div></div>`;
  $('modal-close').addEventListener('click', () => { $('modal-root').innerHTML = ''; });
}

// ---------- Siparişlerim ----------
async function loadMyOrders() {
  const tbody = document.querySelector('#my-orders-table tbody');
  tbody.innerHTML = '<tr><td colspan="6">Yükleniyor...</td></tr>';
  try {
    const orders = await apiCall('listMyOrders');
    tbody.innerHTML = orders.map(o => `<tr>
        <td>${esc(o.customerName)}</td><td>${itemsSummary(o)}</td>
        <td class="num">${money(o.total)}</td><td>${esc(o.deliveryDate)}</td>
        <td><button class="badge ${o.status}" data-id="${o.id}">${STATUS_LABEL[o.status]}</button></td>
        <td>${new Date(o.createdAt).toLocaleString('tr-TR')}</td></tr>`).join('')
      || '<tr><td colspan="6">Henüz sipariş yok.</td></tr>';
    tbody.querySelectorAll('button[data-id]').forEach(b =>
      b.addEventListener('click', () => showOrderModal(orders.find(o => o.id === b.dataset.id), false)));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="error">${esc(err.message)}</td></tr>`; }
}

// ---------- Müşterilerim ----------
async function loadMyCustomers() {
  resetCustomerForm();
  const tbody = document.querySelector('#my-customers-table tbody');
  tbody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
  try {
    state.myCustomers = await apiCall('listMyCustomers');
    tbody.innerHTML = state.myCustomers.map(c => `<tr>
        <td>${esc(c.customerName)}</td><td>${esc(c.taxId)}</td>
        <td>${esc(c.deliveryAddress)}</td><td>${esc(c.phones)}</td>
        <td><button class="link" data-edit="${c.id}">Düzenle</button></td></tr>`).join('')
      || '<tr><td colspan="5">Henüz müşteri yok.</td></tr>';
    tbody.querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', () => {
      const c = state.myCustomers.find(x => x.id === b.dataset.edit);
      state.editingCustomerId = c.id;
      fillCustomerFields('mc', c);
      $('mc-title').textContent = 'Müşteriyi Düzenle';
      window.scrollTo(0, 0);
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" class="error">${esc(err.message)}</td></tr>`; }
}
function resetCustomerForm() {
  state.editingCustomerId = null;
  fillCustomerFields('mc', null);
  $('mc-title').textContent = 'Yeni Müşteri Ekle';
  $('mc-error').textContent = '';
}
$('mc-cancel-btn').addEventListener('click', resetCustomerForm);
$('mc-save-btn').addEventListener('click', async () => {
  $('mc-error').textContent = '';
  try {
    const payload = readCustomerFields('mc');
    if (state.editingCustomerId) payload.id = state.editingCustomerId;
    await apiCall('saveCustomer', payload);
    loadMyCustomers();
  } catch (err) { $('mc-error').textContent = err.message; }
});

// ---------- Admin: sipariş onayları ----------
async function loadAdminOrders() {
  const tbody = document.querySelector('#admin-orders-table tbody');
  tbody.innerHTML = '<tr><td colspan="7">Yükleniyor...</td></tr>';
  try {
    const orders = await apiCall('adminListOrders');
    const pending = orders.filter(o => o.status === 'pending').length;
    $('admin-pending-count').textContent = pending ? `${pending} sipariş onay bekliyor` : 'Onay bekleyen sipariş yok';
    tbody.innerHTML = orders.map(o => `<tr>
        <td>${esc(o.ownerUsername)}</td><td>${esc(o.customerName)}</td><td>${itemsSummary(o)}</td>
        <td class="num">${money(o.total)}</td><td>${esc(o.deliveryDate)}</td>
        <td>
          <button class="link" data-detail="${o.id}">Detay</button>
          ${o.status === 'pending'
            ? `<button class="primary small" data-approve="${o.id}">Onayla</button>
               <button class="link" data-reject="${o.id}">Reddet</button>`
            : `<span class="badge ${o.status}">${STATUS_LABEL[o.status]}</span>`}
        </td>
        <td>${new Date(o.createdAt).toLocaleString('tr-TR')}</td></tr>`).join('')
      || '<tr><td colspan="7">Henüz sipariş yok.</td></tr>';

    tbody.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () =>
      showOrderModal(orders.find(o => o.id === b.dataset.detail), true)));
    tbody.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () =>
      decideOrder(b.dataset.approve, 'approved')));
    tbody.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
      const reason = prompt('Onaylanmama sebebini yazın:');
      if (reason && reason.trim()) decideOrder(b.dataset.reject, 'rejected', reason);
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="7" class="error">${esc(err.message)}</td></tr>`; }
}
async function decideOrder(orderId, status, reason) {
  try { await apiCall('adminSetOrderStatus', { orderId, status, reason }); loadAdminOrders(); }
  catch (err) { alert(err.message); }
}

// ---------- Admin: tüm müşteriler ----------
async function loadAdminCustomers() {
  const tbody = document.querySelector('#admin-customers-table tbody');
  tbody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
  try {
    const list = await apiCall('adminListCustomers');
    list.sort((a, b) => String(a.ownerUsername).localeCompare(String(b.ownerUsername)));
    tbody.innerHTML = list.map(c => `<tr>
        <td><strong>${esc(c.ownerUsername)}</strong></td><td>${esc(c.customerName)}</td>
        <td>${esc(c.taxId)}</td><td>${esc(c.deliveryAddress)}</td><td>${esc(c.phones)}</td></tr>`).join('')
      || '<tr><td colspan="5">Henüz müşteri yok.</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" class="error">${esc(err.message)}</td></tr>`; }
}

// ---------- Admin: ürünler ----------
async function loadAdminProducts() {
  resetProductForm();
  const tbody = document.querySelector('#admin-products-table tbody');
  tbody.innerHTML = '<tr><td colspan="4">Yükleniyor...</td></tr>';
  try {
    const list = await apiCall('listProducts');
    tbody.innerHTML = list.map(p => `<tr class="${p.active ? '' : 'inactive'}">
        <td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${p.active ? 'Aktif' : 'Pasif'}</td>
        <td><button class="link" data-edit="${p.id}">Düzenle</button>
            <button class="link" data-toggle="${p.id}">${p.active ? 'Pasife al' : 'Aktif et'}</button></td></tr>`).join('')
      || '<tr><td colspan="4">Henüz ürün yok.</td></tr>';
    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const p = list.find(x => x.id === b.dataset.edit);
      state.editingProductId = p.id;
      $('ap-code').value = p.code; $('ap-name').value = p.name;
      $('ap-title').textContent = 'Ürünü Düzenle';
      window.scrollTo(0, 0);
    }));
    tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const p = list.find(x => x.id === b.dataset.toggle);
      try { await apiCall('adminSaveProduct', { id: p.id, code: p.code, name: p.name, active: !p.active }); loadAdminProducts(); }
      catch (err) { alert(err.message); }
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="4" class="error">${esc(err.message)}</td></tr>`; }
}
function resetProductForm() {
  state.editingProductId = null;
  $('ap-code').value = ''; $('ap-name').value = '';
  $('ap-title').textContent = 'Yeni Ürün'; $('ap-error').textContent = '';
}
$('ap-cancel-btn').addEventListener('click', resetProductForm);
$('ap-save-btn').addEventListener('click', async () => {
  $('ap-error').textContent = '';
  try {
    const payload = { code: val('ap-code'), name: val('ap-name') };
    if (state.editingProductId) payload.id = state.editingProductId;
    await apiCall('adminSaveProduct', payload);
    loadAdminProducts();
  } catch (err) { $('ap-error').textContent = err.message; }
});

// ---------- Admin: ödeme planları ----------
async function loadAdminPlans() {
  $('pp-error').textContent = '';
  const tbody = document.querySelector('#admin-plans-table tbody');
  tbody.innerHTML = '<tr><td colspan="3">Yükleniyor...</td></tr>';
  try {
    const list = await apiCall('listPaymentPlans');
    tbody.innerHTML = list.map(p => `<tr class="${p.active ? '' : 'inactive'}">
        <td>${esc(p.name)}</td><td>${p.active ? 'Aktif' : 'Pasif'}</td>
        <td><button class="link" data-toggle="${p.id}">${p.active ? 'Pasife al' : 'Aktif et'}</button></td></tr>`).join('')
      || '<tr><td colspan="3">Henüz plan yok.</td></tr>';
    tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const p = list.find(x => x.id === b.dataset.toggle);
      try { await apiCall('adminSavePaymentPlan', { id: p.id, name: p.name, active: !p.active }); loadAdminPlans(); }
      catch (err) { alert(err.message); }
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="3" class="error">${esc(err.message)}</td></tr>`; }
}
$('pp-save-btn').addEventListener('click', async () => {
  $('pp-error').textContent = '';
  try { await apiCall('adminSavePaymentPlan', { name: val('pp-name') }); $('pp-name').value = ''; loadAdminPlans(); }
  catch (err) { $('pp-error').textContent = err.message; }
});

// ---------- Admin: kullanıcılar ----------
async function loadAdminUsers() {
  $('au-error').textContent = '';
  const tbody = document.querySelector('#admin-users-table tbody');
  tbody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
  try {
    const users = await apiCall('adminListUsers');
    tbody.innerHTML = users.map(u => `<tr class="${u.active ? '' : 'inactive'}">
        <td>${esc(u.username)}${u.username === state.username ? ' <span class="hint">(siz)</span>' : ''}</td>
        <td>${esc(u.email)}</td>
        <td>
          <select data-role="${esc(u.username)}" ${u.username === state.username ? 'disabled' : ''}>
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Satıcı</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>${u.active ? 'Aktif' : 'Pasif'}</td>
        <td>
          <button class="link" data-reset="${esc(u.username)}">Şifre sıfırla</button>
          <button class="link" data-toggle="${esc(u.username)}" ${u.username === state.username ? 'disabled' : ''}>${u.active ? 'Pasife al' : 'Aktif et'}</button>
        </td></tr>`).join('') || '<tr><td colspan="5">Henüz kullanıcı yok.</td></tr>';

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

$('au-save-btn').addEventListener('click', async () => {
  $('au-error').textContent = '';
  try {
    await apiCall('adminCreateUser', {
      username: val('au-username'), email: val('au-email'),
      password: $('au-password').value, role: $('au-role').value
    });
    $('au-username').value = ''; $('au-email').value = ''; $('au-password').value = '';
    loadAdminUsers();
  } catch (err) { $('au-error').textContent = err.message; }
});

// ---------- Başlangıç ----------
$('nc-fields').innerHTML = customerFieldsHtml('nc');
$('mc-fields').innerHTML = customerFieldsHtml('mc');
renderHeader();
showView(state.token ? (state.role === 'admin' ? 'admin' : 'new-order') : 'login');
