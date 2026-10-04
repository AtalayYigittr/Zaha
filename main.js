// ---------- Görünüm yönetimi ----------
const VIEWS = ['login', 'new-order', 'my-orders', 'my-customers', 'admin', 'admin-customers', 'admin-products', 'admin-plans', 'admin-users'];
const LOADERS = {
  'new-order': loadNewOrderView, 'my-orders': loadMyOrders, 'my-customers': loadMyCustomers,
  'admin': loadAdminOrders, 'admin-customers': loadAdminCustomers, 'admin-products': loadAdminProducts,
  'admin-plans': loadAdminPlans, 'admin-users': loadAdminUsers
};

function showView(name) {
  VIEWS.forEach(v => $('view-' + v).classList.toggle('hidden', v !== name));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('modal-root').innerHTML = '';
  if (LOADERS[name]) LOADERS[name]();
}

function renderHeader() {
  $('app-header').classList.toggle('hidden', !state.token);
  document.querySelectorAll('.admin-only').forEach(b => b.classList.toggle('hidden', state.role !== 'admin'));
  $('current-user').textContent = state.username ? `${state.username} (${state.role === 'admin' ? 'admin' : 'satıcı'})` : '';
}

document.querySelectorAll('nav button[data-view]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.view === 'new-order') orderForm.editingOrder = null; // revize modundan çık
  showView(b.dataset.view);
}));

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    const d = await apiCall('login', { username: val('login-username'), password: $('login-password').value });
    setSession(d); renderHeader();
    showView(state.role === 'admin' ? 'admin' : 'new-order');
  } catch (err) { $('login-error').textContent = err.message; }
});

$('logout-btn').addEventListener('click', async () => {
  try { await apiCall('logout', {}); } catch (e) { /* yoksay */ }
  clearSession(); renderHeader(); showView('login');
});

// ---------- Başlangıç ----------
$('nc-fields').innerHTML = customerFieldsHtml('nc');
$('mc-fields').innerHTML = customerFieldsHtml('mc');
bindOrderForm(); bindMyOrders(); bindMyCustomers();
bindAdminOrders(); bindAdminCustomers(); bindAdminProducts(); bindAdminPlans(); bindAdminUsers();
renderHeader();
showView(state.token ? (state.role === 'admin' ? 'admin' : 'new-order') : 'login');
