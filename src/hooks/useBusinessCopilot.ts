import { useCallback, useState } from 'react';
import {
  BusinessCopilotContext,
  BusinessCopilotResponse
} from '../../shared/businessCopilotTypes';
import type { StartupPlanDetails } from '../types';
import { askBusinessCopilot } from '../services/businessCopilotService';
import { runBusinessScenario } from '../services/businessScenarioService';
import { inferLocalBusinessScenarioIntent } from '../services/businessScenarioIntentService';

export interface BusinessCopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  response?: BusinessCopilotResponse;
}

export function useBusinessCopilot(
  context: BusinessCopilotContext,
  startupDetails?: StartupPlanDetails
) {
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
      const localScenarioIntent = startupDetails
        ? inferLocalBusinessScenarioIntent(text, context)
        : undefined;

      if (localScenarioIntent && startupDetails) {
        const scenarioResult = runBusinessScenario(
          startupDetails,
          localScenarioIntent
        );

        const response: BusinessCopilotResponse = {
          message: 'Scenario calculated locally using the current FFPRO plan as the baseline. Your saved plan has not been changed.',
          mode: 'scenario',
          observations: [],
          calculations: [],
          sources: [{
            type: 'forecast',
            label: 'FFPRO deterministic forecast engine'
          }],
          proposals: [],
          scenarioIntent: localScenarioIntent,
          scenarioResult,
          suggestedPrompts: [
            'Compare another scenario',
            'Explain the break-even impact'
          ],
          provider: 'deterministic'
        };

        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: response.message,
            response
          }
        ]);
        return response;
      }

      const response = await askBusinessCopilot({
        message: text,
        context,
        history: messages.slice(-8).map((item) => ({
          role: item.role,
          content: item.content
        }))
      });

      if (response.mode === 'scenario' && response.scenarioIntent && startupDetails) {
        try {
          response.scenarioResult = runBusinessScenario(
            startupDetails,
            response.scenarioIntent
          );
          response.message = 'Scenario calculated using the current FFPRO plan as the baseline. Your saved plan has not been changed.';
        } catch (scenarioError: any) {
          const detail = scenarioError?.message || 'The scenario could not be calculated.';
          response.observations = [
            ...(response.observations || []),
            {
              severity: 'error',
              text: detail
            }
          ];
          response.message = `I understood the what-if request, but FFPRO could not run it: ${detail}`;
        }
      }

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
  }, [context, loading, messages, startupDetails]);

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
