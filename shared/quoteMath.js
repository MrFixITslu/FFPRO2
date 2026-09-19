export const money = value => {
  const n = typeof value === 'number' ? value : parseFloat(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

export const toNum = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

export function quoteTotals(quote) {
  if (!quote) return { lines: [], subtotal: 0, total: 0, issues: [] };
  const issues = [];
  const items = Array.isArray(quote.items) ? quote.items : [];

  const lines = items.map((item, index) => {
    const qty = Math.max(0, toNum(item.quantity, 1));
    const unit = Math.max(0, toNum(item.unitCost, 0));
    const disc = Math.max(0, toNum(item.discount, 0));
    const ship = Math.max(0, toNum(item.shippingCost, 0));

    if (qty <= 0) {
      issues.push(`Line ${index + 1}: quantity must be at least 1.`);
    }

    const total = money(Math.max(0, qty * unit - disc + ship));
    return total;
  });

  const subtotal = money(lines.reduce((a, b) => a + b, 0));
  const shipping = Math.max(0, toNum(quote.shippingCosts, 0));
  const discount = Math.max(0, toNum(quote.discounts, 0));
  const total = money(Math.max(0, subtotal + shipping - discount));

  if (discount > money(subtotal + shipping)) {
    issues.push(`Overall discount (${discount}) exceeds gross quote total (${money(subtotal + shipping)}).`);
  }

  if (quote.subtotal !== undefined && quote.subtotal !== null && money(quote.subtotal) !== subtotal) {
    issues.push(`Quoted subtotal (${money(quote.subtotal)}) does not match calculated subtotal (${subtotal}).`);
  }

  if (quote.total !== undefined && quote.total !== null && money(quote.total) !== total) {
    issues.push(`Quoted total (${money(quote.total)}) does not match calculated total (${total}).`);
  }

  return { lines, subtotal, total, issues };
}

export function recalculateQuote(quote) {
  if (!quote) return quote;
  const totals = quoteTotals(quote);
  const items = (quote.items || []).map((item, i) => {
    const qty = Math.max(0, toNum(item.quantity, 1));
    const unit = Math.max(0, toNum(item.unitCost, 0));
    const disc = Math.max(0, toNum(item.discount, 0));
    const ship = Math.max(0, toNum(item.shippingCost, 0));
    return {
      ...item,
      quantity: qty,
      unitCost: unit,
      discount: disc,
      shippingCost: ship,
      lineTotal: totals.lines[i] !== undefined ? totals.lines[i] : money(qty * unit - disc + ship)
    };
  });

  return {
    ...quote,
    items,
    shippingCosts: Math.max(0, toNum(quote.shippingCosts, 0)),
    discounts: Math.max(0, toNum(quote.discounts, 0)),
    subtotal: totals.subtotal,
    total: totals.total
  };
}

// Allocate overall quote discounts across items proportionally so cost sum matches total quoted
export function allocatedQuoteCosts(quote) {
  const initialTotals = quoteTotals(quote);
  if (initialTotals.issues && initialTotals.issues.length > 0) {
    throw new Error(`Invalid quote data: ${initialTotals.issues.join('; ')}`);
  }
  const cleanQuote = recalculateQuote(quote);
  const totals = quoteTotals(cleanQuote);
  const items = cleanQuote.items || [];
  
  if (items.length === 0) return [];

  const lineAmounts = totals.lines;
  const overallDiscount = Math.max(0, toNum(cleanQuote.discounts, 0));
  const overallSubtotal = totals.subtotal;

  if (overallDiscount <= 0 || overallSubtotal <= 0) {
    // Return direct line total for each item, plus separate entry for shipping if applicable
    const result = lineAmounts.map(amt => money(amt));
    if ((cleanQuote.shippingCosts || 0) > 0) {
      result.push(money(cleanQuote.shippingCosts));
    }
    return result;
  }

  // Pro-rate discount across line items
  let allocated = 0;
  const discountCents = Math.round(overallDiscount * 100);
  const grossCents = Math.round(overallSubtotal * 100);

  const nonZeroIndices = lineAmounts.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0);
  const lastNonZeroIdx = nonZeroIndices.length > 0 ? nonZeroIndices[nonZeroIndices.length - 1] : -1;

  const result = lineAmounts.map((amt, i) => {
    const lineCents = Math.round(amt * 100);
    if (lineCents <= 0) return 0;
    
    let partCents = 0;
    if (i === lastNonZeroIdx) {
      partCents = discountCents - allocated;
    } else if (grossCents > 0) {
      partCents = Math.floor((discountCents * lineCents) / grossCents);
    }
    allocated += partCents;
    return money(Math.max(0, (lineCents - partCents) / 100));
  });

  if ((cleanQuote.shippingCosts || 0) > 0) {
    result.push(money(cleanQuote.shippingCosts));
  }

  return result;
}

