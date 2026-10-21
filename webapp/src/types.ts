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
  references: { id: string; url: string; mediaId: string }[];
}
export interface Shot {
  id: string;
  title: string;
  prompt: string;
  episode: number;
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
  submittedAt: string;
  createdAt: string;
  completedAt: string;
  failedAt: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  style: string;
  revision: number;
  ratio: string;
  runningJobs: number;
  data: {
    settings: { ratio: string };
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
  checkedAt: string;
}
export interface User {
  id: string;
  username: string;
}
