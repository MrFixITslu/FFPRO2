export async function syncBankData(_institution: string, _lastSynced?: string): Promise<any[]> {
  throw new Error('Automatic bank sync is not available. Enter or import verified transactions manually.');
}
export async function syncInvestmentHoldings(_provider: string): Promise<any[]> {
  throw new Error('Automatic investment sync is not available. Enter verified holdings manually.');
}
export async function verifyApiConnection(): Promise<boolean> { return false; }
export async function syncLucelecPortal(): Promise<null> { throw new Error('Automatic utility account sync is not available. Enter your bill manually.'); }
