import { z } from "zod";

/**
 * Only the fields Latchkey actually reads are modeled explicitly. `.passthrough()` keeps every
 * other shadcn registry-item.json field (cssVars, tailwind, author, ...) exactly as the seller
 * wrote it, so this stays compatible with the full schema without re-modeling it here.
 * https://ui.shadcn.com/docs/registry/registry-item-json
 */
const RegistryFileSourceSchema = z
  .object({
    path: z.string().min(1),
    type: z.string().min(1),
    target: z.string().optional()
  })
  .passthrough();

const RegistryItemSourceSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    files: z.array(RegistryFileSourceSchema).min(1)
  })
  .passthrough();

export const RegistryManifestSchema = z.object({
  $schema: z.string().optional(),
  homepage: z.string().optional(),
  items: z.array(RegistryItemSourceSchema).min(1),
  name: z.string().optional()
});

export type RegistryManifest = z.infer<typeof RegistryManifestSchema>;
export type RegistryItemSource = z.infer<typeof RegistryItemSourceSchema>;
export type RegistryFileSource = z.infer<typeof RegistryFileSourceSchema>;

export interface BuiltRegistryFile extends RegistryFileSource {
  content: string;
}
export type BuiltRegistryItem = Record<string, unknown> & {
  $schema: string;
  files: BuiltRegistryFile[];
  name: string;
  type: string;
};
export type BuildRegistryItemResult =
  { item: BuiltRegistryItem } | { error: { path: string; reason: "missing_file" } };

const registryItemSchemaUrl = "https://ui.shadcn.com/schema/registry-item.json";

/** A malformed registry.json is never partially trusted: parse succeeds fully or returns null. */
export const parseRegistryManifest = (raw: string): RegistryManifest | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = RegistryManifestSchema.safeParse(parsed);
  return result.success ? result.data : null;
};

/**
 * Embeds each file's fetched content into the source item, producing the shape a served
 * registry-item.json needs (architecture 11.1). A file the manifest lists but that was not
 * fetched is a hard error: a registry item is never served with a silently missing file.
 */
export const buildRegistryItem = (
  source: RegistryItemSource,
  fileContents: ReadonlyMap<string, string>
): BuildRegistryItemResult => {
  const files: BuiltRegistryFile[] = [];
  for (const file of source.files) {
    const content = fileContents.get(file.path);
    if (content === undefined) return { error: { path: file.path, reason: "missing_file" } };
    files.push({ ...file, content });
  }
  const rest: Record<string, unknown> = { ...source };
  delete rest.files;
  return { item: { $schema: registryItemSchemaUrl, ...rest, files } as BuiltRegistryItem };
};
