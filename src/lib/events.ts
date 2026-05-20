import type { CollectionEntry } from 'astro:content';

export type EventEntry = CollectionEntry<'events'>;

export function eventDate(event: EventEntry): Date {
  return new Date(`${event.data.date}T12:00:00`);
}

export function formatEventDate(event: EventEntry): string {
  return eventDate(event).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function eventMonth(event: EventEntry): string {
  return eventDate(event).toLocaleDateString('en-US', { month: 'short' });
}

export function eventDay(event: EventEntry): string {
  return eventDate(event).toLocaleDateString('en-US', { day: '2-digit' });
}

export function sortUpcoming(events: EventEntry[]): EventEntry[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return events
    .filter((event) => event.data.status !== 'past' && eventDate(event) >= now)
    .sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime());
}

export function sortPast(events: EventEntry[]): EventEntry[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return events
    .filter((event) => event.data.status === 'past' || eventDate(event) < now)
    .sort((a, b) => eventDate(b).getTime() - eventDate(a).getTime());
}
