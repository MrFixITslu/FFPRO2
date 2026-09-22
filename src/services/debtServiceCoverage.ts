import type { LoanAmortizationSummary } from '../types';

type Coverage = Pick<LoanAmortizationSummary, 'dscrYear1' | 'dscrStatus' | 'dscrNumerator' | 'dscrDenominator'>;

export function calculateDebtServiceCoverage(ebitda: number, debtService: number): Coverage {
  const ratio = debtService > 0 ? ebitda / debtService : null;
  return {
    dscrYear1: ratio,
    dscrStatus: ratio === null ? 'not_applicable'
      : ratio < 1 ? 'insufficient'
      : ratio < 1.25 ? 'tight'
      : ratio < 1.5 ? 'adequate' : 'strong',
    dscrNumerator: ebitda,
    dscrDenominator: debtService
  };
}

export function formatDebtServiceCoverage(ratio: number | null): string {
  return ratio === null ? 'N/A — no Year 1 debt payments' : `${ratio.toFixed(2)}x`;
}
