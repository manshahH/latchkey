import { PostgreSqlContainer } from "@testcontainers/postgresql";

export type TestPostgres = Readonly<{
  databaseUrl: string;
  stop: () => Promise<void>;
}>;

export const startPostgres = async (): Promise<TestPostgres> => {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("latchkey")
    .withPassword("latchkey")
    .withUsername("latchkey")
    .start();

  return {
    databaseUrl: container.getConnectionUri(),
    stop: async (): Promise<void> => {
      await container.stop();
    }
  };
};
