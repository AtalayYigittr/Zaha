// API_URL, config.js içinde tanımlıdır.

const VAT_RATE = 0.20; // Tüm ürünlerde %20 KDV (backend ile aynı)

const state = {
  token: localStorage.getItem('token') || '',
  username: localStorage.getItem('username') || '',
  role: localStorage.getItem('role') || '',
  products: [],
  plans: [],
  myCustomers: []
};

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
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function num(v) { const n = Number(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
function money(n) {
  return (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('tr-TR') : ''; }
function fmtDateTime(iso) { return iso ? new Date(iso).toLocaleString('tr-TR') : ''; }
function fmtDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s).split('-').reverse().join('.') : (s || ''); }
function today() { return new Date().toISOString().slice(0, 10); }

const STATUS_LABEL = { approved: 'Onaylandı', pending: 'Bekliyor', rejected: 'Onaylanmadı' };
const CUSTOMER_STATUS_LABEL = { approved: 'Onaylı', pending: 'Onay bekliyor', rejected: 'Reddedildi' };
const PLAN_TYPE_LABEL = { cash: 'Nakit', card: 'Kredi Kartı', term: 'Vadeli / Diğer' };

function orderNo(o) { return o.orderNo || ('#' + String(o.id).slice(0, 6)); }
function itemsSummary(o) {
  const items = o.items || [];
  if (!items.length) return '-';
  return esc(items[0].productName) + (items.length > 1 ? ` +${items.length - 1} ürün` : '');
}

/**
 * Sipariş satırı hesabı — backend (Orders.gs computeOrderParts_) ile BİREBİR aynı kural:
 *   etkin fiyat = fiyat * (1 - indirim%)
 *   net fiyat   = etkin fiyat * (1 - ödeme masrafı%)
 *   net fiyat >= minimum fiyat olmalı (yuvarlanmış 2 hane ile karşılaştırılır)
 *   koli bölünür = adet % koli adeti != 0
 */
function calcLine({ qty, price, discount, cost, minPrice, caseQty }) {
  const effective = round2(price * (1 - discount / 100));
  const net = effective * (1 - cost / 100);
  return {
    effective,
    net: round2(net),
    lineTotal: round2(qty * effective),
    belowMin: price > 0 && round2(net) < round2(minPrice),
    caseSplit: qty > 0 && caseQty > 1 && qty % caseQty !== 0
  };
}
function orderTotals(subtotal) {
  const s = round2(subtotal), vat = round2(s * VAT_RATE);
  return { subtotal: s, vat, total: round2(s + vat) };
}

// ---------- Müşteri formu alanları (satıcı + yeni sipariş içi form ortak) ----------
const CUSTOMER_GROUPS = [
  { title: 'Firma Bilgileri', fields: [
    ['customerName', 'Müşteri Adı', 'input', true],
    ['taxPlateName', 'Vergi Levhasındaki Ad', 'input', false],
    ['taxId', 'Vergi Kimlik No', 'input', true],
    ['address', 'Müşteri Adresi', 'textarea', true],
    ['deliveryAddress', 'Teslimat Adresi', 'textarea', true]] },
  { title: 'Ödeme Sorumlusu', fields: [
    ['paymentResponsible', 'Ad Soyad', 'input', true],
    ['paymentResponsiblePhone', 'Telefon', 'tel', true],
    ['paymentResponsibleEmail', 'E-posta', 'email', true]] },
  { title: 'Depo Sorumlusu', fields: [
    ['warehouseResponsible', 'Ad Soyad', 'input', true],
    ['warehouseResponsiblePhone', 'Telefon', 'tel', true],
    ['warehouseResponsibleEmail', 'E-posta', 'email', true]] },
  { title: 'Siparişi Onaylayan', fields: [
    ['approverNames', 'Ad Soyad', 'input', true],
    ['approverPhone', 'Telefon', 'tel', true],
    ['approverEmail', 'E-posta', 'email', true]] }
];
const CUSTOMER_FIELD_DEFS = CUSTOMER_GROUPS.flatMap(g => g.fields.map(f => ({ key: f[0], label: g.title === 'Firma Bilgileri' ? f[1] : `${g.title} ${f[1]}`, required: f[3] })));

function customerFieldsHtml(prefix) {
  return CUSTOMER_GROUPS.map(g => `<h4 class="grp">${g.title}</h4><div class="grid2">` + g.fields.map(([key, label, type, req]) => {
    const wide = type === 'textarea' ? ' class="span2"' : '';
    const input = type === 'textarea'
      ? `<textarea id="${prefix}-${key}" rows="2"></textarea>`
      : `<input id="${prefix}-${key}" type="${type === 'input' ? 'text' : type}" />`;
    return `<div${wide}><label>${label}${req ? ' *' : ''}</label>${input}</div>`;
  }).join('') + '</div>').join('');
}
function readCustomerFields(prefix) {
  const c = {};
  CUSTOMER_FIELD_DEFS.forEach(f => { c[f.key] = val(`${prefix}-${f.key}`); });
  return c;
}
function fillCustomerFields(prefix, c) {
  CUSTOMER_FIELD_DEFS.forEach(f => { $(`${prefix}-${f.key}`).value = (c && c[f.key]) || ''; });
}
/** Eksik zorunlu alan etiketlerini döner (boşsa form geçerli). */
function missingCustomerFields(c) {
  return CUSTOMER_FIELD_DEFS.filter(f => f.required && !String(c[f.key] || '').trim()).map(f => f.label);
}

function statusBadge(status) {
  return `<span class="badge ${status}">${CUSTOMER_STATUS_LABEL[status] || status}</span>`;
}
function warnBadges(o) {
  const b = [];
  if (o.flagBelowMin) b.push('<span class="chip red">Min. fiyat altı</span>');
  if (o.flagLimit) b.push('<span class="chip red">Limit aşımı</span>');
  if (o.flagCase) b.push('<span class="chip amber">Koli bölünüyor</span>');
  if (o.flagCustomer) b.push('<span class="chip amber">Müşteri onaysız</span>');
  return b.join(' ');
}
