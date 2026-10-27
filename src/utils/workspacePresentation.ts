export function financeSyncStatus(syncing: boolean, error: string | null, unsaved: boolean) {
  if (syncing) return {label:'Saving…',tone:'working',description:'Saving your changes. Please wait.'};
  if (error) return {label:'Save needs attention',tone:'warning',description:'Save needs attention. Your local changes are retained; review the warning before retrying.'};
  if (unsaved) return {label:'Unsaved changes',tone:'warning',description:'Unsaved changes. Select to save now.'};
  return {label:'Saved',tone:'saved',description:'Changes saved. Select to sync again.'};
}
export function readFinanceAppearance(): 'light' | 'dark' {
  try { return localStorage.getItem('ffpro-appearance') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function isUsableBriefing(value: unknown): boolean {
  const x = value as {articles?:unknown;briefing?:{summary?:unknown;updatedAt?:unknown;takeaways?:unknown}} | null;
  return !!x && Array.isArray(x.articles) && typeof x.briefing?.summary === 'string' &&
    typeof x.briefing.updatedAt === 'string' && Number.isFinite(Date.parse(x.briefing.updatedAt)) &&
    Array.isArray(x.briefing.takeaways) && x.briefing.takeaways.every(item=>typeof item==='string');
}
