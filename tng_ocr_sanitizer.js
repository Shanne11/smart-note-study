/* Sanitising helpers for participant review fields. Gemini OCR is handled by a server Worker.
 * Parsing is conservative. No missing transaction data is fabricated.
 * This module intentionally never returns raw OCR text or raw identifiers.
 */
(function (root, factory) {
  const parser = factory();
  if (typeof module === 'object' && module.exports) module.exports = parser;
  else root.TNGLocalParser = parser;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clean = (value) => String(value == null ? '' : value).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  const linesOf = (text) => String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
  const typeDefs = [
    {name:'Transfer to Wallet', re:/transfer\s+to\s+wallet/i},
    {name:'DuitNow Received', re:/duit\s*now\s+received/i},
    {name:'DuitNow Transfer', re:/duit\s*now\s+transfer/i},
    {name:'Cashback', re:/cash\s*back/i},
    {name:'Refund', re:/\brefund\b/i},
    {name:'Payment', re:/\bpayment\b/i},
  ];
  const labels = /^(?:payment\s*details|remarks?|merchant|transfer\s*to|receive\s*from|received\s*from|transaction\s*(?:type|no|number|status)|wallet\s*ref|ref(?:erence)?(?:\s*no|\s*number)?|payment\s*method|date(?:\s*\/\s*time)?|time|status|duit\s*now|points?|amount)\s*[:：]?$/i;
  const isNoise = (s) => !s || labels.test(s) || /^\s*(?:successful|completed|receipt|help|details|powered by|alipay\+?|done|transaction history|tng ewallet)\s*$/i.test(s);
  function labelled(lines, pattern) {
    const re = new RegExp('^\\s*(?:' + pattern + ')\\s*[:：-]?\\s*(.*)$', 'i');
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const inline = clean(m[1]);
      if (inline && !isNoise(inline)) return inline;
      const next = clean(lines[i + 1]);
      if (next && !isNoise(next)) return next;
    }
    return '';
  }
  function sanitise(value) {
    return clean(value)
      .replace(/(?:\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b)/gi, '[REDACTED EMAIL]')
      .replace(/\b(?:\+?60|0)\s*1\d(?:[\s-]?\d){7,9}\b/g, '[REDACTED PHONE]')
      .replace(/\b(?:wallet\s*ref|transaction\s*(?:no|number)|duit\s*now\s*ref|account\s*(?:no|number)|ref(?:erence)?\s*(?:no|number))\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, '[REDACTED ID]')
      .replace(/\b(?:[A-Z]{2,}\d[A-Z0-9-]{6,}|\d{8,})\b/gi, '[REDACTED ID]')
      .slice(0, 240);
  }
  function extractMainAmount(lines) {
    // The prominent TNG transaction amount normally has an explicit + or -.
    // Ignore unsigned secondary totals, fee amounts and reward points.
    const pattern = /(?:^|\s)([+\-−])\s*(?:RM\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))(?:\s|$)/i;
    const pattern2 = /\bRM\s*([+\-−])\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))(?:\s|$)/i;
    const candidates = [];
    lines.slice(0, 18).forEach((line, index) => {
      if (/\b(?:original payment|fee|points?|balance|total cashback|voucher|discount|promotion|previous amount|refund fee|transfer fee)\b/i.test(line)) return;
      let m = pattern.exec(line) || pattern2.exec(line);
      if (!m) return;
      const value = Number(m[2].replace(/,/g, ''));
      if (!Number.isFinite(value) || value <= 0) return;
      candidates.push({index, amount: (m[1] === '−' ? '-' : m[1]) + 'RM' + value.toFixed(2)});
    });
    return candidates.length ? candidates.sort((a,b)=>a.index-b.index)[0].amount : '';
  }
  function extractDate(lines) {
    const patterns = [
      /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?/i,
      /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s*,?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?/i,
    ];
    for (const line of lines) for (const re of patterns) {
      const m = line.match(re);
      if (m) {
        let date = clean(m[0]).replace(/,\s*/g,' ');
        // Keep date + coarse time-of-day only; no exact minute/second needed.
        const time = date.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?\b/i);
        if (time) {
          let hour = Number(time[1]);
          if (time[3]) hour = (hour % 12) + (/PM/i.test(time[3]) ? 12 : 0);
          const bucket = hour < 5 ? 'Night' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
          date = clean(date.slice(0, time.index)) + ' (' + bucket + ')';
        }
        return date.slice(0, 50);
      }
    }
    return '';
  }
  function parse(text, options = {}) {
    const lines = linesOf(text);
    const head = lines.slice(0, 10).join(' ');
    const type = typeDefs.find(x => x.re.test(head));
    const transactionType = type ? type.name : '';
    const peer = /^(?:Transfer to Wallet|DuitNow Received|DuitNow Transfer)$/.test(transactionType);
    const rawMerchant = labelled(lines, 'Merchant|Business|Payee');
    const rawPeer = labelled(lines, 'Transfer\\s+To|Receive\\s+From|Received\\s+From|Recipient|Sender');
    const rawDetails = labelled(lines, 'Payment\\s+Details|Remarks?');
    const amount = extractMainAmount(lines);
    const dateTime = extractDate(lines);
    let counterparty = peer ? '[REDACTED PERSON]' : sanitise(rawMerchant);
    if (!peer && !counterparty && transactionType === 'Payment') {
      // Sometimes receipt merchant name is unlabeled, near top of page.
      const index = lines.findIndex(l => /\bpayment\b/i.test(l));
      const opts = lines.slice(Math.max(0,index+1), Math.max(0,index+8));
      counterparty = sanitise(opts.find(x => /[A-Za-z]{3}/.test(x) && !isNoise(x) && !/[+-]\s*RM/i.test(x) && !/\b(?:ref|time|method|details|merchant|cashback|transaction|successful|points|date)\b/i.test(x)) || '');
    }
    // Merchant and remarks are existing source fields. Never turn them into owner-written notes.
    const detailsValue = sanitise(rawDetails);
    const paymentMethod = /\beWallet\s*Balance\b/i.test(lines.join(' ')) ? 'eWallet Balance' : '';
    const status = /^successful$/i.test(lines.join(' ')) || lines.some(x=>/^Successful$/i.test(x)) ? 'Successful' : '';
    const ocrConfidence = Number(options.confidence || 0);
    const warnings = [];
    if (!transactionType) warnings.push('Transaction type not recognised');
    if (!amount) warnings.push('Signed main amount not detected');
    if (!counterparty && !/^(?:Cashback|Refund)$/.test(transactionType)) warnings.push('Merchant or counterparty missing');
    if (!dateTime) warnings.push('Date not recognised');
    if (ocrConfidence < 65) warnings.push('Low OCR confidence');
    if (peer) warnings.push('Personal counterparty hidden: please verify type and amount');
    const result = {
      amount, transactionType, counterpartyLabel: peer ? 'Counterparty' : 'Merchant',
      counterparty, detailsLabel: 'Payment Details / Remarks', detailsValue,
      paymentMethod, dateTime, status, ocrConfidence,
      warnings, requiresReview: true, // Always human-reviewed before saving.
      ocrSource: ocrConfidence ? 'Local OCR ' + Math.round(ocrConfidence) + '% — Review' : 'OCR — Review',
    };
    return result;
  }
  return {parse, linesOf, extractMainAmount, extractDate, sanitise};
});
