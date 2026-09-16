import type { Sql } from "postgres";

type JsonPayload = Parameters<Sql["json"]>[0];

export interface StoredEvent { id: string; sellerId: string; source: string; externalEventId: string; type: string; payload: JsonPayload; }
export const storeExternalEvent = async (sql: Sql, event: StoredEvent): Promise<boolean> => {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO external_events (id, seller_id, source, external_event_id, type, payload)
    VALUES (${event.id}::uuid, ${event.sellerId}::uuid, ${event.source}, ${event.externalEventId}, ${event.type}, ${sql.json(event.payload)})
    ON CONFLICT (source, external_event_id) DO NOTHING
    RETURNING id
  `;
  return rows.length === 1;
};
