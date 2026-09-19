import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicateCalendarItems,
  mergeAndDeduplicateCalendarItems,
  expandRecurringCalendarItems,
} from '../src/utils/calendarUtils.ts';
import { CalendarItem } from '../src/types.ts';

test('deduplicateCalendarItems removes identical IDs and Google IDs', () => {
  const items: CalendarItem[] = [
    { id: '1', title: 'Sprint Review', date: '2026-09-20', type: 'meeting', recurring: 'none', completed: false },
    { id: '1', title: 'Sprint Review', date: '2026-09-20', type: 'meeting', recurring: 'none', completed: false },
    { id: 'gcal-abc', googleEventId: 'abc', title: 'Board Call', date: '2026-09-21', type: 'meeting', recurring: 'none', completed: false },
    { id: 'diff-id', googleEventId: 'abc', title: 'Board Call', date: '2026-09-21', type: 'meeting', recurring: 'none', completed: false },
  ];

  const deduped = deduplicateCalendarItems(items);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].id, '1');
  assert.equal(deduped[1].googleEventId, 'abc');
});

test('deduplicateCalendarItems merges duplicate semantic entries and upgrades Google details', () => {
  const localItem: CalendarItem = {
    id: 'local-1',
    title: 'Financial Strategy',
    date: '2026-09-25',
    startTime: '10:00',
    type: 'meeting',
    recurring: 'none',
    completed: false,
    description: 'Internal strategy discussion',
  };

  const gcalItem: CalendarItem = {
    id: 'gcal-event-99',
    googleEventId: 'event-99',
    title: 'Financial Strategy',
    date: '2026-09-25',
    startTime: '10:00',
    type: 'meeting',
    recurring: 'none',
    completed: false,
    isGoogleCalendar: true,
    hangoutLink: 'https://meet.google.com/xyz-abc',
    htmlLink: 'https://calendar.google.com/event?id=99',
  };

  const deduped = deduplicateCalendarItems([localItem, gcalItem]);
  assert.equal(deduped.length, 1);
  const merged = deduped[0];
  assert.equal(merged.title, 'Financial Strategy');
  assert.equal(merged.isGoogleCalendar, true);
  assert.equal(merged.hangoutLink, 'https://meet.google.com/xyz-abc');
  assert.equal(merged.description, 'Internal strategy discussion');
});

test('mergeAndDeduplicateCalendarItems cleanly replaces stale Google events without duplicating manual ones', () => {
  const initialSchedule: CalendarItem[] = [
    { id: 'manual-1', title: 'Pay Payroll Tax', date: '2026-09-15', type: 'reminder', recurring: 'none', completed: false },
    { id: 'gcal-old', googleEventId: 'old-event', title: 'Old Google Meeting', date: '2026-09-18', type: 'meeting', recurring: 'none', completed: false, isGoogleCalendar: true },
  ];

  const freshGoogleEvents: CalendarItem[] = [
    { id: 'gcal-fresh', googleEventId: 'fresh-event', title: 'Q3 Budget Sign-off', date: '2026-09-22', type: 'meeting', recurring: 'none', completed: false, isGoogleCalendar: true },
  ];

  // Perform first sync
  const syncedOnce = mergeAndDeduplicateCalendarItems(initialSchedule, freshGoogleEvents);
  assert.equal(syncedOnce.length, 2);
  assert.ok(syncedOnce.some(i => i.id === 'manual-1'));
  assert.ok(syncedOnce.some(i => i.googleEventId === 'fresh-event'));
  assert.ok(!syncedOnce.some(i => i.googleEventId === 'old-event'));

  // Perform second sync with same Google events — MUST NOT DUPLICATE!
  const syncedTwice = mergeAndDeduplicateCalendarItems(syncedOnce, freshGoogleEvents);
  assert.equal(syncedTwice.length, 2);

  // Perform third sync with same Google events — MUST NOT DUPLICATE!
  const syncedThrice = mergeAndDeduplicateCalendarItems(syncedTwice, freshGoogleEvents);
  assert.equal(syncedThrice.length, 2);
});

test('expandRecurringCalendarItems formats local dates without timezone offsets', () => {
  const items: CalendarItem[] = [
    {
      id: 'rec-1',
      title: 'Weekly Standup',
      date: '2026-09-02', // Wednesday
      type: 'meeting',
      recurring: 'weekly',
      completed: false,
    },
  ];

  // September 2026 has 30 days. Wednesdays are Sep 2, 9, 16, 23, 30
  const expanded = expandRecurringCalendarItems(items, 2026, 8, 30);
  assert.equal(expanded.length, 5);
  assert.equal(expanded[0].date, '2026-09-02');
  assert.equal(expanded[1].date, '2026-09-09');
  assert.equal(expanded[2].date, '2026-09-16');
  assert.equal(expanded[3].date, '2026-09-23');
  assert.equal(expanded[4].date, '2026-09-30');
});
