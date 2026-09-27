import { describe, expect, it } from "vitest";

import { buildRegistryItem, parseRegistryManifest, RegistryManifestSchema } from "./registry.js";

describe("parseRegistryManifest", () => {
  it("parses a minimal valid registry.json", () => {
    const manifest = parseRegistryManifest(
      JSON.stringify({
        items: [
          {
            name: "widget",
            type: "registry:component",
            files: [{ path: "widget.tsx", type: "registry:component" }]
          }
        ]
      })
    );
    expect(manifest?.items).toHaveLength(1);
  });

  it("returns null for invalid JSON text, not a thrown error", () => {
    expect(parseRegistryManifest("{not json")).toBeNull();
  });

  it("returns null when items is missing or empty", () => {
    expect(parseRegistryManifest(JSON.stringify({}))).toBeNull();
    expect(parseRegistryManifest(JSON.stringify({ items: [] }))).toBeNull();
  });

  it("keeps unmodeled shadcn fields (cssVars, author) through passthrough", () => {
    const manifest = parseRegistryManifest(
      JSON.stringify({
        items: [
          {
            name: "widget",
            type: "registry:component",
            author: "seller",
            cssVars: { light: { background: "white" } },
            files: [{ path: "widget.tsx", type: "registry:component" }]
          }
        ]
      })
    );
    expect(manifest?.items[0]).toMatchObject({
      author: "seller",
      cssVars: { light: { background: "white" } }
    });
  });
});

describe("buildRegistryItem", () => {
  const source = RegistryManifestSchema.parse({
    items: [
      {
        name: "widget",
        type: "registry:component",
        title: "Widget",
        files: [
          { path: "widget.tsx", type: "registry:component" },
          { path: "widget.css", type: "registry:file", target: "styles/widget.css" }
        ]
      }
    ]
  }).items[0];
  if (source === undefined) throw new Error("test fixture is missing its item");

  it("embeds fetched content into every file and adds the shadcn schema url", () => {
    const result = buildRegistryItem(
      source,
      new Map([
        ["widget.tsx", "export const Widget = () => null;"],
        ["widget.css", ".widget { color: red; }"]
      ])
    );
    expect(result).toEqual({
      item: {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: "widget",
        type: "registry:component",
        title: "Widget",
        files: [
          {
            path: "widget.tsx",
            type: "registry:component",
            content: "export const Widget = () => null;"
          },
          {
            path: "widget.css",
            type: "registry:file",
            target: "styles/widget.css",
            content: ".widget { color: red; }"
          }
        ]
      }
    });
  });

  it("errors on the specific missing file instead of silently omitting or serving partial content", () => {
    const result = buildRegistryItem(
      source,
      new Map([["widget.tsx", "export const Widget = () => null;"]])
    );
    expect(result).toEqual({ error: { path: "widget.css", reason: "missing_file" } });
  });
});
