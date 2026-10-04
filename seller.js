// ============ SATICI: Yeni sipariş / revize ============
const orderForm = { editingOrder: null, toggledDiscount: new WeakSet() };

function productById(id) { return state.products.find(p => p.id === id); }
function selectedCustomer() { return state.myCustomers.find(c => c.id === $('order-customer').value); }
function selectedPlan() { return state.plans.find(p => p.name === $('order-paymentPlan').value); }

async function loadNewOrderView() {
  $('order-error').textContent = ''; $('order-success').textContent = '';
  const errors = [];
  try { state.myCustomers = await apiCall('listMyCustomers'); } catch (e) { errors.push('Müşteriler: ' + e.message); }
  try { state.products = await apiCall('listProducts'); } catch (e) { errors.push('Ürünler: ' + e.message); }
  try { state.plans = await apiCall('listPaymentPlans'); } catch (e) { errors.push('Ödeme planları: ' + e.message); }

  const editing = orderForm.editingOrder;
  fillCustomerSelect(editing ? editing.customerId : undefined);
  $('order-customer').disabled = !!editing;
  fillPlanSelect(editing ? editing.paymentPlan : undefined);
  $('order-items').innerHTML = '';
  if (editing) {
    editing.items.forEach(it => addItemRow(it));
    $('order-deliveryDate').value = editing.deliveryDate || '';
    $('order-note').value = editing.note || '';
  } else {
    addItemRow();
    $('order-deliveryDate').value = '';
    $('order-note').value = '';
  }
  $('order-title').textContent = editing ? `Siparişi Revize Et — ${orderNo(editing)}` : 'Yeni Sipariş';
  $('revise-banner').classList.toggle('hidden', !editing);
  if (editing) $('revise-banner').innerHTML = `<strong>Onaylanmama sebebi:</strong> ${esc(editing.rejectionReason || 'Belirtilmemiş')}<br>İçeriği düzeltip tekrar onaya gönderebilirsiniz.`;
  $('revise-cancel-btn').classList.toggle('hidden', !editing);
  $('order-submit-btn').textContent = editing ? 'Revize Et ve Tekrar Onaya Gönder' : 'Siparişi Gönder';
  $('new-customer-box').classList.add('hidden');

  if (!state.products.length) errors.push('Henüz sisteme ürün eklenmemiş (admin eklemeli).');
  if (!state.plans.length) errors.push('Henüz ödeme planı tanımlanmamış (admin eklemeli).');
  $('order-error').textContent = errors.join(' | ');
  onCustomerChange();
}

function fillCustomerSelect(selectId) {
  $('order-customer').innerHTML = '<option value="">Müşteri seçin...</option>' +
    state.myCustomers.map(c => `<option value="${c.id}">${esc(c.customerName)} — ${CUSTOMER_STATUS_LABEL[c.approvalStatus]}</option>`).join('') +
    '<option value="__new__">+ Yeni müşteri ekle</option>';
  if (selectId) $('order-customer').value = selectId;
}

/** Ödeme planı listesi müşteri durumuna göre süzülür: onaysız müşteride sadece Nakit + Kredi Kartı. */
function fillPlanSelect(selectName) {
  const cust = selectedCustomer();
  const restricted = cust && cust.approvalStatus !== 'approved';
  const plans = state.plans.filter(p => !restricted || p.type === 'cash' || p.type === 'card');
  const keep = selectName !== undefined ? selectName : $('order-paymentPlan').value;
  $('order-paymentPlan').innerHTML = '<option value="">Plan seçin...</option>' + plans.map(p =>
    `<option value="${esc(p.name)}">${esc(p.name)}${p.costPercent ? ` (masraf %${p.costPercent})` : ''}</option>`).join('');
  if (plans.some(p => p.name === keep)) $('order-paymentPlan').value = keep;
}

function onCustomerChange() {
  const v = $('order-customer').value;
  $('new-customer-box').classList.toggle('hidden', v !== '__new__');
  const cust = selectedCustomer();
  const info = $('customer-info');
  info.className = 'notice hidden';
  if (cust) {
    if (cust.approvalStatus === 'pending') {
      info.className = 'notice warn';
      info.innerHTML = 'Bu müşteri henüz <strong>yönetici onayında</strong>. Onaylanana kadar yalnızca <strong>Nakit</strong> ve <strong>Kredi Kartı</strong> ödeme planlarıyla sipariş verebilirsiniz.';
    } else if (cust.approvalStatus === 'rejected') {
      info.className = 'notice err';
      info.innerHTML = `Bu müşteri <strong>onaylanmadı</strong>: ${esc(cust.approvalNote || '')}<br>Müşteriler sayfasından düzenleyip tekrar onaya gönderin.`;
    } else if (cust.orderLimit !== '' && cust.orderLimit != null) {
      info.className = 'notice';
      info.innerHTML = `Sipariş limiti (KDV dahil): <strong>${money(cust.orderLimit)}</strong>`;
    }
  }
  fillPlanSelect();
  refreshAll();
}

function addItemRow(existing) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.innerHTML =
    `<div class="item-row">` +
    `<select class="it-product"><option value="">Ürün seçin...</option>` +
    state.products.map(p => `<option value="${p.id}" title="${esc(p.description)}">${esc(p.name)} (${esc(p.code)})</option>`).join('') +
    `</select>` +
    `<input class="it-qty" type="number" min="1" step="1" placeholder="Adet" />` +
    `<input class="it-price" type="number" min="0" step="0.01" placeholder="Birim fiyat (KDV hariç)" />` +
    `<span class="it-total">0,00 ₺</span>` +
    `<button type="button" class="link it-remove">Sil</button></div>` +
    `<div class="item-info"></div>` +
    `<div class="item-discount hidden"><label>Özel indirim (%)</label>` +
    `<input class="it-disc" type="number" min="0" max="99.99" step="0.01" placeholder="0" />` +
    `<span class="hint">Satış fiyatı = fiyat × (1 − indirim %)</span></div>` +
    `<button type="button" class="link it-disc-toggle">Özel indirim tanımla</button>`;
  card.querySelectorAll('input,select').forEach(i => i.addEventListener('input', refreshAll));
  card.querySelector('.it-product').addEventListener('change', refreshAll);
  card.querySelector('.it-remove').addEventListener('click', () => {
    if ($('order-items').children.length > 1) { card.remove(); refreshAll(); }
  });
  card.querySelector('.it-disc-toggle').addEventListener('click', () => {
    orderForm.toggledDiscount.add(card);
    refreshAll();
    card.querySelector('.it-disc').focus();
  });
  $('order-items').appendChild(card);
  if (existing) {
    card.querySelector('.it-product').value = existing.productId;
    card.querySelector('.it-qty').value = existing.quantity;
    card.querySelector('.it-price').value = existing.unitPrice;
    if (existing.discountPercent > 0) card.querySelector('.it-disc').value = existing.discountPercent;
  }
  refreshAll();
}

/** Satırdaki değerleri okuyup hesaplar. */
function readItem(card) {
  const product = productById(card.querySelector('.it-product').value);
  const qty = num(card.querySelector('.it-qty').value);
  const price = num(card.querySelector('.it-price').value);
  const discount = num(card.querySelector('.it-disc').value);
  const plan = selectedPlan();
  const calc = product ? calcLine({
    qty, price, discount, cost: plan ? plan.costPercent : 0,
    minPrice: product.minPrice === '' ? 0 : product.minPrice, caseQty: product.caseQty === '' ? 1 : product.caseQty
  }) : null;
  return { product, qty, price, discount, plan, calc };
}

function refreshAll() {
  let subtotal = 0;
  document.querySelectorAll('#order-items .item-card').forEach(card => {
    const { product, qty, price, discount, plan, calc } = readItem(card);
    const info = card.querySelector('.item-info');
    const discBox = card.querySelector('.item-discount');
    const toggle = card.querySelector('.it-disc-toggle');
    if (!product) {
      info.innerHTML = '';
      card.querySelector('.it-total').textContent = money(0);
      discBox.classList.add('hidden'); toggle.classList.add('hidden');
      return;
    }
    const caseQty = product.caseQty === '' ? 1 : product.caseQty;
    const parts = [`Koli adeti: <strong>${caseQty}</strong>`, `Min. fiyat: <strong>${money(product.minPrice || 0)}</strong>`];
    if (product.description) parts.push(`<span class="hint">${esc(product.description)}</span>`);
    let html = `<div>${parts.join(' · ')}</div>`;
    if (price > 0) {
      if (discount > 0) html += `<div>İndirimli satış fiyatı: <strong>${money(calc.effective)}</strong></div>`;
      html += `<div>Net fiyat (${plan ? `${esc(plan.name)}, masraf %${plan.costPercent}` : 'ödeme planı seçilmedi'}): <strong>${money(calc.net)}</strong> ` +
        (calc.belowMin ? '<span class="chip red">⚠ Minimum fiyatın ALTINDA</span>' : '<span class="chip green">✓ Minimum fiyatın üzerinde</span>') + '</div>';
    }
    if (calc.caseSplit) {
      html += `<div><span class="chip amber">⚠ Koli bölünecek</span> ${qty} adet ÷ ${caseQty} = ${(qty / caseQty).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} koli</div>`;
    }
    info.innerHTML = html;
    // Özel indirim bölümü: min fiyat altı uyarısında (veya indirim girilmişse / kullanıcı açtıysa) görünür
    const showDisc = calc.belowMin || discount > 0 || orderForm.toggledDiscount.has(card);
    discBox.classList.toggle('hidden', !showDisc);
    toggle.classList.toggle('hidden', showDisc);
    card.querySelector('.it-total').textContent = money(calc.lineTotal);
    subtotal += calc.lineTotal;
  });
  const t = orderTotals(subtotal);
  $('order-subtotal').textContent = money(t.subtotal);
  $('order-vat').textContent = money(t.vat);
  $('order-total').textContent = money(t.total);

  const warnings = collectOrderWarnings();
  const box = $('order-warnings');
  box.classList.toggle('hidden', warnings.length === 0);
  box.innerHTML = warnings.length ? '<strong>Uyarılar</strong><ul>' + warnings.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>' : '';
}

/** Gönderim öncesi kullanıcıya gösterilen uyarılar (engellemez, onayla gönderilir). */
function collectOrderWarnings() {
  const w = [];
  const cust = selectedCustomer();
  let subtotal = 0;
  document.querySelectorAll('#order-items .item-card').forEach(card => {
    const { product, qty, price, calc } = readItem(card);
    if (!product || !calc) return;
    subtotal += calc.lineTotal;
    if (price > 0 && calc.belowMin) w.push(`${product.name}: net fiyat ${money(calc.net)}, minimum fiyat ${money(product.minPrice)} altında.`);
    if (calc.caseSplit) w.push(`${product.name}: ${qty} adet koli adeti (${product.caseQty}) ile tam bölünmüyor, koli bölünecek.`);
  });
  const total = orderTotals(subtotal).total;
  if (cust && cust.approvalStatus === 'approved' && cust.orderLimit !== '' && cust.orderLimit != null && total > cust.orderLimit) {
    w.unshift(`LİMİT AŞIMI: sipariş tutarı ${money(total)} (KDV dahil), müşteri limiti ${money(cust.orderLimit)}.`);
  }
  return w;
}

function bindOrderForm() {
  $('order-customer').addEventListener('change', onCustomerChange);
  $('order-paymentPlan').addEventListener('change', refreshAll);
  $('add-item-btn').addEventListener('click', () => addItemRow());

  $('save-new-customer-btn').addEventListener('click', async () => {
    $('order-error').textContent = '';
    const c = readCustomerFields('nc');
    const missing = missingCustomerFields(c);
    if (missing.length) { $('order-error').textContent = 'Zorunlu alanlar eksik: ' + missing.join(', '); return; }
    try {
      const saved = await apiCall('saveCustomer', c);
      state.myCustomers.push(saved);
      fillCustomerSelect(saved.id);
      fillCustomerFields('nc', null);
      onCustomerChange();
      $('order-success').textContent = 'Müşteri kaydedildi ve yönetici onayına gönderildi.';
    } catch (err) { $('order-error').textContent = err.message; }
  });

  $('revise-cancel-btn').addEventListener('click', () => { orderForm.editingOrder = null; showView('my-orders'); });

  $('order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('order-error'), okEl = $('order-success');
    errorEl.textContent = ''; okEl.textContent = '';
    const editing = orderForm.editingOrder;
    const customerId = editing ? editing.customerId : $('order-customer').value;
    const cust = state.myCustomers.find(c => c.id === customerId);
    if (!cust) { errorEl.textContent = 'Lütfen bir müşteri seçin (veya önce yeni müşteri kaydedin).'; return; }
    if (cust.approvalStatus === 'rejected') { errorEl.textContent = 'Bu müşteri onaylanmadı; önce müşteriyi düzenleyip tekrar onaya gönderin.'; return; }
    if (!$('order-paymentPlan').value) { errorEl.textContent = 'Lütfen bir ödeme planı seçin.'; return; }

    const items = [];
    for (const card of document.querySelectorAll('#order-items .item-card')) {
      const productId = card.querySelector('.it-product').value;
      const quantity = card.querySelector('.it-qty').value;
      const unitPrice = card.querySelector('.it-price').value;
      if (!productId && !quantity && !unitPrice) continue;
      if (!productId || !(num(quantity) >= 1) || !(num(unitPrice) > 0)) { errorEl.textContent = 'Her ürün satırında ürün, adet ve fiyat dolu olmalı.'; return; }
      if (!Number.isInteger(num(quantity))) { errorEl.textContent = 'Adet tam sayı olmalı.'; return; }
      items.push({ productId, quantity, unitPrice, discountPercent: card.querySelector('.it-disc').value });
    }
    if (!items.length) { errorEl.textContent = 'En az bir ürün satırı girin.'; return; }

    const warnings = collectOrderWarnings();
    if (warnings.length && !confirm('Bu siparişte uyarılar var:\n\n• ' + warnings.join('\n• ') + '\n\nYine de yönetici onayına göndermek istiyor musunuz?')) return;

    try {
      const payload = { items, paymentPlan: $('order-paymentPlan').value, deliveryDate: $('order-deliveryDate').value, note: val('order-note') };
      if (editing) {
        await apiCall('reviseOrder', Object.assign({ orderId: editing.id }, payload));
        orderForm.editingOrder = null;
        showView('my-orders');
        return;
      }
      await apiCall('createOrder', Object.assign({ customerId }, payload));
      okEl.textContent = 'Sipariş oluşturuldu ve yönetici onayına gönderildi.';
      $('order-items').innerHTML = ''; addItemRow();
      $('order-deliveryDate').value = ''; $('order-note').value = '';
      refreshAll();
    } catch (err) { errorEl.textContent = err.message; }
  });
}

// ============ SATICI: Siparişlerim ============
const myOrdersState = { orders: [], selected: new Set() };

async function loadMyOrders() {
  const tbody = document.querySelector('#my-orders-table tbody');
  tbody.innerHTML = '<tr><td colspan="8">Yükleniyor...</td></tr>';
  try {
    myOrdersState.orders = await apiCall('listMyOrders');
    const names = [...new Set(myOrdersState.orders.map(o => o.customerName))].sort((a, b) => a.localeCompare(b, 'tr'));
    const cur = $('mo-customer').value;
    $('mo-customer').innerHTML = '<option value="">Tüm müşteriler</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (names.includes(cur)) $('mo-customer').value = cur;
    renderMyOrders();
  } catch (err) { tbody.innerHTML = `<tr><td colspan="8" class="error">${esc(err.message)}</td></tr>`; }
}

function visibleMyOrders() {
  const c = $('mo-customer').value;
  return myOrdersState.orders.filter(o => !c || o.customerName === c);
}

function shipCell(o) {
  if (o.shippedAt) return `<span class="chip green">Sevk edildi ${fmtDate(o.shippedAt)}</span>`;
  return o.status === 'approved' ? '<span class="hint">Sevk bekliyor</span>' : '-';
}

function renderMyOrders() {
  const list = visibleMyOrders();
  const tbody = document.querySelector('#my-orders-table tbody');
  tbody.innerHTML = list.map(o => `<tr>
      <td><input type="checkbox" data-sel="${o.id}" ${myOrdersState.selected.has(o.id) ? 'checked' : ''}></td>
      <td>${esc(orderNo(o))}</td><td>${esc(o.customerName)}</td><td>${itemsSummary(o)}</td>
      <td class="num">${money(o.total)}<br><span class="hint">KDV hariç ${money(o.subtotal)}</span></td>
      <td><button class="badge ${o.status}" data-id="${o.id}">${STATUS_LABEL[o.status]}</button></td>
      <td>${shipCell(o)}</td>
      <td>${fmtDate(o.createdAt)}</td></tr>`).join('') || '<tr><td colspan="8">Sipariş yok.</td></tr>';
  tbody.querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', () => showOrderModal(list.find(o => o.id === b.dataset.id), false)));
  tbody.querySelectorAll('input[data-sel]').forEach(cb => cb.addEventListener('change', () => {
    cb.checked ? myOrdersState.selected.add(cb.dataset.sel) : myOrdersState.selected.delete(cb.dataset.sel);
    updateMyPdfButton();
  }));
  $('mo-select-all').checked = list.length > 0 && list.every(o => myOrdersState.selected.has(o.id));
  updateMyPdfButton();
}

function updateMyPdfButton() {
  const n = myOrdersState.selected.size;
  $('mo-pdf-btn').textContent = n ? `Seçilenleri PDF indir (${n})` : 'Listelenenleri PDF indir';
}

function bindMyOrders() {
  $('mo-customer').addEventListener('change', renderMyOrders);
  $('mo-select-all').addEventListener('change', (e) => {
    visibleMyOrders().forEach(o => e.target.checked ? myOrdersState.selected.add(o.id) : myOrdersState.selected.delete(o.id));
    renderMyOrders();
  });
  $('mo-pdf-btn').addEventListener('click', () => {
    const chosen = myOrdersState.selected.size
      ? myOrdersState.orders.filter(o => myOrdersState.selected.has(o.id))
      : visibleMyOrders();
    if (!chosen.length) { alert('İndirilecek sipariş yok.'); return; }
    const cust = $('mo-customer').value;
    OrderPdf.downloadOrdersPdf(chosen.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), {
      admin: false, title: cust ? `${cust} — Siparişler` : 'Siparişlerim', subtitle: `Satıcı: ${state.username}`
    });
  });
}

// ---------- Sipariş detay penceresi (satıcı + admin) ----------
function itemRowHtml(it, admin) {
  const red = admin && it.belowMin;
  return `<tr class="${red ? 'row-red' : ''}">
    <td>${esc(it.productName)}<br><span class="hint">${esc(it.productCode)}</span>
      ${admin && it.caseSplit ? '<br><span class="chip amber">Koli bölünüyor (koli ' + esc(it.caseQty) + ')</span>' : ''}</td>
    <td class="num">${esc(it.quantity)}</td>
    <td class="num">${money(it.unitPrice)}${it.discountPercent > 0 ? `<br><span class="hint">−%${esc(it.discountPercent)} → ${money(it.effectivePrice)}</span>` : ''}</td>
    ${admin ? `<td class="num">${money(it.minPrice)}</td><td class="num ${red ? 'error' : ''}">${money(it.netPrice)}${red ? '<br><span class="chip red">Min. altı</span>' : ''}</td>` : ''}
    <td class="num">${money(it.lineTotal)}</td></tr>`;
}

function showOrderModal(o, admin) {
  const warns = admin ? OrderPdf.warningTexts(o) : [];
  $('modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal" style="width:760px;max-height:90vh;overflow:auto">
    <h3 style="margin-top:0">${esc(orderNo(o))} — ${esc(o.customerName)}</h3>
    ${admin ? `<div class="hint">Satıcı: <strong>${esc(o.ownerUsername)}</strong></div>` : ''}
    <div class="hint">Ödeme planı: ${esc(o.paymentPlan)}${admin && o.costPercent ? ` (masraf %${esc(o.costPercent)})` : ''} · Teslimat: ${fmtDay(o.deliveryDate)} · Oluşturma: ${fmtDateTime(o.createdAt)}${o.revision ? ` · Revizyon ${o.revision}` : ''}</div>
    ${warns.length ? `<div class="notice err" style="margin-top:10px"><strong>Dikkat</strong><ul>${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <table style="margin-top:10px"><thead><tr><th>Ürün</th><th class="num">Adet</th><th class="num">Birim fiyat (KDV hariç)</th>
      ${admin ? '<th class="num">Min. fiyat</th><th class="num">Masraf sonrası net</th>' : ''}<th class="num">Tutar (KDV hariç)</th></tr></thead>
      <tbody>${(o.items || []).map(it => itemRowHtml(it, admin)).join('')}</tbody></table>
    <div class="totals-box">
      <div>Ara toplam (KDV hariç): <strong>${money(o.subtotal)}</strong></div>
      <div>KDV (%20): <strong>${money(o.vatTotal)}</strong></div>
      <div class="grand">Genel toplam (KDV dahil): <strong>${money(o.total)}</strong></div></div>
    ${o.note ? `<p class="hint">Not: ${esc(o.note)}</p>` : ''}
    <p><span class="badge ${o.status}">${STATUS_LABEL[o.status]}</span> ${o.shippedAt ? `<span class="chip green">Sevk edildi: ${fmtDate(o.shippedAt)}</span>` : ''}</p>
    ${o.status === 'rejected' ? `<p class="error"><strong>Onaylanmama sebebi:</strong> ${esc(o.rejectionReason || 'Belirtilmemiş')}</p>` : ''}
    <div class="modal-actions">
      ${!admin && o.status === 'rejected' ? '<button class="primary" id="modal-revise">Revize et</button>' : ''}
      ${admin && o.status === 'pending' ? '<button class="primary" id="modal-approve">Onayla</button><button class="danger" id="modal-reject">Reddet</button>' : ''}
      <button class="secondary" id="modal-pdf">PDF</button>
      <button class="secondary" id="modal-close">Kapat</button></div></div></div>`;
  $('modal-close').addEventListener('click', () => { $('modal-root').innerHTML = ''; });
  $('modal-pdf').addEventListener('click', () => OrderPdf.downloadOrdersPdf([o], { admin, title: `Sipariş ${orderNo(o)}`, filename: `siparis-${orderNo(o)}.pdf` }));
  if ($('modal-revise')) $('modal-revise').addEventListener('click', () => {
    $('modal-root').innerHTML = '';
    orderForm.editingOrder = o;
    showView('new-order');
  });
  if ($('modal-approve')) {
    $('modal-approve').addEventListener('click', async () => { $('modal-root').innerHTML = ''; await decideOrder(o.id, 'approved'); });
    $('modal-reject').addEventListener('click', async () => {
      const reason = prompt('Onaylanmama sebebini yazın:');
      if (reason && reason.trim()) { $('modal-root').innerHTML = ''; await decideOrder(o.id, 'rejected', reason); }
    });
  }
}

// ============ SATICI: Müşterilerim ============
const customerFormState = { editingId: null };

async function loadMyCustomers() {
  resetCustomerForm();
  const tbody = document.querySelector('#my-customers-table tbody');
  tbody.innerHTML = '<tr><td colspan="6">Yükleniyor...</td></tr>';
  try {
    state.myCustomers = await apiCall('listMyCustomers');
    tbody.innerHTML = state.myCustomers.map(c => `<tr>
        <td>${esc(c.customerName)}</td><td>${esc(c.taxId)}</td>
        <td>${statusBadge(c.approvalStatus)}${c.approvalStatus === 'rejected' ? `<br><span class="error">${esc(c.approvalNote)}</span>` : ''}</td>
        <td class="num">${c.approvalStatus === 'approved' ? (c.orderLimit !== '' ? money(c.orderLimit) : 'Limitsiz') : '-'}</td>
        <td>${esc(c.deliveryAddress)}</td>
        <td><button class="link" data-edit="${c.id}">${c.approvalStatus === 'rejected' ? 'Düzenle ve tekrar gönder' : 'Düzenle'}</button></td></tr>`).join('')
      || '<tr><td colspan="6">Henüz müşteri yok.</td></tr>';
    tbody.querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', () => {
      const c = state.myCustomers.find(x => x.id === b.dataset.edit);
      customerFormState.editingId = c.id;
      fillCustomerFields('mc', c);
      $('mc-title').textContent = 'Müşteriyi Düzenle';
      $('mc-note').classList.toggle('hidden', c.approvalStatus !== 'approved');
      window.scrollTo(0, 0);
    }));
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="error">${esc(err.message)}</td></tr>`; }
}

function resetCustomerForm() {
  customerFormState.editingId = null;
  fillCustomerFields('mc', null);
  $('mc-title').textContent = 'Yeni Müşteri Ekle';
  $('mc-error').textContent = '';
  $('mc-note').classList.add('hidden');
}

function bindMyCustomers() {
  $('mc-cancel-btn').addEventListener('click', resetCustomerForm);
  $('mc-save-btn').addEventListener('click', async () => {
    $('mc-error').textContent = '';
    const payload = readCustomerFields('mc');
    const missing = missingCustomerFields(payload);
    if (missing.length) { $('mc-error').textContent = 'Zorunlu alanlar eksik: ' + missing.join(', '); return; }
    if (customerFormState.editingId) payload.id = customerFormState.editingId;
    try { await apiCall('saveCustomer', payload); loadMyCustomers(); }
    catch (err) { $('mc-error').textContent = err.message; }
  });
}
