import { expect, test } from "vitest";
import { LicenseEventSchema } from "@latchkey/core";
import { createEventStore, processEvent } from "./index.js";
test("processes a normalized event once", () => { const event = LicenseEventSchema.parse({ id:"e", occurredAt:new Date(), receivedAt:new Date(), type:"PaymentSucceeded", data:{kind:"one_time",updatesUntil:null} }); const store=createEventStore(); expect(processEvent(store,event,new Date()).status).toBe("active"); processEvent(store,event,new Date()); expect(store.events).toHaveLength(1); });
