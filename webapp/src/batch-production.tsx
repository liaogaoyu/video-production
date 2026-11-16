import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, Checkbox, Input, Space, Tag, Typography } from "antd";
import { api, copy, id } from "./api";
import { useWorkspace } from "./context";
import { EpisodeFinalVideo } from "./episode-final-video";
import { downloadExport } from "./project-export";

const example = () => {
  const key = id();
  return JSON.stringify({
  schemaVersion: 2,
  kind: "storyboard",
  episodes: [{
    key,
    title: "退休第一天",
    shots: [{ key: key + "-01", title: "拎着饭盒出门", duration: 15, prompt: "填写镜头提示词、台词和 @资产名" }],
  }],
}, null, 2);
};

type ImportResult = {
  preview: { key: string; action: "create" | "update" }[];
  episodes: { id: string; title: string }[];
};

type QueueTask = { shot_id: string; state: string };

export default function BatchProductionPage() {
  const { project, go, user, refreshProject } = useWorkspace();
  const { message } = App.useApp();
  const projectId = project!.id;
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<ImportResult>();
  const [selected, setSelected] = useState<string[]>([]);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [online, setOnline] = useState<boolean>();
  const [quota, setQuota] = useState<number>();
  const [busy, setBusy] = useState("");
  const [publicationEpisode, setPublicationEpisode] = useState("");
  const [finalEpisode, setFinalEpisode] = useState("");
  const [error, setError] = useState("");
  const queueRequest = useRef({ signature: "", key: "" });
  const admin = !user || user.role === "admin";

  useEffect(() => {
    if (!admin) return;
    let live = true;
    let polling = false;
    let finished = "";
    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const queue = await api<{
          active: QueueTask[]; waiting: QueueTask[]; recent: Array<QueueTask & { id: string }>;
          worker: { online: boolean }; quota?: { available: number };
        }>("doubao-local/queue");
        if (!live) return;
        setTasks([...queue.active, ...queue.waiting, ...queue.recent]);
        setOnline(queue.worker.online);
        setQuota(queue.quota?.available);
        const next = queue.recent.filter(task => task.state === "succeeded").map(task => task.id).sort().join(",");
        if (next !== finished) {
          await refreshProject();
          finished = next;
        }
      } catch {
        if (live) { setOnline(undefined); setQuota(undefined); }
      } finally { polling = false; }
    }
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [admin, refreshProject]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError("");
    try { await fn(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }

  async function importBatch(commit: boolean) {
    await run("import", async () => {
      if (!commit) setPreview(undefined);
      let body;
      try { body = JSON.parse(source); }
      catch { throw Error("JSON 格式有误，请检查引号和逗号"); }
      if (body?.schemaVersion !== 2 || body.kind !== "storyboard" ||
          !Array.isArray(body.episodes) || !body.episodes.length ||
          body.episodes.some((episode: { shots?: unknown[] } | null) => !Array.isArray(episode?.shots) || !episode.shots.length)) {
        throw Error("请使用批量分镜 JSON 格式，每集至少包含一镜");
      }
      const result = await api<ImportResult>(`projects/${projectId}/shots/import`, "POST", {
        ...body, mode: commit ? "commit" : "preview",
      });
      if (commit) {
        setPreview(undefined);
        setSelected(result.episodes.map(episode => episode.id));
        await refreshProject();
        message.success(`已保存 ${result.episodes.length} 集`);
      } else setPreview(result);
    });
  }

  const rows = project!.data.episodes.map(episode => {
    const shots = project!.data.shots.filter(shot => shot.episodeId === episode.id);
    const complete = shots.filter(shot => project!.data.jobs.some(job =>
      job.sourceId === shot.id && job.status === "done" && job.video));
    const waiting = shots.filter(shot => {
      const task = tasks.find(item => item.shot_id === shot.id);
      return task && !["succeeded", "failed", "cancelled"].includes(task.state);
    });
    const missing = shots.filter(shot => !complete.includes(shot) && !waiting.includes(shot));
    return { episode, shots, complete, waiting, missing };
  }).reverse();
  const ids = rows.filter(row => selected.includes(row.episode.id)).flatMap(row => row.missing.map(shot => shot.id));

  async function enqueue() {
    await run("queue", async () => {
      const signature = ids.join(",");
      if (queueRequest.current.signature !== signature) queueRequest.current = { signature, key: id() };
      const result = await api<{ taskIds: string[]; skipped: string[] }>("doubao-local/batches", "POST", { projectId, shotIds: ids, requestKey: queueRequest.current.key });
      setTasks(current => [...ids.filter(shotId => !result.skipped.includes(shotId)).map(shot_id => ({ shot_id, state: "queued" })), ...current]);
      queueRequest.current = { signature: "", key: "" };
      if (result.skipped.length) await refreshProject();
      message.success(`豆包队列已接收 ${result.taskIds.length} 镜，跳过 ${result.skipped.length} 个已完成镜头`);
    });
  }

  return <Space orientation="vertical" size={16} style={{ width: "100%" }}>
    <Typography.Title level={2}>视频号生产台</Typography.Title>
    <Card title="导入多集分镜">
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Button href="https://sph.miuistore.com/" target="_blank" rel="noopener noreferrer">打开参考视频下载工具</Button>
          <Button onClick={() => void copy(example()).then(() => message.success("模板已复制")).catch(e => setError(e.message))}>复制导入模板</Button>
          <Button onClick={() => go("assets", projectId)}>资产库</Button>
        </Space>
        <Input.TextArea aria-label="批量分镜 JSON" placeholder="粘贴多集分镜 JSON。相同 key 会更新原有集和镜。" rows={6}
          value={source} disabled={busy === "import"} onChange={event => { setSource(event.target.value); setPreview(undefined); }} />
        <Space wrap>
          <Button disabled={!source.trim() || !!busy} onClick={() => void importBatch(false)}>检查分镜</Button>
          <Button type="primary" disabled={!preview || !!busy} onClick={() => void importBatch(true)}>确认导入</Button>
          {preview && <span>{preview.episodes.length} 集，新增 {preview.preview.filter(shot => shot.action === "create").length} 镜，更新 {preview.preview.filter(shot => shot.action === "update").length} 镜</span>}
        </Space>
      </Space>
    </Card>
    {error && <Alert type="error" title={error} />}
    <Card title="生成与成片">
      <Alert type="info" title="字幕在剪映里添加"
        description="批量豆包任务保留对白和口型，提示模型输出无字幕画面。导出剪映草稿后，用「识别字幕」生成可编辑字幕，校对后再上传成片。"
        style={{ marginBottom: 16 }} />
      <Space wrap style={{ marginBottom: 16 }}>
        {admin && <Button type="primary" disabled={!ids.length || ids.length > 200 || !!busy} loading={busy === "queue"} onClick={() => void enqueue()}>
          将选中分集的 {ids.length} 镜加入豆包队列
        </Button>}
        {online !== undefined && <Tag color={online ? "green" : "orange"}>豆包执行器{online ? "在线" : "离线"}</Tag>}
        {quota !== undefined && <Tag>今日剩余 {quota} 次</Tag>}
        <Button href="https://channels.weixin.qq.com/" target="_blank" rel="noopener noreferrer">打开视频号助手</Button>
      </Space>
      {rows.map(({ episode, shots, complete, waiting }) => <Card key={episode.id} size="small" style={{ marginBottom: 10 }}>
        <Space wrap>
          <Checkbox checked={selected.includes(episode.id)} onChange={event => setSelected(current =>
            event.target.checked ? [...current, episode.id] : current.filter(key => key !== episode.id))} disabled={!shots.length}>
            第 {episode.number} 集 · {episode.title}
          </Checkbox>
          <Tag>{complete.length}/{shots.length} 镜已生成</Tag>
          {waiting.length > 0 && <Tag color="blue">{waiting.length} 镜在豆包队列</Tag>}
          <Button size="small" onClick={() => go("shots", projectId, episode.id)}>编辑分镜</Button>
          <Button size="small" disabled={!shots.length || complete.length !== shots.length || !!busy} loading={busy === episode.id}
            onClick={() => void run(episode.id, async () => {
              const result = await api<{ exportId: string }>(`projects/${projectId}/exports`, "POST", { kind: "jianying", episodeId: episode.id });
              await downloadExport(result.exportId);
            })}>导出剪映草稿</Button>
          <Button size="small" onClick={() => setPublicationEpisode(current => current === episode.id ? "" : episode.id)}>发布资料</Button>
          <Button size="small" onClick={() => setFinalEpisode(current => current === episode.id ? "" : episode.id)}>成片</Button>
        </Space>
        {publicationEpisode === episode.id && <PublicationDetails projectId={projectId} episodeId={episode.id} />}
        {finalEpisode === episode.id && <EpisodeFinalVideo projectId={projectId} episodeId={episode.id} />}
      </Card>)}
      {rows.length === 0 && <Typography.Text type="secondary">导入分镜后，分集会出现在这里。</Typography.Text>}
    </Card>
  </Space>;
}


const emptyDetails = { shortTitle: "", description: "", topics: "", coverText: "", plannedAt: "" };

function PublicationDetails({ projectId, episodeId }: { projectId: string; episodeId: string }) {
  const endpoint = `projects/${projectId}/episodes/${episodeId}/publication-details`;
  const { message } = App.useApp();
  const [details, setDetails] = useState<typeof emptyDetails>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ details: typeof emptyDetails | null }>(endpoint).then(result => {
      if (active) setDetails(result.details || emptyDetails);
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [endpoint]);
  if (!details) return error ? <Alert type="error" title={error} /> : <Typography.Text>正在读取发布资料…</Typography.Text>;
  const fields = [
    ["shortTitle", "短标题", 100],
    ["description", "描述", 2000],
    ["topics", "话题", 500],
    ["coverText", "封面字", 100],
    ["plannedAt", "计划发布时间（北京时间）", 16],
  ] as const;
  return <Card size="small" title="发布资料">
    <Space orientation="vertical" style={{ width: "100%" }}>
      {fields.map(([key, label, maxLength]) => <label key={key} style={{ display: "block" }}>
        {label}
        {key === "description" ? <Input.TextArea rows={3} value={details[key]} maxLength={maxLength} disabled={saving}
          onChange={event => setDetails({ ...details, [key]: event.target.value })} /> :
          <Input type={key === "plannedAt" ? "datetime-local" : "text"} value={details[key]} maxLength={maxLength} disabled={saving}
            onChange={event => setDetails({ ...details, [key]: event.target.value })} />}
      </label>)}
      {error && <Alert type="error" title={error} />}
      <Space wrap>
        <Button loading={saving} onClick={async () => {
          setSaving(true);
          setError("");
          try {
            const result = await api<{ details: typeof emptyDetails }>(endpoint, "PUT", details);
            setDetails(result.details);
            message.success("发布资料已保存");
          } catch (e) { setError((e as Error).message); }
          finally { setSaving(false); }
        }}>保存发布资料</Button>
        <Button onClick={() => void copy([details.shortTitle, details.description, details.topics].filter(Boolean).join("\n\n"))
          .then(() => message.success("发布文案已复制")).catch(e => setError(e.message))}>复制发布文案</Button>
        <Typography.Text type="secondary">计划时间用于排期记录，发布请在视频号助手确认。</Typography.Text>
      </Space>
    </Space>
  </Card>;
}
