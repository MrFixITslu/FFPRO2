import {
  BusinessCopilotRequest,
  BusinessCopilotResponse
} from '../../shared/businessCopilotTypes';

export async function askBusinessCopilot(
  request: BusinessCopilotRequest
): Promise<BusinessCopilotResponse> {
  const response = await fetch('/api/ai/business-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  const rawText = await response.text();
  let body: any = {};
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    const detail = body.error || rawText?.trim() || response.statusText || 'Request failed';
    throw new Error(`FFPRO Copilot request failed (${response.status}): ${detail}`);
  }
  return body as BusinessCopilotResponse;
}
