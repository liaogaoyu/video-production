function mediaUrl(id) {
  return id ? `/api/v1/media/${id}` : "";
}

function presentJob(row) {
  const input = JSON.parse(row.input_snapshot || row.inputSnapshot || "{}");
  const result = JSON.parse(row.result_json || row.resultJson || "{}");
  const hasCredit = result.creditKind === "preauthorized" && typeof result.creditAmount === "number" && Number.isFinite(result.creditAmount) && result.creditAmount >= 0;
  return {
    resubmittedJobId: result.resubmittedJobId || "",
    creditAmount: hasCredit ? result.creditAmount : null,
    creditKind: hasCredit ? result.creditKind : null,
    id: row.id,
    sourceId: row.source_id || row.sourceId,
    batchId: row.batch_id || row.batchId || "",
    kind: (row.kind === "video" || row.kind === "shot") ? "shot" : "asset",
    status: row.status === "succeeded" ? "done" : row.status,
    title: input.title || "",
    model: row.model || "",
    provider: row.provider || "",
    error: row.error_message || row.errorMessage || "",
    queueNote: row.queue_note || row.queueNote || "",
    video: (row.kind === "video" || row.kind === "shot") && (row.media_id || row.mediaId) ? mediaUrl(row.media_id || row.mediaId) : "",
    image: row.kind === "image" && (row.media_id || row.mediaId) ? mediaUrl(row.media_id || row.mediaId) : "",
    real: true,
    progress: 0,
    createdAt: row.created_at || row.createdAt,
    submittedAt: row.created_at || row.createdAt || null,
    completedAt: row.completed_at || row.completedAt || null,
    failedAt: row.failed_at || row.failedAt || null,
    accountId: row.account_id || row.accountId || "",
    submitId: row.remote_task_id || row.remoteTaskId || "",
  };
}

function presentAccount(row, session) {
  const identity = row.identity_status === "duplicate" ? "与其他别名重复" : row.identity_status === "confirmed" ? "" : "身份待确认";
  return {
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    cliAuthorized: Boolean(row.authorized),
    cliPermission: row.permission || "unknown",
    cliMessage: [row.message || (row.authorized ? "官方 CLI 已授权" : "等待官方 CLI 授权"), identity].filter(Boolean).join(" · "),
    totalCredit: row.total_credit,
    identityStatus: row.identity_status,
    checkedAt: row.checked_at,
    authPending: session?.status === "awaiting_user" || session?.status === "queued" || session?.status === "starting",
    authorizationUrl: session?.authorization_url || "",
  };
}

function presentProject(graph) {
  const project = graph.project;
  const mediaById = new Map(graph.mediaRows.map((item) => [item.id, item]));
  const versionsByAsset = new Map();
  for (const version of graph.versions) {
    const list = versionsByAsset.get(version.asset_id) || [];
    list.push(version);
    versionsByAsset.set(version.asset_id, list);
  }
  const refsByAsset = new Map();
  for (const reference of graph.references) {
    const list = refsByAsset.get(reference.asset_id) || [];
    list.push(reference);
    refsByAsset.set(reference.asset_id, list);
  }
  const assets = graph.assets.map((asset) => {
    const versions = (versionsByAsset.get(asset.id) || []).map((version) => ({
      id: version.id,
      image: mediaUrl(version.media_id),
      mediaId: version.media_id,
      prompt: version.prompt,
      source: version.source,
      createdAt: version.created_at,
      sha256: mediaById.get(version.media_id)?.sha256 || "",
    }));
    const selected = versions.find((version) => version.id === asset.selected_version_id) || null;
    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      description: asset.description,
      prompt: asset.prompt,
      externalKey: asset.external_key,
      revision: asset.revision,
      locked: Boolean(asset.locked_version_id),
      selectedVersionId: asset.selected_version_id || "",
      image: selected?.image || "",
      versions,
      references: (refsByAsset.get(asset.id) || []).map((reference) => ({
        id: reference.id,
        url: mediaUrl(reference.media_id),
        mediaId: reference.media_id,
        sha256: mediaById.get(reference.media_id)?.sha256 || "",
      })),
      uses: 0,
    };
  });
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const refsByShot = new Map();
  for (const reference of graph.shotRefs) {
    const list = refsByShot.get(reference.shot_id) || [];
    list.push(reference);
    refsByShot.set(reference.shot_id, list);
  }
  const shots = graph.shots.map((shot) => {
    const linked = (refsByShot.get(shot.id) || []).sort((left, right) => left.position - right.position);
    return {
      id: shot.id,
      externalKey: shot.external_key,
      episode: shot.episode,
      number: shot.number,
      title: shot.title,
      duration: shot.duration,
      prompt: shot.prompt,
      revision: shot.revision,
      refs: linked.map((item) => assetById.get(item.asset_id)?.name || ""),
      refKeys: linked.map((item) => assetById.get(item.asset_id)?.externalKey || ""),
      refAssetIds: linked.map((item) => item.asset_id),
    };
  });
  const jobs = graph.jobs.map(presentJob);
  const runningJobs = jobs.filter((job) => ["submitting", "remote_running", "downloading", "submit_unknown"].includes(job.status)).length;
  return {
    id: project.id,
    assetCommonPrompt: project.asset_common_prompt || '',
    name: project.name,
    description: project.description,
    style: project.style,
    ratio: project.ratio,
    revision: project.revision,
    scriptText: project.script_text,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    runningJobs,
    data: {
      settings: { ratio: project.ratio, concurrency: 2 },
      projectReferences: (graph.projectReferences || []).map(r => ({ id:r.id, mediaId:r.media_id, url:mediaUrl(r.media_id) })),
      assets,
      shots,
      jobs,
    },
  };
}

module.exports = { presentProject, presentJob, presentAccount, mediaUrl };
