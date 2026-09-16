export const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function quoteTotals(quote) {
  const issues=[];
  const valid = value => typeof value==='number' && Number.isFinite(value) && value>=0 && value<=1e12;
  const lines=(quote.items || []).map((item,index)=>{
    if (![item.quantity,item.unitCost,item.discount ?? 0,item.shippingCost ?? 0].every(valid) || item.quantity<=0) issues.push(`Line ${index+1}: use a positive quantity and non-negative amounts.`);
    const total=money(item.quantity*item.unitCost-(item.discount ?? 0)+(item.shippingCost ?? 0));
    if(total<0) issues.push(`Line ${index+1}: discount exceeds the line cost.`);
    if(!Number.isFinite(item.lineTotal) || Math.abs(total-item.lineTotal)>0.011) issues.push(`Line ${index+1}: the quoted total does not match quantity, price, discount and shipping.`);
    return total;
  });
  const subtotal=money(lines.reduce((a,b)=>a+b,0));
  const shipping=quote.shippingCosts ?? 0,discount=quote.discounts ?? 0;
  const total=money(subtotal+shipping-discount);
  if(!valid(shipping) || !valid(discount) || total<0 || !Number.isFinite(total)) issues.push('Shipping or overall discount is invalid.');
  if(Math.abs(subtotal-quote.subtotal)>0.011 || Math.abs(total-quote.total)>0.011) issues.push('The document totals differ from the reviewed lines. Check for missing items, tax, shipping or discounts.');
  return { lines,subtotal,total,issues };
}
export function recalculateQuote(quote) {
  const totals=quoteTotals(quote);
  return {...quote,items:quote.items.map((item,i)=>({...item,lineTotal:totals.lines[i]})),subtotal:totals.subtotal,total:totals.total};
}
// Allocate discounts in integer cents so imported costs always equal the reviewed quote total.
export function allocatedQuoteCosts(quote) {
  const totals=quoteTotals(quote);
  if(totals.issues.length) throw new Error(totals.issues[0]);
  const cents=[...totals.lines.map(x=>Math.round(x*100)),Math.round((quote.shippingCosts || 0)*100)];
  const gross=cents.reduce((a,b)=>a+b,0),discount=Math.round((quote.discounts || 0)*100);
  let allocated=0;
  const nonzero=cents.map((v,i)=>v>0?i:-1).filter(i=>i>=0),last=nonzero.at(-1);
  return cents.map((value,i)=>{
    const part=i===last ? discount-allocated : gross ? Math.floor(discount*value/gross) : 0;
    allocated+=part;return (value-part)/100;
  });
}
