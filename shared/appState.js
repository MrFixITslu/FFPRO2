export function validateAppState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'Invalid data format.';
  }
  
  // Basic structure validation
  if (data.transactions && !Array.isArray(data.transactions)) {
    return 'Transactions must be an array.';
  }
  if (data.recurringExpenses && !Array.isArray(data.recurringExpenses)) {
    return 'Recurring expenses must be an array.';
  }
  if (data.recurringIncomes && !Array.isArray(data.recurringIncomes)) {
    return 'Recurring incomes must be an array.';
  }
  if (data.savingGoals && !Array.isArray(data.savingGoals)) {
    return 'Saving goals must be an array.';
  }
  if (data.investmentGoals && !Array.isArray(data.investmentGoals)) {
    return 'Investment goals must be an array.';
  }
  if (data.contacts && !Array.isArray(data.contacts)) {
    return 'Contacts must be an array.';
  }
  if (data.events && !Array.isArray(data.events)) {
    return 'Events must be an array.';
  }
  if (data.categoryBudgets && typeof data.categoryBudgets !== 'object') {
    return 'Category budgets must be an object.';
  }
  if (data.bankConnections && !Array.isArray(data.bankConnections)) {
    return 'Bank connections must be an array.';
  }
  if (data.investments && !Array.isArray(data.investments)) {
    return 'Investments must be an array.';
  }
  if (data.calendarItems && !Array.isArray(data.calendarItems)) {
    return 'Calendar items must be an array.';
  }
  if (data.ideas && !Array.isArray(data.ideas)) {
    return 'Ideas must be an array.';
  }
  if (data.forecastSettings && typeof data.forecastSettings !== 'object') {
    return 'Forecast settings must be an object.';
  }
  
  const collections = ['transactions','recurringExpenses','recurringIncomes','savingGoals','investmentGoals','contacts','events','investments','calendarItems','ideas','financialLogs'];
  for(const key of collections) {
    if(data[key] === undefined) continue;
    if(!Array.isArray(data[key]) || data[key].length>50000) return `${key} must be a bounded array.`;
    const ids=new Set();
    for(const item of data[key]) {
      const idStr = item?.id !== undefined && item?.id !== null ? String(item.id).trim() : '';
      if(!item || typeof item!=='object' || (typeof item.id!=='string' && typeof item.id!=='number') || !idStr || idStr.length>200 || ids.has(idStr)) return `${key} contains invalid or duplicate identifiers.`;
      ids.add(idStr);
    }
  }
  if(data.bankConnections && (data.bankConnections.length>1000 || data.bankConnections.some(x=>!x || typeof x.institution!=='string' || !Number.isFinite(x.openingBalance)))) return 'Invalid manual accounts.';
  for(const item of data.transactions || []) {
    if(typeof item.amount!=='number' || !Number.isFinite(item.amount) || item.amount<0 || item.amount>1e12) return 'Transaction amounts must be finite non-negative numbers.';
    if(!['income','expense','transfer','savings','withdrawal'].includes(item.type)) return 'Invalid transaction type.';
    if(typeof item.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(item.date))) return 'Invalid transaction date.';
  }
  if(data.cashOpeningBalance!==undefined && (typeof data.cashOpeningBalance!=='number' || !Number.isFinite(data.cashOpeningBalance))) return 'Invalid opening balance.';
  return null;
}

