import { Tag } from "antd";
import type { Asset, Shot } from "./types";

/** A repeated mention in the prompt still represents one referenced asset. */
export function ReferenceTags({ shot, assets }: {
  shot: Pick<Shot, "refs" | "refAssetIds">;
  assets: Asset[];
}) {
  const seen = new Set<string>();
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  return <>{shot.refs.map((name, index) => {
    const id = shot.refAssetIds[index];
    const key = id || `name:${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return <Tag key={key} color={byId.get(id)?.locked ? "blue" : "orange"}>@{name}</Tag>;
  })}</>;
}
