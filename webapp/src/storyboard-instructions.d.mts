import type { Project } from "./types";
export const shotTemplate: {
  schemaVersion: number;
  kind: string;
  shots: { key: string; episode: number; number: number; title: string; duration: number; prompt: string; refs: { assetKey: string }[] }[];
};
export function buildShotInstructions(skillSource: string, project?: Project | null): string;
