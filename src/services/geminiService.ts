
import { AIAnalysisResult, CATEGORIES } from "../types";

// FIX: AI service now calls backend endpoint instead of using client-side API_KEY
// The backend handles all Gemini API calls at /api/ai/parse and /api/ai/market-data

export const parseInputToTransaction = async (
  input: string | { data: string; mimeType: string },
  isMedia: boolean = false
): Promise<AIAnalysisResult | null> => {
  try {
    const response = await fetch('/api/ai/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ input, isMedia })
    });

    if (!response.ok) {
      console.error('AI parse error:', response.statusText);
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Frontend AI Error:", error);
    return null;
  }
};

// FIX: Updated to use backend endpoint instead of direct API calls
export interface StatementParseResult {
  items: AIAnalysisResult[];
  warnings: string[];
  sourceName?: string;
  parser?: string;
}

export const parseStatementToTransactions = async (file: File): Promise<StatementParseResult> => {
  const form = new FormData();
  form.append('statement', file);

  const response = await fetch('/api/ai/parse-statement', {
    method: 'POST',
    credentials: 'include',
    body: form
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Statement could not be parsed.');
    (error as any).warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    throw error;
  }

  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    sourceName: payload.sourceName,
    parser: payload.parser
  };
};
