import { randomUUID } from "node:crypto";

export type TestSeller = Readonly<{
  id: string;
  slug: string;
}>;

export const createTestSeller = (overrides: Partial<TestSeller> = {}): TestSeller => ({
  id: overrides.id ?? randomUUID(),
  slug: overrides.slug ?? "test-seller"
});
