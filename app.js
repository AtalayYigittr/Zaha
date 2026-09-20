// ============================================================
// AYAR: Apps Script Web App dağıtımından aldığınız URL'i buraya yapıştırın.
// Dağıtımdan sonra "https://script.google.com/macros/s/AKfycb.../exec" gibi
// bir adres alırsınız.
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbxP2mmZEtCphL3ZScdfSvF6Z_seX57URoX-lgrkf1h5Z1IN7VmU0LaDZPu6JTl28n1x/exec';

const state = {
  token: localStorage.getItem('token') || '',
  username: localStorage.getItem('username') || '',
  role: localStorage.getItem('role') || '',
  models: [],
  myCustomers: [],       // uygulama içinde kendi eklediğiniz müşteriler
  parasutCustomers: []   // Paraşüt'teki mevcut müşteri kontakları (herkese görünür)
};

async function apiCall(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    // text/plain kullanılır: application/json header'ı tarayıcıda CORS
    // "preflight" isteğini tetikler ve Apps Script bunu doğru yanıtlayamaz.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: state.token, payload: payload || {} })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Bilinmeyen hata');
  return json.data;
}

function setSession(data) {
  state.token = data.token;
  state.username = data.username;
  state.role = data.role;
  localStorage.setItem('token', data.token);
  localStorage.setItem('username', data.username);
  localStorage.setItem('role', data.role);
}

function clearSession() {
  state.token = ''; state.username = ''; state.role = '';
  localStorage.clear();
}

// ---------- Görünüm yönetimi ----------
const views = ['login', 'new-order', 'my-orders', 'my-customers', 'admin', 'admin-customers'];

function showView(name) {
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  if (name === 'new-order') loadNewOrderView();
  if (name === 'my-orders') loadMyOrders();
  if (name === 'my-customers') loadMyCustomers();
  if (name === 'admin') loadAdminOrders();
  if (name === 'admin-customers') loadAdminCustomers();
}

function renderHeader() {
  const isLoggedIn = !!state.token;
  document.getElementById('app-header').classList.toggle('hidden', !isLoggedIn);
  document.getElementById('nav-admin').classList.toggle('hidden', state.role !== 'admin');
  document.getElementById('nav-admin-customers').classList.toggle('hidden', state.role !== 'admin');
  document.getElementById('current-user').textContent = state.username
    ? `${state.username} (${state.role === 'admin' ? 'admin' : 'kullanıcı'})`
    : '';
}

// ---------- Giriş ----------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    const data = await apiCall('login', { username, password });
    setSession(data);
    renderHeader();
    showView(state.role === 'admin' ? 'admin' : 'new-order');
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await apiCall('logout', {}); } catch (e) { /* ignore */ }
  clearSession();
  renderHeader();
  showView('login');
});

document.querySelectorAll('nav button[data-view]').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ---------- Yeni Sipariş ----------
// Model, kendi müşterilerim ve Paraşüt müşterileri birbirinden BAĞIMSIZ
// çekilir: biri hata verse bile diğerleri (ve "+ Yeni müşteri ekle"
// seçeneği) ekranda görünmeye devam eder.
async function loadNewOrderView() {
  const errorEl = document.getElementById('order-error');
  errorEl.textContent = '';
  const errors = [];

  if (state.models.length === 0) {
    try { state.models = await apiCall('getModels', {}); }
    catch (err) { errors.push('Modeller: ' + err.message); }
  }
  try {
    state.myCustomers = await apiCall('listMyCustomers', {});
  } catch (err) { errors.push('Kendi müşterileriniz: ' + err.message); }
  try {
    state.parasutCustomers = await apiCall('listParasutCustomers', {});
  } catch (err) { errors.push('Paraşüt müşterileri: ' + err.message); }

  fillModelSelect();
  fillCustomerSelect();
  if (errors.length) errorEl.textContent = errors.join(' | ');
}

function fillModelSelect() {
  const sel = document.getElementById('order-model');
  sel.innerHTML = '<option value="">Model seçin...</option>' +
    state.models.map(m => `<option value="${m.id}" data-name="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('') +
    '<option value="__new__">+ Yeni ürün ekle</option>';
}

function fillCustomerSelect() {
  const sel = document.getElementById('order-customer');
  const myGroup = state.myCustomers.map(c =>
    `<option value="local:${c.id}">${escapeHtml(c.customerName)}</option>`).join('');
  const parasutGroup = state.parasutCustomers.map(c =>
    `<option value="parasut:${c.parasutContactId}">${escapeHtml(c.customerName)}</option>`).join('');

  sel.innerHTML = '<option value="">Müşteri seçin...</option>'
    + (myGroup ? `<optgroup label="Kendi Müşterilerim">${myGroup}</optgroup>` : '')
    + (parasutGroup ? `<optgroup label="Paraşüt Müşterileri">${parasutGroup}</optgroup>` : '')
    + '<option value="__new__">+ Yeni müşteri ekle</option>';
}

/** Seçilen <option value="local:id"|"parasut:id"> ifadesinden ilgili müşteri objesini bulur. */
function resolveSelectedCustomer(value) {
  if (!value || value === '__new__') return null;
  const [source, id] = value.split(':');
  if (source === 'local') {
    const c = state.myCustomers.find(x => x.id === id);
    return c ? { source: 'local', customerId: c.id, customerName: c.customerName } : null;
  }
  if (source === 'parasut') {
    const c = state.parasutCustomers.find(x => String(x.parasutContactId) === id);
    return c ? {
      source: 'parasut',
      parasutContactId: c.parasutContactId,
      customerName: c.customerName,
      taxId: c.taxId,
      deliveryAddress: c.deliveryAddress,
      phones: c.phones,
      emails: c.emails
    } : null;
  }
  return null;
}

document.getElementById('order-customer').addEventListener('change', (e) => {
  document.getElementById('new-customer-box').classList.toggle('hidden', e.target.value !== '__new__');
});

document.getElementById('order-model').addEventListener('change', (e) => {
  document.getElementById('new-product-box').classList.toggle('hidden', e.target.value !== '__new__');
});

document.getElementById('save-new-product-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('order-error');
  errorEl.textContent = '';
  const name = val('np-name');
  if (!name) { errorEl.textContent = 'Ürün adı boş olamaz.'; return; }
  try {
    const saved = await apiCall('createProduct', { name });
    state.models.push(saved);
    fillModelSelect();
    const sel = document.getElementById('order-model');
    sel.value = saved.id;
    document.getElementById('new-product-box').classList.add('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('save-new-customer-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('order-error');
  errorEl.textContent = '';
  const customer = {
    customerName: val('nc-customerName'),
    taxPlateName: val('nc-taxPlateName'),
    taxId: val('nc-taxId'),
    deliveryAddress: val('nc-deliveryAddress'),
    paymentResponsible: val('nc-paymentResponsible'),
    warehouseResponsible: val('nc-warehouseResponsible'),
    approverNames: val('nc-approverNames'),
    phones: val('nc-phones'),
    emails: val('nc-emails')
  };
  try {
    const saved = await apiCall('saveCustomer', customer);
    state.myCustomers.push(saved);
    fillCustomerSelect();
    document.getElementById('order-customer').value = 'local:' + saved.id;
    document.getElementById('new-customer-box').classList.add('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('order-error');
  const okEl = document.getElementById('order-success');
  errorEl.textContent = ''; okEl.textContent = '';

  const customerValue = document.getElementById('order-customer').value;
  const modelSel = document.getElementById('order-model');
  const modelId = modelSel.value;
  const modelName = modelSel.selectedOptions[0] ? modelSel.selectedOptions[0].dataset.name : '';

  const selectedCustomer = resolveSelectedCustomer(customerValue);
  if (!selectedCustomer) {
    errorEl.textContent = 'Lütfen bir müşteri seçin (veya önce yeni müşteri kaydedin).';
    return;
  }
  if (!modelId || modelId === '__new__') {
    errorEl.textContent = 'Lütfen bir model seçin (veya önce yeni ürün kaydedin).';
    return;
  }

  try {
    await apiCall('createOrder', {
      customerSource: selectedCustomer.source,
      customerId: selectedCustomer.customerId,           // source: local ise
      parasutContactId: selectedCustomer.parasutContactId, // source: parasut ise
      customerName: selectedCustomer.customerName,
      taxId: selectedCustomer.taxId,
      deliveryAddress: selectedCustomer.deliveryAddress,
      phones: selectedCustomer.phones,
      emails: selectedCustomer.emails,
      modelId, modelName,
      quantity: val('order-quantity'),
      deliveryDate: val('order-deliveryDate'),
      paymentMethod: val('order-paymentMethod'),
      paymentTiming: val('order-paymentTiming')
    });
    okEl.textContent = 'Sipariş oluşturuldu.';
    document.getElementById('order-form').reset();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Siparişlerim ----------
async function loadMyOrders() {
  const tbody = document.querySelector('#my-orders-table tbody');
  tbody.innerHTML = '<tr><td colspan="6">Yükleniyor...</td></tr>';
  try {
    const orders = await apiCall('listMyOrders', {});
    tbody.innerHTML = orders.map(orderRowHtml).join('') || '<tr><td colspan="6">Henüz sipariş yok.</td></tr>';
    tbody.querySelectorAll('button[data-order-id]').forEach(btn => {
      btn.addEventListener('click', () => showOrderDetail(btn.dataset.orderId, orders));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="error">${escapeHtml(err.message)}</td></tr>`;
  }
}

function orderRowHtml(o) {
  const label = o.status === 'approved' ? 'Onaylandı' : o.status === 'rejected' ? 'Onaylanmadı' : 'Bekliyor';
  return `<tr>
    <td>${escapeHtml(o.customerName)}</td>
    <td>${escapeHtml(o.modelName)}</td>
    <td>${escapeHtml(String(o.quantity))}</td>
    <td>${escapeHtml(o.deliveryDate)}</td>
    <td><button class="badge ${o.status}" data-order-id="${o.id}">${label}</button></td>
    <td>${new Date(o.createdAt).toLocaleString('tr-TR')}</td>
  </tr>`;
}

function showOrderDetail(orderId, orders) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  if (order.status === 'rejected') {
    alert('Onaylanmama sebebi:\n' + (order.rejectionReason || 'Belirtilmemiş'));
  } else if (order.status === 'approved') {
    alert('Bu sipariş onaylandı.');
  } else {
    alert('Bu sipariş admin onayı bekliyor.');
  }
}

// ---------- Müşterilerim ----------
async function loadMyCustomers() {
  const tbody = document.querySelector('#my-customers-table tbody');
  tbody.innerHTML = '<tr><td colspan="4">Yükleniyor...</td></tr>';
  try {
    const customers = await apiCall('listMyCustomers', {});
    state.myCustomers = customers;
    tbody.innerHTML = customers.map(c => `<tr>
        <td>${escapeHtml(c.customerName)}</td>
        <td>${escapeHtml(c.taxId)}</td>
        <td>${escapeHtml(c.deliveryAddress || '')}</td>
        <td>${escapeHtml(c.phones || '')}</td>
      </tr>`).join('') || '<tr><td colspan="4">Henüz müşteri yok.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="error">${escapeHtml(err.message)}</td></tr>`;
  }
}

// ---------- Admin ----------
async function loadAdminOrders() {
  const tbody = document.querySelector('#admin-orders-table tbody');
  tbody.innerHTML = '<tr><td colspan="7">Yükleniyor...</td></tr>';
  try {
    const orders = await apiCall('adminListOrders', {});
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    document.getElementById('admin-pending-count').textContent = pendingCount
      ? `${pendingCount} sipariş onay bekliyor`
      : 'Onay bekleyen sipariş yok';

    tbody.innerHTML = orders.map(o => `<tr>
        <td>${escapeHtml(o.ownerUsername)}</td>
        <td>${escapeHtml(o.customerName)}</td>
        <td>${escapeHtml(o.modelName)}</td>
        <td>${escapeHtml(String(o.quantity))}</td>
        <td>${escapeHtml(o.deliveryDate)}</td>
        <td>${o.status === 'pending'
          ? `<button class="primary" data-approve="${o.id}">Onayla</button>
             <button class="link" data-reject="${o.id}">Reddet</button>`
          : `<span class="badge ${o.status}">${o.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}</span>`}
        </td>
        <td>${new Date(o.createdAt).toLocaleString('tr-TR')}</td>
      </tr>`).join('') || '<tr><td colspan="7">Henüz sipariş yok.</td></tr>';

    tbody.querySelectorAll('button[data-approve]').forEach(btn => {
      btn.addEventListener('click', () => decideOrder(btn.dataset.approve, 'approved'));
    });
    tbody.querySelectorAll('button[data-reject]').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = prompt('Onaylanmama sebebini yazın:');
        if (reason !== null) decideOrder(btn.dataset.reject, 'rejected', reason);
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="error">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadAdminCustomers() {
  const tbody = document.querySelector('#admin-customers-table tbody');
  tbody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
  try {
    const customers = await apiCall('adminListCustomers', {});
    tbody.innerHTML = customers.map(c => `<tr>
        <td>${escapeHtml(c.ownerUsername)}</td>
        <td>${escapeHtml(c.customerName)}</td>
        <td>${escapeHtml(c.taxId)}</td>
        <td>${escapeHtml(c.deliveryAddress || '')}</td>
        <td>${escapeHtml(c.phones || '')}</td>
      </tr>`).join('') || '<tr><td colspan="5">Henüz müşteri yok.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="error">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function decideOrder(orderId, status, reason) {
  try {
    await apiCall('adminSetOrderStatus', { orderId, status, reason });
    loadAdminOrders();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Yardımcılar ----------
function val(id) { return document.getElementById(id).value.trim(); }

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Başlangıç ----------
renderHeader();
showView(state.token ? (state.role === 'admin' ? 'admin' : 'new-order') : 'login');
