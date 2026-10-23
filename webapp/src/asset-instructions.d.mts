import type { Project } from "./types";
export const assetTemplate: {
  schemaVersion: number; kind: string;
  assets: {key:string;name:string;type:string;description:string;prompt:string}[];
};
export function buildAssetInstructions(skillSource: string, project?: Project | null): string;

export const assetInstructionVersion: string;
