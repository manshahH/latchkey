export type GitHubFailure = "not_found" | "rate_limited" | "server_error";
export interface GitHubClient {
  invite(userId: bigint): void;
  remove(userId: bigint): void;
  observe(userId: bigint): "active" | "invited" | "none";
}
export class FakeGitHub implements GitHubClient {
  readonly calls: string[] = [];
  private readonly states = new Map<bigint, "active" | "invited">();
  private readonly failures = new Map<bigint, GitHubFailure>();
  public fail(userId: bigint, failure: GitHubFailure): void {
    this.failures.set(userId, failure);
  }
  public invite(userId: bigint): void {
    this.calls.push(`invite:${String(userId)}`);
    const failure = this.failures.get(userId);
    if (failure) throw new Error(failure);
    if (!this.states.has(userId)) this.states.set(userId, "invited");
  }
  public accept(userId: bigint): void {
    if (this.states.get(userId) === "invited") this.states.set(userId, "active");
  }
  public remove(userId: bigint): void {
    this.calls.push(`remove:${String(userId)}`);
    this.states.delete(userId);
  }
  public observe(userId: bigint): "active" | "invited" | "none" {
    return this.states.get(userId) ?? "none";
  }
}
