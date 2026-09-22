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
    const isHtml = /^\s*</.test(rawText || '') || /<html|<body|<head/i.test(rawText || '');
    let detail = body.error || (!isHtml ? rawText?.trim() : '') || response.statusText || 'Request failed';

    if (response.status === 504) {
      detail = 'Gateway timeout. The AI service did not respond before the proxy deadline.';
    } else if (response.status === 502) {
      detail = 'The AI service is temporarily unavailable behind the application gateway.';
    }

    throw new Error(`FFPRO Copilot request failed (${response.status}): ${detail}`);
  }
  return body as BusinessCopilotResponse;
}
