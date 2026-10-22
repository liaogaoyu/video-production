import { useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  PlusOutlined,
  ImportOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { api, labels } from "./api";
import { useWorkspace } from "./context";
import { Action, Blank, Thumb } from "./common";
import { Importer } from "./importer";
import { Generation } from "./generation";
import { ProjectExport } from "./project-export";
import { PromptMentions } from "./prompt-mentions";
import { formatPromptForReading } from "./prompt-layout.mjs";
import type { Shot } from "./types";
export function ShotsPage() {
  const { project, refreshProject } = useWorkspace(),
    { shots, assets, jobs } = project!.data,
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [editing, setEditing] = useState<Shot | null | undefined>(),
    [importing, setImporting] = useState(false),
    [generating, setGenerating] = useState(false),
    [preview, setPreview] = useState(""),
    [form] = Form.useForm(),
    [saving, setSaving] = useState(false),
    [expanded, setExpanded] = useState<Set<string>>(() => new Set()),
    { message, modal } = App.useApp();
  const latest = (shot: Shot) =>
      [...jobs].reverse().find((j) => j.sourceId === shot.id),
    missing = (shot: Shot) =>
      shot.refAssetIds.some((id) => !assets.find((a) => a.id === id)?.locked);
  const edit = (s?: Shot) => {
    setEditing(s || null);
    form.setFieldsValue(
      s || {
        episode: 1,
        number:
          Math.max(
            0,
            ...shots.filter((s) => s.episode === 1).map((s) => s.number),
          ) + 1,
        duration: 5,
        title: "",
        prompt: "",
      },
    );
  };
  const filtered = shots
    .filter(
      (s) =>
        (!query || s.title.includes(query) || s.prompt.includes(query)) &&
        (status === "all" ||
          (status === "missing" && missing(s)) ||
          latest(s)?.status === status),
    )
    .sort((a, b) => a.episode - b.episode || a.number - b.number);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>分镜脚本</h1>
          <Typography.Text type="secondary">
            {shots.length} 个分镜 · {project!.data.settings.ratio}
          </Typography.Text>
        </div>
        <Space wrap>
          <ProjectExport />
          <Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>
            导入分镜脚本
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => edit()}>
            新增分镜
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={!selected.length}
            onClick={() => setGenerating(true)}
          >
            生成所选 {selected.length || ""}
          </Button>
        </Space>
      </div>
      <div className="toolbar">
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索分镜"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            style={{ width: 150 }}
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "全部状态" },
              { value: "missing", label: "引用待确认" },
              ...["queued", "remote_running", "done", "failed"].map(
                (value) => ({ value, label: labels[value] }),
              ),
            ]}
          />
        </Space>
        <Space>
          <Button onClick={() => setSelected(filtered.map((s) => s.id))}>
            全选
          </Button>
          {selected.length > 0 && (
            <>
              <Button onClick={() => setSelected([])}>取消选择</Button>
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: `删除所选 ${selected.length} 个分镜？`,
                    onOk: async () => {
                      for (const id of selected)
                        await api("shots/" + id, "DELETE");
                      setSelected([]);
                      await refreshProject();
                    },
                  })
                }
              >
                删除所选
              </Button>
            </>
          )}
        </Space>
      </div>
      <div className="shot-list">
        {filtered.map((s) => {
          const job = latest(s),
            video = [...jobs]
              .reverse()
              .find((j) => j.sourceId === s.id && j.video)?.video,
            reference = assets.find(
              (a) => s.refAssetIds.includes(a.id) && a.image,
            );
          return (
            <article
              className={
                "shot-card " + (selected.includes(s.id) ? "is-selected" : "")
              }
              key={s.id}
            >
              <Checkbox
                aria-label={"选择" + s.title}
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, s.id]
                      : ids.filter((id) => id !== s.id),
                  )
                }
              />
              <div
                className="shot-preview"
                onClick={() => video && setPreview(video)}
              >
                <Thumb url={video || reference?.image} video={!!video} />
                {video && <PlayCircleOutlined className="play-overlay" />}
              </div>
              <div className="shot-body">
                <div className="card-title">
                  <h3>
                    <span className="shot-number">
                      {s.episode}-{s.number}
                    </span>
                    {s.title}
                  </h3>
                  <Tag
                    color={
                      missing(s)
                        ? "orange"
                        : job?.status === "done"
                          ? "green"
                          : "blue"
                    }
                  >
                    {missing(s)
                      ? "引用待确认"
                      : job
                        ? labels[job.status] || job.status
                        : "待生成"}
                  </Tag>
                </div>
                <p id={`prompt-${s.id}`} className={`shot-prompt${expanded.has(s.id) ? " expanded" : ""}`}>{formatPromptForReading(s.prompt)}</p>
                <Button type="link" size="small" aria-expanded={expanded.has(s.id)} aria-controls={`prompt-${s.id}`} onClick={() => setExpanded(current => {
                  const next = new Set(current);
                  if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                  return next;
                })}>{expanded.has(s.id) ? "收起提示词" : "展开提示词"}</Button>
                <div>
                  {s.refs.map((name, i) => (
                    <Tag
                      key={i}
                      color={
                        assets.find((a) => a.id === s.refAssetIds[i])?.locked
                          ? "blue"
                          : "orange"
                      }
                    >
                      @{name}
                    </Tag>
                  ))}
                </div>
              </div>
              <div className="shot-actions">
                <Typography.Text type="secondary">
                  {s.duration}s
                </Typography.Text>
                <Button onClick={() => edit(s)}>编辑提示词</Button>
                {video && (
                  <Button onClick={() => setPreview(video)}>预览视频</Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && <Blank text="暂无符合条件的分镜" />}
      <Modal
        open={editing !== undefined}
        title={editing ? "编辑分镜" : "新增分镜"}
        width={880}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="保存并匹配资产"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setSaving(true);
            try {
              await api(
                editing
                  ? "shots/" + editing.id
                  : `projects/${project!.id}/shots`,
                editing ? "PATCH" : "POST",
                { ...v, ...(editing ? { revision: editing.revision } : {}) },
              );
              await refreshProject();
              setEditing(undefined);
              message.success("分镜已保存");
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="form-grid">
            <Form.Item label="集数" name="episode" rules={[{ required: true }]}>
              <InputNumber min={1} max={999} />
            </Form.Item>
            <Form.Item
              label="镜头编号"
              name="number"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={9999} />
            </Form.Item>
            <Form.Item
              label="时长（秒）"
              name="duration"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={60} />
            </Form.Item>
          </div>
          <Form.Item label="镜头名称" name="title" rules={[{ required: true }]}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item
            label="提示词"
            name="prompt"
            extra="输入 @ 选择项目资产，保存后自动匹配参考图。"
            rules={[{ required: true }]}
          >
            <PromptMentions assets={assets} />
          </Form.Item>
          <Button type="link" onClick={() => {
            form.setFieldValue("prompt", formatPromptForReading(form.getFieldValue("prompt")));
          }}>整理换行</Button>
        </Form>
      </Modal>
      {importing && (
        <Importer kind="shots" onClose={() => setImporting(false)} />
      )}{" "}
      {generating && (
        <Generation
          kind="video"
          sourceIds={selected}
          onClose={() => setGenerating(false)}
        />
      )}
      <Modal
        title="视频预览"
        open={!!preview}
        footer={null}
        width={960}
        onCancel={() => setPreview("")}
        destroyOnHidden
      >
        <Thumb url={preview} video large />
      </Modal>
    </>
  );
}
