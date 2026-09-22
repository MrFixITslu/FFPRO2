import type {
  BusinessCopilotContext,
  BusinessScenarioIntent
} from '../../shared/businessCopilotTypes';

function parseScenarioNumber(message: string): number | undefined {
  const toMatch = /\bto\s+(?:ec\$|us\$|\$)?\s*([\d,.]+)\s*([kKmM])?/i.exec(message);
  const matches = toMatch
    ? [toMatch[1], toMatch[2]]
    : (() => {
        const all = [...message.matchAll(/(?:ec\$|us\$|\$)?\s*([\d,.]+)\s*([kKmM])?/gi)];
        const last = all[all.length - 1];
        return last ? [last[1], last[2]] : [];
      })();

  if (!matches[0]) return undefined;

  let number = Number(String(matches[0]).replace(/,/g, ''));
  if (!Number.isFinite(number)) return undefined;

  const suffix = String(matches[1] || '').toLowerCase();
  if (suffix === 'k') number *= 1000;
  if (suffix === 'm') number *= 1000000;
  return number;
}

export function inferLocalBusinessScenarioIntent(
  message: string,
  context: BusinessCopilotContext
): BusinessScenarioIntent | undefined {
  const lower = message.toLowerCase();
  if (!/(what if|scenario|increase|decrease|raise|lower|change|set|double|halve|half|reduce|borrow|loan)/i.test(message)) {
    return undefined;
  }

  const service = (context.services || []).find((item) =>
    item.name && lower.includes(item.name.toLowerCase())
  );

  if (service) {
    let field:
      | 'rate'
      | 'expectedVolume'
      | 'unitsPerBooking'
      | 'monthlyGrowthRatePercent'
      | 'directCostPerUnitOrJob' = 'rate';

    if (/(volume|participants|sessions|bookings|events|packages|clients|guests)/i.test(message)) {
      field = 'expectedVolume';
    }
    if (/(growth|mom)/i.test(message)) {
      field = 'monthlyGrowthRatePercent';
    }
    if (/(pax|participants per booking|units per booking)/i.test(message)) {
      field = 'unitsPerBooking';
    }
    if (/(direct cost|unit cost|variable cost)/i.test(message)) {
      field = 'directCostPerUnitOrJob';
    }

    const current = Number(service[field] ?? 0);
    let value = parseScenarioNumber(message);

    if (/\bdouble\b/i.test(message)) value = current * 2;
    if (/\bhalve\b|\bhalf\b/i.test(message)) value = current / 2;

    if (Number.isFinite(value)) {
      return {
        title: `${service.name}: ${field} scenario`,
        summary: `Temporary what-if change for ${service.name}.`,
        changes: [{
          target: 'service',
          targetId: service.id,
          field,
          value: Number(value)
        }]
      };
    }
  }

  const cost = (context.costs || []).find((item) =>
    item.name && lower.includes(item.name.toLowerCase())
  );

  if (cost) {
    if (/(basis|per booking|per participant|per revenue unit)/i.test(message)) {
      const value = /per participant|per revenue unit/i.test(message)
        ? 'per_revenue_unit'
        : /per booking/i.test(message)
          ? 'per_booking'
          : undefined;

      if (value) {
        return {
          title: `${cost.name}: direct-cost basis scenario`,
          summary: `Temporary what-if change for ${cost.name}.`,
          changes: [{
            target: 'cost',
            targetId: cost.id,
            field: 'directCostBasis',
            value
          }]
        };
      }
    }

    const value = parseScenarioNumber(message);
    if (Number.isFinite(value)) {
      const field = /monthly|expense|overhead|salary|rent|utility/i.test(message)
        ? 'monthlyExpenseAmount'
        : 'directCostPerUnitOrJob';

      return {
        title: `${cost.name}: cost scenario`,
        summary: `Temporary what-if change for ${cost.name}.`,
        changes: [{
          target: 'cost',
          targetId: cost.id,
          field,
          value: Number(value)
        }]
      };
    }
  }

  if (/(borrow|loan)/i.test(message)) {
    const value = parseScenarioNumber(message);
    if (Number.isFinite(value)) {
      return {
        title: 'Loan amount scenario',
        summary: 'Temporary change to the planned loan amount.',
        changes: [{
          target: 'loan',
          field: 'loanAmount',
          value: Number(value)
        }]
      };
    }
  }

  const capacityValue = parseScenarioNumber(message);
  if (Number.isFinite(capacityValue)) {
    if (/(utilisation|utilization)/i.test(message)) {
      return {
        title: 'Target utilisation scenario',
        summary: 'Temporary change to equipment target utilisation.',
        changes: [{
          target: 'capacity',
          field: 'targetUtilisationPercent',
          value: Number(capacityValue)
        }]
      };
    }

    if (/(operating hours|hours per day)/i.test(message)) {
      return {
        title: 'Operating hours scenario',
        summary: 'Temporary change to equipment operating hours.',
        changes: [{
          target: 'capacity',
          field: 'operatingHoursPerDay',
          value: Number(capacityValue)
        }]
      };
    }

    if (/(systems|operating units|resource count)/i.test(message)) {
      return {
        title: 'Operating units scenario',
        summary: 'Temporary change to deployable operating units.',
        changes: [{
          target: 'capacity',
          field: 'resourceCount',
          value: Number(capacityValue)
        }]
      };
    }
  }

  return undefined;
}

export const __businessScenarioIntentTest = {
  parseScenarioNumber
};
