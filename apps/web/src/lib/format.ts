const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

/** "28 Sep 2026". Always UTC so the server and the browser render the same text. */
export const formatDate = (value: Date | string): string => {
  const date = toDate(value);
  return `${String(date.getUTCDate())} ${months[date.getUTCMonth()] ?? ""} ${String(date.getUTCFullYear())}`;
};

/** "14:02", UTC. */
export const formatTime = (value: Date | string): string => {
  const date = toDate(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
};

/** Short, human relative time for lists. `now` is passed in so rendering is deterministic. */
export const formatRelative = (value: Date | string, now: Date): string => {
  const seconds = Math.round((now.getTime() - toDate(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${String(days)} days ago`;
  return formatDate(value);
};

export const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

/** GitHub handles are shown with an @, whatever the stored form. */
export const handle = (login: string): string => `@${login.replace(/^@+/, "")}`;
