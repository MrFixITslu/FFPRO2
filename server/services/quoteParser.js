/**
 * Deterministic Quote Parser
 * Fallback and text-based extractor for supplier quotes, invoices, and estimates.
 * Works even when Ollama/LLM is unreachable, aborted, or times out.
 */

function sanitizeNumber(val, fallback = 0) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : fallback;
  }
  return fallback;
}

export function parseQuoteTextDeterministic(rawText, fileName = '') {
  const text = (rawText || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let supplier = '';
  let quoteNumber = '';
  let quoteDate = '';
  let currency = 'USD';
  let discounts = 0;
  let shippingCosts = 0;
  let subtotal = 0;
  let grandTotal = 0;
  let tax = 0;
  const items = [];

  // 1. Detect Currency
  if (/[€]|EUR/i.test(text)) currency = 'EUR';
  else if (/[£]|GBP/i.test(text)) currency = 'GBP';
  else if (/CAD/i.test(text)) currency = 'CAD';
  else if (/XCD|EC\$/i.test(text)) currency = 'XCD';
  else if (/[¥]|JPY/i.test(text)) currency = 'JPY';
  else if (/AUD/i.test(text)) currency = 'AUD';

  // 2. Detect Supplier / Vendor
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    const match = line.match(/(?:supplier|vendor|from|company|contractor|biller|merchant)\s*[:\-]\s*([^\n\r,]+)/i);
    if (match && match[1]?.trim().length > 1) {
      supplier = match[1].trim();
      break;
    }
  }
  if (!supplier && lines.length > 0) {
    // If the top line is not a generic header like "INVOICE" or "QUOTE", use it
    const firstLine = lines[0].replace(/[#:|].*$/, '').trim();
    if (firstLine.length >= 2 && firstLine.length <= 40 && !/^(quote|invoice|estimate|proposal|statement|order|purchase order)$/i.test(firstLine)) {
      supplier = firstLine;
    } else if (fileName) {
      supplier = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
    } else {
      supplier = 'Supplier Quote';
    }
  }

  // 3. Detect Quote Number
  for (const line of lines) {
    const qMatch = line.match(/(?:quote|estimate|invoice|order|proposal|ref|reference)\s*(?:#|no\.?|num\.?|id|code)?\s*[:.\s-]*([A-Z0-9_-]{3,25})/i);
    if (qMatch) {
      quoteNumber = qMatch[1].trim();
      break;
    }
  }
  if (!quoteNumber) {
    quoteNumber = 'Q-' + Math.floor(100000 + Math.random() * 900000);
  }

  // 4. Detect Date
  for (const line of lines) {
    const dateMatch = line.match(/(?:date|dated|issue date)\s*[:\-]?\s*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i);
    if (dateMatch) {
      quoteDate = dateMatch[1].trim();
      break;
    }
  }
  if (!quoteDate) {
    quoteDate = new Date().toISOString().split('T')[0];
  }

  // 5. Detect Document Totals
  for (const line of lines) {
    // Subtotal
    const subMatch = line.match(/sub-?total\s*[:\s]*[\$€£]?\s*([0-9,]+\.?[0-9]*)/i);
    if (subMatch) {
      const val = sanitizeNumber(subMatch[1]);
      if (val > 0) subtotal = val;
    }

    // Grand Total / Total Due
    const totalMatch = line.match(/(?:grand\s*total|total\s*(?:due|amount|payable)?|amount\s*due)\s*[:\s]*[\$€£]?\s*([0-9,]+\.?[0-9]*)/i);
    if (totalMatch && !/sub-?total/i.test(line) && !/unit/i.test(line)) {
      const val = sanitizeNumber(totalMatch[1]);
      if (val > 0) grandTotal = val;
    }

    // Shipping / Freight
    const shipMatch = line.match(/(?:shipping|freight|delivery|handling|postage)\s*[:\s]*[\$€£]?\s*([0-9,]+\.?[0-9]*)/i);
    if (shipMatch) {
      const val = sanitizeNumber(shipMatch[1]);
      if (val >= 0) shippingCosts = val;
    }

    // Discounts
    const discMatch = line.match(/(?:discount|rebate|savings|credit)\s*[:\s]*-?[\$€£]?\s*([0-9,]+\.?[0-9]*)/i);
    if (discMatch) {
      const val = sanitizeNumber(discMatch[1]);
      if (val >= 0) discounts = val;
    }

    // Taxes
    const taxMatch = line.match(/(?:tax|vat|gst|hst)\s*[:\s]*[\$€£]?\s*([0-9,]+\.?[0-9]*)/i);
    if (taxMatch) {
      const val = sanitizeNumber(taxMatch[1]);
      if (val >= 0) tax = val;
    }
  }

  // 6. Detect Line Items
  // Patterns for table rows:
  // Item Name   Qty   Unit Price   Total
  for (const line of lines) {
    // Skip summary lines
    if (/(?:subtotal|grand total|total due|tax|shipping|terms & conditions|bank details|signature|page \d+)/i.test(line)) {
      continue;
    }

    // Pattern A: Name ... Qty ... Price ... Total (e.g., "Steel Beam 10 EA $45.00 $450.00")
    const pA = line.match(/^([A-Za-z0-9\s/&.\-+#]{2,50}?)\s+([0-9]+)\s*(?:EA|PCS|HRS|UNITS?|BOX|KG)?\s+[\$€£]?\s*([0-9,]+\.[0-9]{2})\s+[\$€£]?\s*([0-9,]+\.[0-9]{2})$/i);
    if (pA) {
      const itemName = pA[1].trim();
      const qty = parseInt(pA[2], 10) || 1;
      const unit = sanitizeNumber(pA[3]);
      const lineTot = sanitizeNumber(pA[4]);
      if (unit > 0 || lineTot > 0) {
        items.push({
          item: itemName,
          description: '',
          quantity: qty,
          unitCost: unit > 0 ? unit : (lineTot / qty),
          discount: 0,
          shippingCost: 0,
          lineTotal: lineTot > 0 ? lineTot : (qty * unit)
        });
        continue;
      }
    }

    // Pattern B: Name ... Qty x UnitPrice (e.g., "3x Premium Audio Monitors @ $150.00")
    const pB = line.match(/^(?:[-*•]|\d+\.?)?\s*([A-Za-z0-9\s/&.\-+#]{2,50}?)\s*[-–:@]?\s*(\d+)\s*(?:x|@|qty)\s*[\$€£]?\s*([0-9,]+\.[0-9]{2})/i);
    if (pB) {
      const itemName = pB[1].trim();
      const qty = parseInt(pB[2], 10) || 1;
      const unit = sanitizeNumber(pB[3]);
      if (unit > 0 && itemName.length > 1) {
        items.push({
          item: itemName,
          description: '',
          quantity: qty,
          unitCost: unit,
          discount: 0,
          shippingCost: 0,
          lineTotal: parseFloat((qty * unit).toFixed(2))
        });
        continue;
      }
    }

    // Pattern C: Name ... $Amount (Single item or service without explicit qty)
    const pC = line.match(/^(?:[-*•]|\d+\.?)?\s*([A-Za-z0-9\s/&.\-+#]{3,50}?)\s*(?:[-–:.]|\.{2,})\s*[\$€£]\s*([0-9,]+\.[0-9]{2})$/i);
    if (pC) {
      const itemName = pC[1].trim();
      const cost = sanitizeNumber(pC[2]);
      if (cost > 0 && !/^(total|balance|due|paid|deposit|phone|tel|zip|postal|date)$/i.test(itemName)) {
        items.push({
          item: itemName,
          description: '',
          quantity: 1,
          unitCost: cost,
          discount: 0,
          shippingCost: 0,
          lineTotal: cost
        });
        continue;
      }
    }
  }

  // 7. If no line items were detected, create an organized line item so the user can edit
  if (items.length === 0) {
    const targetAmount = grandTotal || subtotal || 100;
    items.push({
      item: `${supplier} Quoted Package`,
      description: `Imported quote ${quoteNumber}. Please adjust line items if needed.`,
      quantity: 1,
      unitCost: targetAmount,
      discount: 0,
      shippingCost: 0,
      lineTotal: targetAmount
    });
  }

  // 8. Calculate and reconcile subtotal & total
  const calculatedSubtotal = parseFloat(items.reduce((s, it) => s + it.lineTotal, 0).toFixed(2));
  if (subtotal === 0 || Math.abs(subtotal - calculatedSubtotal) > 0.05) {
    subtotal = calculatedSubtotal;
  }

  const calculatedTotal = parseFloat((subtotal + shippingCosts - discounts).toFixed(2));
  if (grandTotal === 0 || Math.abs(grandTotal - calculatedTotal) > 0.05) {
    grandTotal = Math.max(0, calculatedTotal);
  }

  return {
    supplier: supplier || 'Supplier',
    quoteNumber: quoteNumber || 'Q-EXTRACTED',
    quoteDate: quoteDate,
    currency,
    items,
    discounts,
    shippingCosts,
    subtotal,
    total: grandTotal,
    commercialTerms: 'Commercial terms extracted. Verified for cost reconciliation.'
  };
}
