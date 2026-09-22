import { useCallback, useState } from 'react';
import {
  BusinessCopilotContext,
  BusinessCopilotResponse
} from '../../shared/businessCopilotTypes';
import { askBusinessCopilot } from '../services/businessCopilotService';

export interface BusinessCopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  response?: BusinessCopilotResponse;
}

export function useBusinessCopilot(context: BusinessCopilotContext) {
  const [messages, setMessages] = useState<BusinessCopilotMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (message: string) => {
    const text = message.trim();
    if (!text || loading) return null;

    setLoading(true);
    setError(null);
    setMessages((current) => [...current, { role: 'user', content: text }]);

    try {
      const response = await askBusinessCopilot({
        message: text,
        context,
        history: messages.slice(-8).map((item) => ({
          role: item.role,
          content: item.content
        }))
      });

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: response.message,
          response
        }
      ]);
      return response;
    } catch (err: any) {
      const messageText = err?.message || 'FFPRO Copilot is temporarily unavailable.';
      setError(messageText);
      return null;
    } finally {
      setLoading(false);
    }
  }, [context, loading, messages]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    ask,
    clear
  };
}
