import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiNewsBriefing } from '../server/services/aiNewsService.js';

test('AI News Service produces structured briefing and categorized articles', async () => {
  const data = await getAiNewsBriefing(true);

  assert.ok(data, 'News data object should be defined');
  assert.ok(data.briefing, 'Briefing section should exist');
  assert.ok(typeof data.briefing.summary === 'string', 'Briefing summary should be a string');
  assert.ok(data.briefing.summary.length > 20, 'Briefing summary should contain substantial content');
  assert.ok(Array.isArray(data.briefing.takeaways), 'Takeaways should be an array');
  assert.ok(Array.isArray(data.articles), 'Articles should be an array');
  assert.ok(data.articles.length > 0, 'Articles list should not be empty');

  // Verify article schema
  const first = data.articles[0];
  assert.ok(first.title, 'Article must have a title');
  assert.ok(first.link, 'Article must have a link');
  assert.ok(first.source, 'Article must have a source');
  assert.ok(first.player, 'Article must have a classified AI player');
  assert.ok(first.category, 'Article must have a classified category');

  // Verify playerStats counts
  assert.ok(data.playerStats, 'playerStats object should exist');
  assert.equal(typeof data.playerStats.OpenAI, 'number');
  assert.equal(typeof data.playerStats.Anthropic, 'number');
});
