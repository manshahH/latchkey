import { foldLicense, defaultRevokePolicy, type LicenseEvent } from "@latchkey/core";

export interface EventStore { events: LicenseEvent[]; processed: Set<string>; }
export const createEventStore = (): EventStore => ({ events: [], processed: new Set() });
export const processEvent = (store: EventStore, event: LicenseEvent, now: Date) => {
  if (store.processed.has(event.id)) return foldLicense(store.events, defaultRevokePolicy, now);
  store.processed.add(event.id);
  store.events.push(event);
  return foldLicense(store.events, defaultRevokePolicy, now);
};
