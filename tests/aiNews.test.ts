import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterSimilarArticles, buildSubstantiveParagraphSummary } from '../server/services/aiNewsService.js';

test('buildSubstantiveParagraphSummary matches heading context accurately', () => {
  const summary = buildSubstantiveParagraphSummary({
    title: 'Nvidia CEO Jensen Huang says there is a "0% chance" AI will end the world',
    rawDesc: '',
    source: 'Moneywise',
    entity: 'Nvidia',
    category: 'Analysis',
    topic: 'ai',
    publishedAt: new Date().toISOString()
  });

  assert.ok(typeof summary === 'string');
  assert.ok(summary.length > 100, 'Summary must be substantive and deep');
  // Verify it directly addresses the existential risk / 0% chance statement
  assert.ok(/existential|extinction|risk|huang|0%|chance|world/i.test(summary), 'Summary must directly address headline topic');
  // Ensure it does not repeat headline verbatim
  assert.ok(!summary.startsWith('Nvidia CEO Jensen Huang says there is a "0% chance"'));
});

test('clusterSimilarArticles groups similar stories and generates combined summaries with links', async () => {
  const mockArticles = [
    {
      id: 'art-1',
      title: 'Nvidia CEO Jensen Huang says there is a 0% chance AI will end the world',
      link: 'https://moneywise.com/article-1',
      source: 'Moneywise',
      snippet: 'Huang addressed artificial intelligence alignment and safety at a recent keynote.',
      player: 'Nvidia',
      category: 'Analysis',
      topic: 'ai'
    },
    {
      id: 'art-2',
      title: 'AI Safety Researchers debate existential risk guidelines and pre-deployment testing',
      link: 'https://bloomberg.com/article-2',
      source: 'Bloomberg',
      snippet: 'Researchers call for rigorous pre-deployment verification across frontier neural networks.',
      player: 'Safety Group',
      category: 'Safety',
      topic: 'ai'
    },
    {
      id: 'art-3',
      title: 'OpenAI unveils o3 reasoning benchmark evaluation results',
      link: 'https://openai.com/blog/o3',
      source: 'OpenAI Blog',
      snippet: 'New test-time compute benchmarks reveal unprecedented competitive programming scores.',
      player: 'OpenAI',
      category: 'Model Release',
      topic: 'ai'
    }
  ];

  const groups = await clusterSimilarArticles(mockArticles, 'ai');

  assert.ok(Array.isArray(groups), 'Groups must be an array');
  assert.ok(groups.length >= 2, 'Should cluster into distinct topical themes');

  // Find the Safety / Existential Risk group
  const safetyGroup = groups.find(g => g.theme.includes('Safety') || g.theme.includes('Existential'));
  assert.ok(safetyGroup, 'Safety group should exist');
  assert.ok(safetyGroup.articles.length >= 2, 'Safety group should cluster the 2 related safety stories');
  assert.ok(safetyGroup.combinedSummary.length > 50, 'Combined summary should be generated');
  assert.ok(safetyGroup.sources.includes('Moneywise'), 'Sources list should include Moneywise');
  assert.ok(safetyGroup.sources.includes('Bloomberg'), 'Sources list should include Bloomberg');

  // Verify links to individual stories are preserved
  const linkedUrls = safetyGroup.articles.map(a => a.link);
  assert.ok(linkedUrls.includes('https://moneywise.com/article-1'));
  assert.ok(linkedUrls.includes('https://bloomberg.com/article-2'));
});
