import { useEffect, useState } from "react";
import { Alert, Button, Card, Collapse, Input, Space, Steps, Tag, Typography, Upload } from "antd";
import { api, upload } from "./api";
import { useWorkspace } from "./context";

type Task = {
  id: string; url: string; requirements: string; note: string; status: string;
  error: string; episode_id?: string;
  result: { title: string; summary: string; transcript?: string; assets?: string[]; shots: { title: string; prompt: string; duration: number }[] } | null;
};

const labels: Record<string, string> = {
  waiting_source: "待上传参考片", queued: "等待 Codex", planning: "Codex 正在分析和规划",
  planned: "分镜待确认", paused: "已暂停", failed: "规划失败", imported: "分镜已入库",
};

export function Replication({ projectId }: { projectId: string }) {
  const { go, refreshProject } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [chosen, setChosen] = useState("");
  const [url, setUrl] = useState("");
  const [requirements, setRequirements] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const endpoint = `projects/${projectId}/replications`;
  const task = tasks.find(item => item.id === chosen) || tasks[0];

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const data = await api<{ tasks: Task[] }>(endpoint);
        if (active) setTasks(data.tasks);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [endpoint]);

  async function update(action: string, request: () => Promise<Task>) {
    setBusy(action);
    setError("");
    try {
      const saved = await request();
      setTasks(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      setChosen(saved.id);
      if (action === "import") await refreshProject();
      if (action === "revise") setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(""); }
  }

  const route = task ? `${endpoint}/${task.id}` : "";
  const currentStep = task?.status === "waiting_source" ? 0 :
    task?.status === "planned" ? 2 : task?.status === "imported" ? 3 : 1;

  return <Space orientation="vertical" size={16} style={{ width: "100%" }}>
    <Card title="新建复刻任务">
      <form onSubmit={event => {
        event.preventDefault();
        void update("create", async () => {
          const saved = await api<Task>(endpoint, "POST", { url, requirements });
          setUrl("");
          setRequirements("");
          setNote("");
          return saved;
        });
      }}>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <label style={{ display: "block" }}>视频号分享链接
            <Input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://channels.weixin.qq.com/…" required type="url" maxLength={2048} />
          </label>
          <label style={{ display: "block" }}>复刻要求
            <Input.TextArea value={requirements} onChange={event => setRequirements(event.target.value)}
              placeholder="例如：保留主题，改成老夫妻对话，30 秒，优先用资产库里的角色。" rows={3} maxLength={4000} />
          </label>
          <Button type="primary" htmlType="submit" disabled={!!busy && busy !== "create"} loading={busy === "create"}>开始复刻</Button>
        </Space>
      </form>
    </Card>
    {error && <Alert type="error" title={error} closable onClose={() => setError("")} />}
    {task && <Card title="任务进度">
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <label style={{ display: "block" }}>查看任务
          <select value={task.id} style={{ width: "100%", padding: 8 }} onChange={event => { setChosen(event.target.value); setNote(""); }}>
            {tasks.map(item => <option key={item.id} value={item.id}>{item.result?.title || item.requirements || item.url}</option>)}
          </select>
        </label>
        <Steps size="small" current={currentStep} status={task.status === "failed" ? "error" : "process"}
          items={[{ title: "参考片" }, { title: "分析与规划" }, { title: "分镜确认" }, { title: "分镜入库" }]} />
        <Space wrap>
          <Tag color={task.status === "failed" ? "error" : "blue"}>{labels[task.status]}</Tag>
          <a href={task.url} target="_blank" rel="noreferrer">查看原链接</a>
          {task.episode_id && <Button onClick={() => go("shots", projectId, task.episode_id)}>查看入库的分镜</Button>}
        </Space>
        {task.requirements && <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{task.requirements}</Typography.Paragraph>}
        {task.status === "waiting_source" && <Alert type="info" title="上传参考片后自动排队"
          description="分享链接已记录。当前可用下载工具取得视频，再上传 MP4 参考片（最大 120 MB）。"
          action={<Space wrap>
            <Button href="https://sph.miuistore.com/" target="_blank" rel="noreferrer">打开下载工具</Button>
            <Upload accept="video/mp4,.mp4" showUploadList={false} disabled={!!busy} beforeUpload={file => {
              void update("source", () => upload(route + "/source", file));
              return Upload.LIST_IGNORE;
            }}><Button loading={busy === "source"}>上传参考片</Button></Upload>
          </Space>} />}
        {task.error && <Alert type="warning" title={task.error} />}
        {task.result && <>
          <Typography.Title level={4} style={{ margin: 0 }}>{task.result.title}</Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{task.result.summary}</Typography.Paragraph>
          {!!task.result.assets?.length && <Space wrap>资产引用 {task.result.assets.map(name => <Tag key={name}>{name}</Tag>)}</Space>}
          {task.result.transcript && <Collapse items={[{ key: "transcript", label: "参考片转写", children: <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{task.result.transcript}</Typography.Paragraph> }]} />}
          <Collapse items={task.result.shots.map((shot, index) => ({
            key: index, label: `${index + 1}. ${shot.title} · ${shot.duration} 秒`,
            children: <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{shot.prompt}</Typography.Paragraph>,
          }))} />
        </>}
        {!task.episode_id && task.status !== "waiting_source" && <Space orientation="vertical" style={{ width: "100%" }}>
          <Input.TextArea aria-label="修改意见" placeholder="例如：前两句换成妻子先开口，保留最后一句。" value={note}
            maxLength={4000} onChange={event => setNote(event.target.value)} />
          <Space wrap>
            <Button disabled={!!busy || (!note.trim() && !["failed", "paused"].includes(task.status))}
              onClick={() => void update("revise", () => api<Task>(route + "/revise", "POST", { note: note.trim() || task.note }))}>
              {!note.trim() && ["failed", "paused"].includes(task.status) ? "继续规划" : "提交修改意见"}
            </Button>
            {["queued", "planning"].includes(task.status) && <Button disabled={!!busy}
              onClick={() => void update("pause", () => api<Task>(route + "/pause", "POST", {}))}>暂停任务</Button>}
            {task.status === "planned" && <Button type="primary" loading={busy === "import"} disabled={!!busy && busy !== "import"}
              onClick={() => void update("import", () => api<Task>(route + "/import", "POST", {}))}>确认分镜入库</Button>}
          </Space>
        </Space>}
      </Space>
    </Card>}
  </Space>;
}
