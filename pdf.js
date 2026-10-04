/**
 * pdf.js — Sipariş PDF'leri (pdfmake). Tarayıcıda tamamen istemci tarafında üretilir.
 * Satıcı PDF'i müşteriyle paylaşılabilir: minimum fiyat / iç uyarılar YOKTUR.
 * Admin PDF'i detaylıdır: minimum fiyat, masraf sonrası net fiyat, uyarılar, ret sebebi içerir.
 * (PDF'te "₺" yerine "TL" kullanılır; gömülü Roboto yazı tipinde ₺ glifi yoktur.)
 */
(function (root) {
  const STATUS = { approved: 'Onaylandı', pending: 'Onay bekliyor', rejected: 'Onaylanmadı' };
  const RED = '#c5221f', GREY = '#5f6368', LIGHT_RED = '#fde8e8';

  const tl = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  const dt = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '-');
  const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s).split('-').reverse().join('.') : (s || '-'));
  const no = (o) => o.orderNo || ('#' + String(o.id).slice(0, 6));

  function warningTexts(o) {
    const w = [];
    if (o.flagCustomer) w.push('Müşteri henüz onaylı değil.');
    if (o.flagLimit) w.push(`Limit aşımı: sipariş ${tl(o.total)} (KDV dahil), müşteri limiti ${tl(o.limitAtOrder)}.`);
    (o.items || []).forEach(it => {
      if (it.belowMin) w.push(`Minimum fiyat altı: ${it.productName} — net ${tl(it.netPrice)} < minimum ${tl(it.minPrice)}.`);
      if (it.caseSplit) w.push(`Koli bölünüyor: ${it.productName} — ${it.quantity} adet, koli adeti ${it.caseQty}.`);
    });
    return w;
  }

  function infoRow(label, value) {
    return [{ text: label, color: GREY, fontSize: 9 }, { text: String(value == null || value === '' ? '-' : value), fontSize: 9 }];
  }

  function orderBlock(o, admin, first) {
    const head = (cells) => cells.map(c => ({ text: c, bold: true, fontSize: 8, fillColor: '#eeeeee' }));
    const header = ['Kod', 'Ürün', 'Adet', 'Birim Fiyat', 'İnd. %', 'Satış Fiyatı'];
    const widths = [48, '*', 28, 52, 28, 54];
    if (admin) { header.push('Min. Fiyat', 'Masraf Sonrası'); widths.push(48, 54); }
    header.push('Tutar'); widths.push(58);

    const rows = (o.items || []).map(it => {
      const red = admin && it.belowMin;
      const cell = (t, extra) => Object.assign({ text: String(t), fontSize: 8, fillColor: red ? LIGHT_RED : undefined }, extra || {});
      const r = [cell(it.productCode), cell(it.productName + (admin && it.caseSplit ? `\n(koli bölünüyor — koli adeti: ${it.caseQty})` : '')),
        cell(it.quantity, { alignment: 'right' }), cell(tl(it.unitPrice), { alignment: 'right' }),
        cell(it.discountPercent > 0 ? it.discountPercent : '-', { alignment: 'right' }), cell(tl(it.effectivePrice), { alignment: 'right' })];
      if (admin) r.push(cell(tl(it.minPrice), { alignment: 'right' }), cell(tl(it.netPrice), { alignment: 'right', color: red ? RED : undefined, bold: red }));
      r.push(cell(tl(it.lineTotal), { alignment: 'right' }));
      return r;
    });

    const info = [
      infoRow('Müşteri', o.customerName),
      ...(admin ? [infoRow('Satıcı', o.ownerUsername)] : []),
      infoRow('Sipariş tarihi', dt(o.createdAt)),
      infoRow('Ödeme planı', o.paymentPlan + (admin && o.costPercent ? ` (masraf %${String(o.costPercent).replace('.', ',')})` : '')),
      infoRow('Teslimat tarihi', day(o.deliveryDate)),
      infoRow('Sevk', o.shippedAt ? 'Sevk edildi — ' + dt(o.shippedAt) : (o.status === 'approved' ? 'Henüz sevk edilmedi' : '-'))
    ];

    const block = [
      { columns: [
        { text: `Sipariş ${no(o)}`, fontSize: 14, bold: true },
        { text: STATUS[o.status] || o.status, alignment: 'right', fontSize: 11, bold: true, color: o.status === 'rejected' ? RED : (o.status === 'approved' ? '#1e8e3e' : '#b06000') }
      ], margin: [0, 0, 0, 6], pageBreak: first ? undefined : 'before' },
      { table: { widths: [85, '*'], body: info }, layout: 'noBorders', margin: [0, 0, 0, 8] },
      { table: { headerRows: 1, widths, body: [head(header), ...rows] }, layout: 'lightHorizontalLines' },
      { table: { widths: ['*', 130, 90], body: [
        [{ text: '', border: [false, false, false, false] }, { text: 'Ara Toplam (KDV hariç)', fontSize: 9, alignment: 'right' }, { text: tl(o.subtotal), fontSize: 9, alignment: 'right' }],
        [{ text: '' }, { text: 'KDV (%20)', fontSize: 9, alignment: 'right' }, { text: tl(o.vatTotal), fontSize: 9, alignment: 'right' }],
        [{ text: '' }, { text: 'Genel Toplam (KDV dahil)', fontSize: 10, bold: true, alignment: 'right' }, { text: tl(o.total), fontSize: 10, bold: true, alignment: 'right' }]
      ] }, layout: 'noBorders', margin: [0, 8, 0, 0] }
    ];
    if (o.note) block.push({ text: 'Not: ' + o.note, fontSize: 9, margin: [0, 8, 0, 0] });
    if (admin) {
      const w = warningTexts(o);
      if (w.length) block.push({ margin: [0, 10, 0, 0], stack: [{ text: 'DİKKAT', bold: true, color: RED, fontSize: 9 }, { ul: w, fontSize: 9, color: RED }] });
      if (o.status === 'rejected' && o.rejectionReason) block.push({ text: 'Onaylanmama sebebi: ' + o.rejectionReason, fontSize: 9, margin: [0, 6, 0, 0] });
    }
    return block;
  }

  /** orders: sipariş dizisi (items dahil). opts: {admin, title, subtitle} */
  function buildOrdersPdf(orders, opts) {
    opts = opts || {};
    const admin = !!opts.admin;
    const content = [];
    content.push({ text: opts.title || 'Sipariş Raporu', fontSize: 18, bold: true });
    content.push({ text: [opts.subtitle || '', (opts.subtitle ? ' · ' : '') + 'Oluşturulma: ' + new Date().toLocaleString('tr-TR')].join(''), fontSize: 9, color: GREY, margin: [0, 2, 0, 10] });

    let firstOrder = true;
    if (orders.length > 1) {
      const sumHead = ['Sipariş No', 'Tarih', 'Müşteri'].concat(admin ? ['Satıcı'] : [], ['Durum', 'Ara Toplam', 'KDV Dahil']);
      const widths = [50, 48, '*'].concat(admin ? [55] : [], [58, 66, 66]);
      const body = [sumHead.map(h => ({ text: h, bold: true, fontSize: 8, fillColor: '#eeeeee' }))];
      let sub = 0, tot = 0;
      orders.forEach(o => {
        sub += Number(o.subtotal) || 0; tot += Number(o.total) || 0;
        const row = [no(o), dt(o.createdAt), o.customerName].concat(admin ? [o.ownerUsername] : [], [STATUS[o.status] || o.status]);
        body.push(row.map(t => ({ text: String(t), fontSize: 8 })).concat([
          { text: tl(o.subtotal), fontSize: 8, alignment: 'right' }, { text: tl(o.total), fontSize: 8, alignment: 'right' }]));
      });
      const span = sumHead.length - 2;
      body.push([{ text: `Toplam (${orders.length} sipariş)`, bold: true, fontSize: 8, colSpan: span, alignment: 'right' }].concat(Array(span - 1).fill({})).concat([
        { text: tl(sub), bold: true, fontSize: 8, alignment: 'right' }, { text: tl(tot), bold: true, fontSize: 8, alignment: 'right' }]));
      content.push({ table: { headerRows: 1, widths, body }, layout: 'lightHorizontalLines' });
    }
    orders.forEach(o => {
      orderBlock(o, admin, firstOrder && orders.length === 1).forEach(n => content.push(n));
      firstOrder = false;
    });

    return {
      pageSize: 'A4', pageOrientation: admin ? 'landscape' : 'portrait', pageMargins: [36, 36, 36, 40], content,
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      footer: (cur, total) => ({ text: `Sayfa ${cur} / ${total}`, alignment: 'center', fontSize: 8, color: GREY, margin: [0, 12, 0, 0] })
    };
  }

  function downloadOrdersPdf(orders, opts) {
    const name = (opts && opts.filename) || ('siparisler-' + new Date().toISOString().slice(0, 10) + '.pdf');
    root.pdfMake.createPdf(buildOrdersPdf(orders, opts)).download(name);
  }

  const api = { buildOrdersPdf, downloadOrdersPdf, warningTexts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OrderPdf = api;
})(typeof window !== 'undefined' ? window : globalThis);
