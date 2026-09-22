import {
  BusinessCopilotRequest,
  BusinessCopilotResponse
} from '../../shared/businessCopilotTypes';
import { apiFetch } from './apiFetch';

export async function askBusinessCopilot(
  request: BusinessCopilotRequest
): Promise<BusinessCopilotResponse> {
  const response = await apiFetch('/api/ai/business-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'FFPRO Copilot request failed.');
  }
  return body as BusinessCopilotResponse;
}
