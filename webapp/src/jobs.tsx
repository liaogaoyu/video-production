import { money, billingSource } from "./money";
import { useState } from "react";
import {
  App,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  DownloadOutlined,
  ReloadOutlined,
  PauseCircleOutlined,
} from "@ant-design/icons";
import { api, labels, time } from "./api";
import { useWorkspace } from "./context";
import { Action, Blank, Thumb } from "./common";
import { ProjectExport } from "./project-export";
import type { Job } from "./types";
import {Generation} from './generation';
export function JobsPage() {
  const { project, refreshProject,user } = useWorkspace(),
    jobs = project!.data.jobs,
    [kind, setKind] = useState("all"),
    [status, setStatus] = useState("all"),
    [query, setQuery] = useState(""),
    [preview, setPreview] = useState<Job | null>(null),
    [exporting, setExporting] = useState(false),
    [regenerate,setRegenerate]=useState<Job|null>(null),
    { message, modal } = App.useApp();
  const latest = (job: Job): Job => {
    const seen = new Set<string>();
    let j = job;
    while (j.resubmittedJobId && !seen.has(j.id)) {
      seen.add(j.id);
      const next = jobs.find((x) => x.id === j.resubmittedJobId);
      if (!next) break;
      j = next;
    }
    return j;
  };
  const replacements = new Set(
    jobs.map((j) => j.resubmittedJobId).filter(Boolean),
  );
  const filtered = jobs
    .filter(
      (j) =>
        !replacements.has(j.id) &&
        (kind === "all" || j.kind === kind) &&
        (status === "all" || latest(j).status === status) &&
        (!query || j.title.includes(query)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const retry = async (j: Job) => {
    if(user&&j.status==='submit_unknown'){message.warning('原提交结果尚未确认，请联系管理员核对，暂不重新生成');return;}
    if(user&&j.status!=='download_failed'){setRegenerate(j);return;}
    await api("jobs/" + j.id + "/retry", "POST", { confirm: true });
    await refreshProject();
    message.success(
      j.status === "download_failed" ? "已安排重新下载" : "任务已重新提交",
    );
  };
  const exportPack = async (kind: string) => {
    setExporting(true);
    try {
      const r = await api(`projects/${project!.id}/exports`, "POST", { kind });
      if (r.missing?.length)
        message.info(`${r.missing.length} 个分镜还没有视频，将导出已完成部分`);
      for (let i = 0; i < 180; i++) {
        const status = await api("exports/" + r.exportId);
        if (status.status === "succeeded") {
          location.assign(`/api/v1/exports/${r.exportId}/download`);
          message.success("导出完成");
          return;
        }
        if (status.status === "failed")
          throw Error(status.errorMessage || "导出失败");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw Error("归档仍在处理中，请稍后重试下载");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>生成队列</h1>
          <Typography.Text type="secondary">
            服务器持续执行，关闭页面不影响生成
          </Typography.Text>
        </div>
        <Space>
          <Action icon={<ReloadOutlined />} run={refreshProject}>
            刷新
          </Action>
          <ProjectExport />
          <Button loading={exporting} onClick={() => exportPack("backup")}>
            备份项目
          </Button>
        </Space>
      </div>
      <div className="stats-grid">
        {[
          ["全部任务", jobs.length],
          ["已完成", jobs.filter((j) => j.status === "done").length],
          [
            "进行中",
            jobs.filter((j) =>
              [
                "queued",
                "preparing",
                "submitting",
                "remote_running",
                "downloading",
              ].includes(j.status),
            ).length,
          ],
        ].map(([name, value]) => (
          <Card key={name}>
            <Typography.Text type="secondary">{name}</Typography.Text>
            <div className="stat-value">{value}</div>
          </Card>
        ))}
      </div>
      <div className="toolbar">
        <Space>
          <Input.Search
            placeholder="搜索任务"
            value={query}
            allowClear
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "全部类型" },
              { value: "asset", label: "资产图片" },
              { value: "shot", label: "分镜视频" },
            ]}
          />
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 160 }}
            options={[
              { value: "all", label: "全部状态" },
              ...Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
        </Space>
        <Action
          icon={<PauseCircleOutlined />}
          run={async () => {
            for (const batch of new Set(
              jobs
                .filter((j) => j.status === "queued")
                .map((j) => j.batchId)
                .filter(Boolean),
            ))
              await api("batches/" + batch + "/pause", "POST", {});
            await refreshProject();
            message.success("已暂停尚未提交的任务");
          }}
        >
          暂停待提交任务
        </Action>
      </div>
      <div className="job-list">
        {filtered.map((original) => {
          const j = latest(original),
            failed = [
              "failed",
              "auth_expired",
              "download_failed",
              "submit_unknown",
            ].includes(j.status);
          return (
            <article className="job-card" key={original.id}>
              <div
                className="job-thumb"
                onClick={() => (j.image || j.video ? setPreview(j) : undefined)}
              >
                <Thumb url={j.image || j.video} video={!!j.video} />
              </div>
              <div className="job-body">
                <strong>{j.title || original.title || "生成任务"}</strong>
                <p className="muted">
                  {j.model || "Seedance"} ·{" "}
                  {j.kind === "asset" ? "资产图片" : "分镜视频"}
                  {j.queueNote ? " · " + j.queueNote : ""}
                </p>
                {j.billing&&<p className="muted">费用：{j.billing.status==='settled'?`实际 ${money(j.billing.actualAmount)} · 已付 ${money(j.billing.charged)}`:j.billing.status==='refunded'?'已退款':j.billing.status==='due'?`实际 ${money(j.billing.actualAmount)} · 待补 ${money(j.billing.due)}`:`已预扣 ${money(j.billing.reserved)} · 待结算`} · {billingSource(j.billing.basis)}</p>}
                {j.error && <p className="job-error">{j.error}</p>}
                <div className="job-times">
                  <span>提交 {time(j.submittedAt || j.createdAt)}</span>
                  {j.completedAt && <span>完成 {time(j.completedAt)}</span>}
                  {j.failedAt && <span>失败 {time(j.failedAt)}</span>}
                </div>
              </div>
              <div className="job-actions">
                <Tag
                  color={
                    j.status === "done" ? "green" : failed ? "red" : "blue"
                  }
                >
                  {labels[j.status] || j.status}
                </Tag>
                <Space>
                  {j.status==='queued'&&<Popconfirm title="取消此任务并退回预扣费用？" onConfirm={async()=>{await api('jobs/'+j.id+'/cancel','POST',{});await refreshProject();window.dispatchEvent(new Event('billing-changed'));}}><Button>取消任务</Button></Popconfirm>}
                  {failed && (
                    <Action
                      run={async () => {
                        if (
                          !user && j.status === "submit_unknown" &&
                          j.provider !== "dreamina_web_api"
                        ) {
                          modal.confirm({
                            title: "提交结果尚未确认",
                            content:
                              "确认官网未生成后再重新提交，避免重复消耗积分。",
                            onOk: () => retry(j),
                          });
                          return;
                        }
                        await retry(j);
                      }}
                    >
                      {j.status === "download_failed" ? "重试下载" : "重新提交"}
                    </Action>
                  )}
                  {(j.image || j.video) && (
                    <>
                      <Button onClick={() => setPreview(j)}>预览</Button>
                      <Button
                        href={j.image || j.video}
                        download
                        icon={<DownloadOutlined />}
                      />
                    </>
                  )}
                </Space>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && <Blank text="暂无任务" />}
      {regenerate&&<Generation kind={regenerate.kind==='asset'?'image':'video'} sourceIds={[regenerate.sourceId]} retryJobId={regenerate.id} onClose={()=>setRegenerate(null)}/>}
      <Modal
        title={preview?.title || "预览"}
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={null}
        width={960}
        destroyOnHidden
      >
        {preview && (
          <Thumb
            url={preview.image || preview.video}
            video={!!preview.video}
            large
          />
        )}
      </Modal>
    </>
  );
}
