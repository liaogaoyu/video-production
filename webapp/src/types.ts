export interface Asset {
  id: string;
  name: string;
  type: string;
  description: string;
  prompt: string;
  externalKey: string;
  revision: number;
  image: string;
  locked: boolean;
  selectedVersionId: string;
  versions: { id: string; image: string; createdAt: string; prompt: string }[];
  references: { id: string; mediaId: string; url: string }[];
}
export interface Episode {
  id: string;
  key: string;
  number: number;
  title: string;
  summary: string;
  body: string;
  status: "draft" | "ready" | "archived";
  revision: number;
}
export interface Shot {
  id: string;
  title: string;
  prompt: string;
  episode: number;
  episodeId: string;
  number: number;
  duration: number;
  revision: number;
  externalKey: string;
  refs: string[];
  refAssetIds: string[];
}
export interface Job {
  id: string;
  sourceId: string;
  batchId: string;
  kind: "asset" | "shot";
  status: string;
  title: string;
  model: string;
  provider: string;
  error: string;
  queueNote: string;
  video: string;
  image: string;
  submitId: string;
  resubmittedJobId: string;
  billing?: {
    reserved: number;
    charged: number;
    due: number;
    actualAmount: number | null;
    status: string;
    basis: string;
  };
  submittedAt: string;
  createdAt: string;
  completedAt: string;
  failedAt: string;
}
export interface Project {
  id: string;
  name: string;
  assetCommonPrompt: string;
  description: string;
  style: string;
  revision: number;
  ratio: string;
  synopsis: string;
  scriptText: string;
  runningJobs: number;
  data: {
    settings: { ratio: string };
    episodes: Episode[];
    projectReferences?: { id: string; mediaId: string; url: string }[];
    assets: Asset[];
    shots: Shot[];
    jobs: Job[];
  };
}
export interface Account {
  id: string;
  name: string;
  enabled: boolean;
  cliAuthorized: boolean;
  cliMessage: string;
  totalCredit: number | null;
  authorized: boolean;
  region: string;
  error: string;
  maxConcurrent: number;
  complianceConfirmed?: boolean | null;
  checkedAt: string;
}
export interface User {
  id: string;
  username: string;
  email?: string;
  role?: "admin" | "user";
}
