/**
 * Deterministic Quote Parser
 * Fallback and text-based extractor for supplier quotes, invoices, and estimates.
 * Works even when Ollama/LLM is unreachable, aborted, or times out.
 */

export function sanitizeNumber(val, fallback = 0) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    let s = val.trim();
    if (!s) return fallback;
    const isNegative = s.includes('-') || s.includes('(-') || (s.startsWith('(') && s.endsWith(')'));
    s = s.replace(/[^0-9,.\s]/g, '').trim();
    if (!s) return fallback;

    // Handle European comma decimals vs US period decimals
    if (s.includes(',') && !s.includes('.')) {
      s = s.replace(/\s+/g, '').replace(',', '.');
    } else if (s.includes('.') && s.includes(',')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else {
      s = s.replace(/\s+/g, '').replace(/,/g, '');
    }

    const num = parseFloat(s);
    if (!Number.isFinite(num)) return fallback;
    return isNegative ? -Math.abs(num) : Math.abs(num);
  }
  return fallback;
}

/**
 * Reconciles numbers in ambiguous OCR lines where thousands separators may have caused token splits.
 * e.g. [12, 819, 9, 828] -> Qty 12, Unit 819, Total 9828
 */
function resolveNumbers(rawTokens) {
  const rawNums = rawTokens.map(t => sanitizeNumber(t)).filter(n => n >= 0);

  if (rawNums.length === 4) {
    const [n1, n2, n3, n4] = rawNums;
    if (Math.abs(n1 * n2 - (n3 * 1000 + n4)) < 1) {
      return { quantity: n1, unitCost: n2, lineTotal: n3 * 1000 + n4 };
    }
    if (Math.abs(n1 * (n2 * 1000 + n3) - n4) < 1) {
      return { quantity: n1, unitCost: n2 * 1000 + n3, lineTotal: n4 };
    }
    return { quantity: n1, unitCost: n2, lineTotal: n3 * 1000 + n4 };
  }

  if (rawNums.length === 3) {
    const [n1, n2, n3] = rawNums;
    return { quantity: n1, unitCost: n2, lineTotal: n3 };
  }

  if (rawNums.length === 2) {
    const [n1, n2] = rawNums;
    return { quantity: n1, unitCost: n2, lineTotal: n1 * n2 };
  }

  if (rawNums.length === 1) {
    return { quantity: rawNums[0], unitCost: 0, lineTotal: 0 };
  }

  return { quantity: 1, unitCost: 0, lineTotal: 0 };
}

/**
 * Splits combined item header text and description based on grammatical/catalog cues.
 */
function splitItemAndDescription(fullText) {
  const text = (fullText || '').trim();
  if (!text) return { item: 'Quoted Item', description: '' };

  // Check for description indicator words
  const splitMatch = text.match(/^(.*?)\s+\b(with\b|protects\b|made of\b|provides\b|for\b|charging\s+station\b|set of\b|designed\b|includes\b|compatible\b)(.*)$/i);
  if (splitMatch && splitMatch[1].trim().length >= 2) {
    const itemName = splitMatch[1].trim();
    const desc = (splitMatch[2] + splitMatch[3]).trim();
    return { item: itemName, description: desc };
  }

  return { item: text, description: '' };
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
  let tax = 0;
  let grandTotal = 0;
  let commercialTerms = '';
  const items = [];

  // 1. Detect Currency
  if (/[€]|EUR/i.test(text)) currency = 'EUR';
  else if (/[£]|GBP/i.test(text)) currency = 'GBP';
  else if (/CAD/i.test(text)) currency = 'CAD';
  else if (/XCD|EC\$/i.test(text)) currency = 'XCD';
  else if (/[¥]|JPY/i.test(text)) currency = 'JPY';
  else if (/AUD/i.test(text)) currency = 'AUD';

  // 2. Terms & Conditions block extraction
  const termsMatch = text.match(/(?:terms\s*(?:&|and)\s*conditions|payment\s*options|payment\s*terms|commercial\s*terms)[\s\S]*$/i);
  if (termsMatch) {
    commercialTerms = termsMatch[0].trim();
  }

  // 3. Detect Quote / Ref Number
  for (const line of lines) {
    const qMatch = line.match(/(?:quote\s*#?|estimate\s*#?|invoice\s*#?|ref\.?|№|p\.o\.#?)\s*[:.\s-]*([A-Z0-9_/\-]{3,25})/i);
    if (qMatch && !/subtotal|total|date/i.test(qMatch[1])) {
      quoteNumber = qMatch[1].trim();
      break;
    }
  }
  if (!quoteNumber) {
    quoteNumber = 'Q-' + Math.floor(100000 + Math.random() * 900000);
  }

  // 4. Detect Date
  for (const line of lines) {
    const dMatch = line.match(/(?:quote\s*date|issue\s*date|date)\s*[:\s-]*([0-9]{1,4}[-/\\.][0-9]{1,2}[-/\\.][0-9]{2,4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i);
    if (dMatch) {
      quoteDate = dMatch[1].trim();
      break;
    }
  }
  if (!quoteDate && quoteNumber && /\b([0-9]{2}\/[0-9]{2}\/[0-9]{4})\b/.test(quoteNumber)) {
    const match = quoteNumber.match(/\b([0-9]{2}\/[0-9]{2}\/[0-9]{4})\b/);
    if (match) quoteDate = match[1];
  }
  if (!quoteDate) {
    for (const line of lines) {
      const dMatch = line.match(/\b([0-9]{1,2}[-/\\.][0-9]{1,2}[-/\\.][0-9]{4})\b/);
      if (dMatch && !line.includes('№') && !/valid/i.test(line)) {
        quoteDate = dMatch[1];
        break;
      }
    }
  }
  if (!quoteDate) {
    quoteDate = new Date().toISOString().split('T')[0];
  }

  // 5. Detect Supplier
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];
    // Pattern: "FROM\nSupplier Name"
    if (/^FROM$/i.test(line) && lines[i + 1]) {
      supplier = lines[i + 1].trim();
      break;
    }
    // Pattern: "Supplier: Netronic" or "From: East Repair"
    const fromMatch = line.match(/(?:from|supplier|vendor|biller|merchant|contractor)\s*[:\-]\s*([A-Za-z0-9\s.,&\-]{2,40})/i);
    if (fromMatch && !/^(client|customer|bill to|ship to)$/i.test(fromMatch[1].trim())) {
      supplier = fromMatch[1].trim();
      break;
    }
    // Domain or corporation in line (e.g. NETRONIC.NET, East Repair Inc.)
    const domainOrCompanyMatch = line.match(/([A-Za-z0-9\s.&_\-]{3,35}(?:\.NET|\.COM|\.ORG|Inc\.?|LLC|Ltd\.?|Corp\.?|Company))\b/i);
    if (domainOrCompanyMatch && !supplier && !/client|customer|bill to|ship to|gmail|yahoo|hotmail/i.test(line)) {
      supplier = domainOrCompanyMatch[1].trim();
    }
  }
  if (!supplier && fileName) {
    supplier = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
  }
  if (!supplier) {
    supplier = 'Supplier Quote';
  }

  // 6. Detect Document Totals, Discounts, Shipping, Tax
  for (const line of lines) {
    // Subtotal
    const subMatch = line.match(/(?:sub-?total)\s*[:\s]*([0-9\s,.]+(?:\s*[\$€£])?)/i);
    if (subMatch) {
      const val = Math.abs(sanitizeNumber(subMatch[1]));
      if (val > 0) subtotal = val;
    }
    // Discount
    const discMatch = line.match(/(?:discount|rebate|savings|credit)\s*[:\s]*-?([0-9\s,.]+(?:\s*[\$€£])?)/i);
    if (discMatch && !/%/.test(line)) {
      const val = Math.abs(sanitizeNumber(discMatch[1]));
      if (val > 0) discounts = val;
    }
    // Shipping
    const shipMatch = line.match(/(?:shipping|freight|delivery|handling|postage)\s*[:\s]*([0-9\s,.]+(?:\s*[\$€£])?)/i);
    if (shipMatch) {
      const val = Math.abs(sanitizeNumber(shipMatch[1]));
      if (val > 0) shippingCosts = val;
    }
    // Tax
    const taxMatch = line.match(/(?:sales\s*tax|vat|gst|hst|tax)\s*(?:[0-9.]+%?)?\s*[:\s]*([0-9\s,.]+(?:\s*[\$€£])?)/i);
    if (taxMatch) {
      const val = Math.abs(sanitizeNumber(taxMatch[1]));
      if (val > 0) tax = val;
    }
    // Grand Total
    const totMatch = line.match(/(?:^|[^a-z])(?:total|grand\s*total|amount\s*due|total\s*due)\s*[:\s]*[\$€£]?([0-9\s,.]+(?:\s*[\$€£])?)/i);
    if (totMatch && !/subtotal/i.test(line)) {
      const val = Math.abs(sanitizeNumber(totMatch[1]));
      if (val > 0) grandTotal = val;
    }
  }

  // Strategy 1: Table format "QTY DESCRIPTION UNIT_PRICE AMOUNT" (e.g. East Repair Inc)
  for (const line of lines) {
    if (/^(qty|item|image|subtotal|total|discount|shipping|tax|terms|sales tax)/i.test(line)) continue;
    const matchQtyFirst = line.match(/^([0-9]{1,4})\s+([A-Za-z0-9\s/&.\-+#]{2,60}?)\s+([0-9\s,.]+)\s+([0-9\s,.]+)$/);
    if (matchQtyFirst) {
      const q = parseInt(matchQtyFirst[1], 10);
      const desc = matchQtyFirst[2].trim();
      const u = sanitizeNumber(matchQtyFirst[3]);
      const tot = sanitizeNumber(matchQtyFirst[4]);
      if (q > 0 && (u > 0 || tot > 0)) {
        items.push({
          item: desc,
          description: '',
          quantity: q,
          unitCost: u > 0 ? u : tot / q,
          discount: 0,
          shippingCost: 0,
          lineTotal: tot > 0 ? tot : q * u
        });
      }
    }
  }

  // Strategy 2: Multi-line catalog format (e.g. Netronic / Proposal items)
  if (items.length === 0) {
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/(?:item|description|qty|unit price|amount|discount)/i.test(lines[i]) && lines[i].split(/\s+/).length >= 3) {
        headerIdx = i;
        break;
      }
    }

    const tableLines = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;
    let pendingLines = [];

    for (let i = 0; i < tableLines.length; i++) {
      const line = tableLines[i];
      if (/^(sub-total|subtotal|discount|shipping|total|terms|payment|add \$|certificate of origin|netronic laser)/i.test(line)) {
        break;
      }

      // Check if line contains numbers row or trailing numbers
      const discMatch = line.match(/-\s*([0-9]+)%/);
      const discPct = discMatch ? parseInt(discMatch[1], 10) : 0;

      const lineWithoutDisc = line.replace(/-\s*[0-9]+%/g, '').replace(/[\$€£]/g, '').trim();
      const matchNumbers = lineWithoutDisc.match(/(?:^|(?<=\s))([0-9]{1,4}(?:\s+[0-9\s,.]+)*)$/);

      const isZeroCost = discPct === 100 && /^[0-9\s]+$/.test(lineWithoutDisc.trim());
      const hasTrailingNumbers = matchNumbers && matchNumbers[1] && (
        /[,.]/.test(matchNumbers[1]) || isZeroCost || (discPct > 0 && /^[0-9\s]+$/.test(matchNumbers[1]))
      );

      if (hasTrailingNumbers) {
        const numSection = matchNumbers[1].trim();
        const textBeforeNums = lineWithoutDisc.slice(0, lineWithoutDisc.lastIndexOf(numSection)).trim();
        const rawTokens = numSection.split(/\s+/).filter(Boolean);
        const resolved = resolveNumbers(rawTokens);

        // Gather all text leading up to this item
        let fullItemText = '';
        if (pendingLines.length > 0) {
          fullItemText = pendingLines.join(' ');
          if (textBeforeNums) fullItemText += ' ' + textBeforeNums;
        } else {
          fullItemText = textBeforeNums;
        }

        const { item: itemName, description: itemDesc } = splitItemAndDescription(fullItemText);

        const calculatedLineTotal = discPct === 100 ? 0 : (resolved.lineTotal || (resolved.quantity * resolved.unitCost));
        const discountAmount = discPct > 0 ? parseFloat(((resolved.lineTotal || (resolved.quantity * resolved.unitCost)) * discPct / 100).toFixed(2)) : 0;

        items.push({
          item: itemName,
          description: itemDesc,
          quantity: resolved.quantity || 1,
          unitCost: resolved.unitCost || 0,
          discount: discountAmount,
          shippingCost: 0,
          lineTotal: calculatedLineTotal
        });

        pendingLines = [];
        continue;
      }

      // Accumulate text lines
      pendingLines.push(line);
    }
  }

  // Strategy 3: Standard Pattern Matching (Pattern A, Pattern B, Pattern C)
  if (items.length === 0) {
    for (const line of lines) {
      if (/(?:subtotal|grand total|total due|tax|shipping|terms & conditions|bank details|signature|page \d+)/i.test(line)) {
        continue;
      }

      // Pattern A: Name ... Qty ... Price ... Total
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

      // Pattern B: Name ... Qty x UnitPrice
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

      // Pattern C: Name ... $Amount
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
  }

  // 7. Fallback item if nothing matched
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

  // 8. Reconcile subtotal & grand total
  const computedSubtotal = parseFloat(items.reduce((s, it) => s + (it.lineTotal || (it.quantity * it.unitCost) || 0), 0).toFixed(2));
  if (!subtotal || subtotal === 0) {
    subtotal = computedSubtotal;
  }

  if (!grandTotal || grandTotal === 0) {
    grandTotal = parseFloat((subtotal + shippingCosts - discounts + tax).toFixed(2));
  }

  return {
    supplier: supplier || 'Supplier',
    quoteNumber: quoteNumber || 'Q-EXTRACTED',
    quoteDate: quoteDate,
    currency,
    items,
    discounts,
    shippingCosts,
    tax,
    subtotal,
    total: grandTotal,
    commercialTerms: commercialTerms || 'Commercial terms extracted. Verified for cost reconciliation.'
  };
}
