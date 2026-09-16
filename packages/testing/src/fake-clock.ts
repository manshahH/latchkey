export class FakeClock {
  private currentTime: Date;

  public constructor(startTime: Date) {
    this.currentTime = new Date(startTime);
  }

  public advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60_000);
  }

  public now(): Date {
    return new Date(this.currentTime);
  }
}
