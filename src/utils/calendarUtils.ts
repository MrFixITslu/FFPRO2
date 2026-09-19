import { CalendarItem } from '../types';

/**
 * Normalizes a CalendarItem, ensuring consistent Google Calendar markers and IDs.
 */
export function normalizeCalendarItem(item: CalendarItem): CalendarItem {
  const isGcal = Boolean(
    item.isGoogleCalendar ||
    item.googleEventId ||
    (typeof item.id === 'string' && item.id.startsWith('gcal-'))
  );

  let googleEventId = item.googleEventId;
  if (!googleEventId && typeof item.id === 'string' && item.id.startsWith('gcal-')) {
    googleEventId = item.id.replace(/^gcal-/, '');
  }

  return {
    ...item,
    id: String(item.id || ''),
    title: (item.title || '(No Title)').trim(),
    date: String(item.date || '').slice(0, 10),
    startTime: item.startTime ? String(item.startTime).trim() : undefined,
    type: item.type || 'meeting',
    recurring: item.recurring || 'none',
    completed: Boolean(item.completed),
    isGoogleCalendar: isGcal,
    googleEventId: googleEventId || undefined,
    hangoutLink: item.hangoutLink || undefined,
    htmlLink: item.htmlLink || undefined,
    location: item.location ? String(item.location).trim() : undefined,
    description: item.description ? String(item.description).trim() : undefined,
  };
}

/**
 * Deduplicates an array of CalendarItems.
 * 
 * An item is considered a duplicate if:
 * 1. It shares the same non-empty `id`.
 * 2. It shares the same non-empty `googleEventId`.
 * 3. It shares the exact same semantic identity: (lowercase title + date + startTime).
 * 
 * When duplicate entries are found, Google-linked information (hangoutLink, htmlLink, googleEventId)
 * and richer descriptions are preserved.
 */
export function deduplicateCalendarItems(items: CalendarItem[]): CalendarItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const seenIds = new Set<string>();
  const seenGoogleIds = new Set<string>();
  const seenSemanticKeys = new Map<string, number>(); // semanticKey -> index in uniqueList
  const uniqueList: CalendarItem[] = [];

  for (const rawItem of items) {
    if (!rawItem || !rawItem.title || !rawItem.date) {
      continue;
    }

    const item = normalizeCalendarItem(rawItem);
    const semKey = `${item.title.toLowerCase()}|${item.date}|${item.startTime || ''}`;

    // Check if we already have an item with the same Google Event ID
    if (item.googleEventId && seenGoogleIds.has(item.googleEventId)) {
      continue;
    }

    // Check if we already have an item with the exact same ID
    if (item.id && seenIds.has(item.id)) {
      continue;
    }

    // Check if we already have an item with the exact same semantic key (title + date + startTime)
    if (seenSemanticKeys.has(semKey)) {
      const existingIdx = seenSemanticKeys.get(semKey)!;
      const existing = uniqueList[existingIdx];

      // If the incoming item is from Google and the existing one is not, upgrade the existing one
      if (item.isGoogleCalendar && !existing.isGoogleCalendar) {
        uniqueList[existingIdx] = {
          ...existing,
          ...item,
          isGoogleCalendar: true,
          googleEventId: item.googleEventId || existing.googleEventId,
          hangoutLink: item.hangoutLink || existing.hangoutLink,
          htmlLink: item.htmlLink || existing.htmlLink,
          description: item.description || existing.description,
          location: item.location || existing.location,
        };
        if (item.googleEventId) seenGoogleIds.add(item.googleEventId);
        if (item.id) seenIds.add(item.id);
      } else if (!existing.description && item.description) {
        uniqueList[existingIdx] = {
          ...existing,
          description: item.description,
        };
      }
      continue;
    }

    // Register new unique item
    if (item.id) seenIds.add(item.id);
    if (item.googleEventId) seenGoogleIds.add(item.googleEventId);
    seenSemanticKeys.set(semKey, uniqueList.length);
    uniqueList.push(item);
  }

  return uniqueList;
}

/**
 * Merges local app calendar directives with incoming Google Calendar events.
 * 
 * Rules:
 * 1. Google events from previous sync cycles are replaced by the fresh incoming Google events.
 * 2. Manual local directives that do not correspond to any incoming Google event are retained.
 * 3. Any manual directive whose title + date + startTime matches an incoming Google event is
 *    merged so that Google video links/links are attached without creating duplicate rows.
 * 4. The final result is completely deduplicated.
 */
export function mergeAndDeduplicateCalendarItems(
  existingItems: CalendarItem[],
  incomingGoogleEvents: CalendarItem[]
): CalendarItem[] {
  const normalizedIncoming = (incomingGoogleEvents || []).map(normalizeCalendarItem);

  const incomingGoogleIds = new Set<string>();
  const incomingSemanticKeys = new Set<string>();

  for (const gEvent of normalizedIncoming) {
    if (gEvent.id) {
      incomingGoogleIds.add(gEvent.id);
      if (gEvent.id.startsWith('gcal-')) {
        incomingGoogleIds.add(gEvent.id.replace(/^gcal-/, ''));
      }
    }
    if (gEvent.googleEventId) {
      incomingGoogleIds.add(gEvent.googleEventId);
      incomingGoogleIds.add(`gcal-${gEvent.googleEventId}`);
    }
    const semKey = `${gEvent.title.toLowerCase()}|${gEvent.date}|${gEvent.startTime || ''}`;
    incomingSemanticKeys.add(semKey);
  }

  // Filter existing items to retain only true manual non-Google events that don't collide
  const retainedLocalItems = (existingItems || []).filter(item => {
    if (!item) return false;

    // Discard any existing item that was from Google Calendar (will be replaced by fresh incoming)
    const isGoogleItem = Boolean(
      item.isGoogleCalendar ||
      item.googleEventId ||
      (typeof item.id === 'string' && item.id.startsWith('gcal-')) ||
      (item.id && incomingGoogleIds.has(item.id)) ||
      (item.googleEventId && incomingGoogleIds.has(item.googleEventId))
    );

    if (isGoogleItem) {
      return false;
    }

    // Discard manual item if an incoming Google event has the identical semantic signature
    const semKey = `${(item.title || '').trim().toLowerCase()}|${(item.date || '').slice(0, 10)}|${item.startTime || ''}`;
    if (incomingSemanticKeys.has(semKey)) {
      return false;
    }

    return true;
  });

  return deduplicateCalendarItems([...retainedLocalItems, ...normalizedIncoming]);
}

/**
 * Expands recurring calendar items into occurrences for a specific month and year.
 * Prevents timezone shifting bugs by strictly formatting dates with local calendar arithmetic.
 */
export function expandRecurringCalendarItems(
  items: CalendarItem[],
  year: number,
  month: number,
  daysInMonth: number
): (CalendarItem & { isVirtual?: boolean })[] {
  const deduped = deduplicateCalendarItems(items);
  const result: (CalendarItem & { isVirtual?: boolean })[] = [];

  deduped.forEach(item => {
    if (!item.date) return;

    if (!item.recurring || item.recurring === 'none') {
      result.push({ ...item, isVirtual: false });
      return;
    }

    // Parse start date components deterministically without UTC conversion offset
    const [sYear, sMonth, sDay] = item.date.split('-').map(Number);
    if (!sYear || !sMonth || !sDay) {
      result.push({ ...item, isVirtual: false });
      return;
    }
    const startDate = new Date(sYear, sMonth - 1, sDay);

    for (let d = 1; d <= daysInMonth; d++) {
      const current = new Date(year, month, d);
      if (current < startDate) continue;

      let matches = false;
      if (item.recurring === 'daily') {
        matches = true;
      } else if (item.recurring === 'weekly' && current.getDay() === startDate.getDay()) {
        matches = true;
      } else if (item.recurring === 'monthly' && current.getDate() === startDate.getDate()) {
        matches = true;
      }

      if (matches) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isVirtual = dateStr !== item.date;
        result.push({
          ...item,
          id: isVirtual ? `${item.id}-rec-${d}` : item.id,
          date: dateStr,
          isVirtual,
        });
      }
    }
  });

  return result;
}
