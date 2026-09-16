import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates } from '../src/utils/stateMerge.ts';
import { quoteTotals, allocatedQuoteCosts, recalculateQuote } from '../shared/quoteMath.js';
import { validateAppState } from '../shared/appState.js';
import { calendarTimes, calendarPages } from '../server/calendarTime.js';
const state=(extra:any={})=>({transactions:[],events:[],cashOpeningBalance:100,...extra}) as any;
test('three-way sync preserves deletions, zero balances and independent additions',()=>{
  const base=state({transactions:[{id:'a',amount:5},{id:'b',amount:9}]});
  const local=state({transactions:[{id:'b',amount:9}],cashOpeningBalance:0});
  const remote=state({transactions:[...base.transactions,{id:'c',amount:3}]});
  const result=mergeStates(base,local,remote);
  assert.deepEqual(result.conflicts,[]);assert.equal(result.data.cashOpeningBalance,0);
  assert.deepEqual(result.data.transactions.map(x=>x.id),['b','c']);
});
test('sync refuses competing edits and edit/delete conflicts',()=>{
  const base=state({events:[{id:'a',name:'Base'}]});
  assert.ok(mergeStates(base,state({events:[]}),state({events:[{id:'a',name:'Changed'}]})).conflicts.length);
  assert.ok(mergeStates(state(),state({cashOpeningBalance:0}),state({cashOpeningBalance:200})).conflicts.length);
});
test('manual bank accounts and zero balances validate; duplicate IDs and invalid amounts do not',()=>{
  assert.equal(validateAppState(state({bankConnections:[{institution:'Manual',openingBalance:0}]})),null);
  assert.ok(validateAppState(state({events:[{id:'a'},{id:'a'}]})));
  assert.ok(validateAppState(state({transactions:[{id:'a',amount:Infinity,type:'expense',date:'2026-01-01'}]})));
});
test('quote costs include fractional quantities, line freight and overall discounts without losing cents',()=>{
  const quote={items:[{quantity:1.5,unitCost:10,discount:2,shippingCost:1,lineTotal:14},{quantity:1,unitCost:3.33,lineTotal:3.33}],subtotal:17.33,shippingCosts:2,discounts:1,total:18.33};
  assert.deepEqual(quoteTotals(quote).issues,[]);
  assert.equal(Math.round(allocatedQuoteCosts(quote).reduce((a,b)=>a+b,0)*100),1833);
  const wrong={...quote,total:999};assert.ok(quoteTotals(wrong).issues.length);assert.throws(()=>allocatedQuoteCosts(wrong));
  assert.equal(recalculateQuote(wrong).total,18.33);
  assert.ok(quoteTotals({...quote,discounts:100}).issues.length);
});
test('calendar uses selected timezone and all-day exclusive end; rejects invalid and nonexistent times',()=>{
  const timed=calendarTimes({date:'2026-09-15',startTime:'09:00',endTime:'10:30',timeZone:'America/St_Lucia'});
  assert.equal(timed.start.dateTime,'2026-09-15T09:00:00.000-04:00');
  assert.deepEqual(calendarTimes({date:'2026-12-31',timeZone:'America/St_Lucia'}),{start:{date:'2026-12-31'},end:{date:'2027-01-01'}});
  assert.throws(()=>calendarTimes({date:'2026-02-30',timeZone:'UTC'}));
  assert.throws(()=>calendarTimes({date:'2026-03-08',startTime:'02:30',timeZone:'America/New_York'}));
  assert.throws(()=>calendarTimes({date:'2026-09-15',startTime:'10:00',endTime:'09:00',timeZone:'UTC'}));
});
test('calendar reads subsequent pages and never reports partial fetch as success',async()=>{
  const original=globalThis.fetch;let count=0;
  try {
    globalThis.fetch=async input=> {count++;assert.equal(new URL(input as any).searchParams.get('pageToken'),count===1?null:'next');return new Response(JSON.stringify(count===1?{items:[{id:1}],nextPageToken:'next'}:{items:[{id:2}]}));};
    assert.deepEqual(await calendarPages(new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events'),'test'),[{id:1},{id:2}]);
    globalThis.fetch=async()=>new Response('{}',{status:503});
    await assert.rejects(calendarPages(new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events'),'test'));
  }finally{globalThis.fetch=original;}
});
