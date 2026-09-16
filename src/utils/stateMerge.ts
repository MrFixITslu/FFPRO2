import type { AppState } from '../services/vaultService';
const equal = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function mergeStates(base: AppState, local: AppState, remote: AppState): { data: AppState; conflicts: string[] } {
  const conflicts: string[] = [];
  function merge(b: any,l: any,r: any,path: string): any {
    if(equal(l,r)) return l;
    if(equal(l,b)) return r;
    if(equal(r,b)) return l;
    if(Array.isArray(b) && Array.isArray(l) && Array.isArray(r) && [...b,...l,...r].every(x=>x && typeof x.id==='string')) {
      const bm=new Map(b.map(x=>[x.id,x])),lm=new Map(l.map(x=>[x.id,x])),rm=new Map(r.map(x=>[x.id,x]));
      return [...new Set([...lm.keys(),...rm.keys(),...bm.keys()])].map(id=>merge(bm.get(id),lm.get(id),rm.get(id),`${path}.${id}`)).filter(x=>x!==undefined);
    }
    if(b && l && r && typeof b==='object' && typeof l==='object' && typeof r==='object' && !Array.isArray(b) && !Array.isArray(l) && !Array.isArray(r)) {
      return Object.fromEntries([...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].filter(k=>k!=='lastUpdated').map(k=>[k,merge(b[k],l[k],r[k],`${path}.${k}`)]));
    }
    // Edit/delete and competing field changes require a deliberate resolution.
    conflicts.push(path);return l;
  }
  return { data: { ...merge(base,local,remote,'data'), lastUpdated:new Date().toISOString() }, conflicts };
}
export function sameState(a: AppState | null,b: AppState | null) {
  if(!a || !b)return a===b;
  const {lastUpdated: _a,...aa}=a;const {lastUpdated:_b,...bb}=b;return equal(aa,bb);
}
