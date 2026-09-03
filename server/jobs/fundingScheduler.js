import cron from 'node-cron';
import { runDiscovery, processNextBatch } from '../services/fundingResearch.js';

// Nightly by default (2 AM server time) — a low-traffic window on a small
// host, and funding pages don't change often enough to need more than
// daily discovery.
const SCHEDULE = process.env.FUNDING_RESEARCH_SCHEDULE || '0 2 * * *';
const MAX_URLS_PER_RUN = parseInt(process.env.FUNDING_RESEARCH_MAX_URLS_PER_RUN || '15', 10);
// Hard ceiling on how long one nightly run is allowed to keep draining the
// queue, so a large backlog can't monopolize the small host indefinitely —
// remaining jobs simply pick up on the next scheduled run.
const MAX_RUN_MINUTES = parseInt(process.env.FUNDING_RESEARCH_MAX_RUN_MINUTES || '45', 10);

let isRunning = false;

async function runFullResearchCycle() {
  if (isRunning) {
    console.warn('[funding-research] Previous cycle still running — skipping this trigger.');
    return;
  }
  isRunning = true;
  const startedAt = Date.now();
  console.log('[funding-research] Starting research cycle...');

  try {
    await runDiscovery({ maxUrlsPerRun: MAX_URLS_PER_RUN });

    // Drain the queue in small batches until it's empty, Ollama goes down,
    // or the time budget is exhausted — whichever comes first.
    while (Date.now() - startedAt < MAX_RUN_MINUTES * 60 * 1000) {
      const { processed, ollamaDown } = await processNextBatch({ batchSize: 5 });
      if (ollamaDown) break;
      if (processed === 0) break; // queue drained
    }
  } catch (err) {
    console.error('[funding-research] Research cycle error:', err?.message);
  } finally {
    isRunning = false;
    console.log(`[funding-research] Cycle finished in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }
}

export function startFundingResearchScheduler() {
  if (!process.env.TAVILY_API_KEY) {
    console.warn('[funding-research] TAVILY_API_KEY not set — scheduler will run but discovery will find nothing until it is configured.');
  }
  cron.schedule(SCHEDULE, () => {
    runFullResearchCycle();
  });
  console.log(`[funding-research] Scheduler started (schedule: "${SCHEDULE}").`);
}

// Exposed for the manual-trigger API endpoint.
export { runFullResearchCycle };
