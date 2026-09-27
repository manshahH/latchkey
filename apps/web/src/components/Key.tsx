const hash = (value: string): number => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

/** Deterministic cut depths, so the same seed always draws the same key. */
export const keyCuts = (seed: string): number[] =>
  Array.from({ length: 6 }, (_, index) => 1 + (hash(`${seed}:${String(index)}`) % 6));

const bladePath = (cuts: number[]): string => {
  let path = "M31,13 ";
  cuts.forEach((depth, index) => {
    const x = 40 + index * 11.5;
    path += `L${String(x - 4.5)},13 L${String(x)},${String(13 + depth * 1.6)} L${String(x + 4.5)},13 `;
  });
  return `${path}L109,13 L116,20 L109,27 L31,27 Z`;
};

const bowPath = "M3,20a14,14 0 1,0 28,0a14,14 0 1,0 -28,0 M12,20a5,5 0 1,0 10,0a5,5 0 1,0 -10,0";

export interface KeyProps {
  seed: string;
  width?: number;
  filled?: boolean;
  className?: string;
  label?: string;
}

/** The Latchkey mark. Each license can draw its own key from its id. */
export function Key({ seed, width = 120, filled = true, className, label }: KeyProps) {
  const style = {
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinejoin: "round" as const
  };
  return (
    <svg
      viewBox="0 0 120 40"
      width={width}
      height={(width / 120) * 40}
      className={className}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <path d={bowPath} fillRule="evenodd" style={style} />
      <path d={bladePath(keyCuts(seed))} style={style} />
    </svg>
  );
}
