import { useEffect, useMemo, useRef, useState } from "react";
import { EpisodeFinalVideo } from "./episode-final-video";
import {
  App,
  Button,
  Dropdown,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  CopyOutlined,
  FileTextOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  MoreOutlined,
  PlusOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { api, copy } from "./api";
import { useWorkspace } from "./context";
import { Blank } from "./common";
import storyboardSkill from "../../skills/coherent-storyboard/SKILL.md?raw";
import assetSkill from "../../skills/consistent-assets/SKILL.md?raw";
import { buildShotInstructions } from "./storyboard-instructions.mjs";
import { buildAssetInstructions } from "./asset-instructions.mjs";
import { parseBeats } from "./script-beats.mjs";
import type { Episode } from "./types";

function episodeLabel(e: Episode) {
  return `第 ${e.number} 集 · ${e.title}`;
}

export function ScriptPage() {
  const { project, refreshProject, go, episodeId: routeEpisode } = useWorkspace();
  const { message, modal } = App.useApp();
  const episodes = [...(project!.data.episodes || [])].sort(
    (a, b) => a.number - b.number,
  );
  const [episodeId, setEpisodeId] = useState(routeEpisode || episodes[0]?.id || "");
  const current =
    episodes.find((e) => e.id === episodeId) ||
    episodes.find((e) => e.id === routeEpisode) ||
    episodes[0];
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Episode["status"]>("draft");
  const [synopsis, setSynopsis] = useState(project!.synopsis || project!.scriptText || "");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef<any>(null);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (current && current.id !== episodeId) setEpisodeId(current.id);
  }, [current, episodeId]);

  useEffect(() => {
    if (!current) {
      setTitle("");
      setSummary("");
      setBody("");
      setStatus("draft");
      revisionRef.current = 0;
      return;
    }
    setTitle(current.title);
    setSummary(current.summary || "");
    setBody(current.body || "");
    setStatus(current.status || "draft");
    revisionRef.current = current.revision;
  }, [current?.id, current?.revision]);

  useEffect(() => {
    setSynopsis(project!.synopsis || project!.scriptText || "");
  }, [project!.id, project!.revision]);

  const beats = useMemo(() => parseBeats(body), [body]);
  const dirty =
    !!current &&
    (title !== current.title ||
      summary !== (current.summary || "") ||
      body !== (current.body || "") ||
      status !== (current.status || "draft"));

  const switchEpisode = (id: string) => {
    setEpisodeId(id);
    go("script", project!.id, id);
  };

  const saveEpisode = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await api(`projects/${project!.id}/episodes/${current.id}`, "PATCH", {
        title,
        summary,
        body,
        status,
        revision: revisionRef.current || current.revision,
      });
      await refreshProject();
      message.success("本集剧本已保存");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveSynopsis = async () => {
    try {
      await api(`projects/${project!.id}`, "PATCH", {
        synopsis,
        revision: project!.revision,
      });
      await refreshProject();
      message.success("整剧梗概已保存");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const addEpisode = async () => {
    try {
      const created = await api(`projects/${project!.id}/episodes`, "POST", {});
      await refreshProject();
      switchEpisode(created.id);
      message.success("已新增分集");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const renameEpisode = async () => {
    if (!current) return;
    const next = window.prompt("分集名称", current.title);
    if (next == null) return;
    try {
      await api(`projects/${project!.id}/episodes/${current.id}`, "PATCH", {
        title: next,
        revision: revisionRef.current || current.revision,
      });
      await refreshProject();
      message.success("分集已更新");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const deleteEpisode = () => {
    if (!current) return;
    modal.confirm({
      title: `删除「${episodeLabel(current)}」？`,
      content: "将同时删除本集分镜，此操作不可恢复。",
      okType: "danger",
      okText: "删除分集",
      onOk: async () => {
        await api(`projects/${project!.id}/episodes/${current.id}`, "DELETE");
        await refreshProject();
        const next = episodes.find((e) => e.id !== current.id);
        if (next) switchEpisode(next.id);
        else go("script", project!.id);
        message.success("分集已删除");
      },
    });
  };

  const jumpToBeat = (offset: number) => {
    const host = editorRef.current;
    const el =
      host?.resizableTextArea?.textArea ||
      host?.nativeElement ||
      host;
    if (!el?.focus) return;
    el.focus();
    el.setSelectionRange?.(offset, offset);
    const before = body.slice(0, offset);
    const line = before.split("\n").length;
    el.scrollTop = Math.max(0, (line - 3) * 22);
  };

  const copyInstructions = async (kind: "assets" | "shots", anchor: HTMLElement) => {
    const scriptBody = [synopsis && `【整剧梗概】\n${synopsis}`, current && `【${episodeLabel(current)}】\n${body}`]
      .filter(Boolean)
      .join("\n\n");
    const text =
      kind === "shots"
        ? buildShotInstructions(storyboardSkill, project, scriptBody)
        : buildAssetInstructions(assetSkill, project, scriptBody);
    await copy(text, anchor);
    message.success("已复制，可粘贴到 Codex");
  };

  return (
    <div className="script-page">
      <div className="page-heading">
        <div>
          <div className="editor-page-kicker">故事创作</div>
          <h1>剧本</h1>
          <div className="editor-page-summary"><span>{project!.name}</span><i /><span>{episodes.length} 集</span><i /><span>分集写作与场次大纲</span></div>
        </div>
        <Space wrap>
          <Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>
            导入剧本
          </Button>
          <Button
            icon={<VideoCameraOutlined />}
            disabled={!current}
            onClick={() => current && go("shots", project!.id, current.id)}
          >
            打开本集分镜
          </Button>
        </Space>
      </div>

      <div className="episode-strip">
        {episodes.map((e) => {
          const active = current?.id === e.id;
          return (
            <div
              key={e.id}
              className={"episode-chip" + (active ? " is-active" : "")}
            >
              <button
                type="button"
                className="episode-chip-main"
                onClick={() => switchEpisode(e.id)}
              >
                <span className="episode-chip-index">
                  EP {String(e.number).padStart(2, "0")}
                </span>
                <span className="episode-chip-title">{e.title}</span>
              </button>
              {active && (
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: "rename",
                        icon: <EditOutlined />,
                        label: "重命名",
                        onClick: renameEpisode,
                      },
                      {
                        key: "delete",
                        icon: <DeleteOutlined />,
                        label: "删除分集",
                        danger: true,
                        onClick: deleteEpisode,
                      },
                    ],
                  }}
                  trigger={["click"]}
                >
                  <button
                    type="button"
                    className="episode-chip-more"
                    aria-label="分集操作"
                  >
                    <MoreOutlined />
                  </button>
                </Dropdown>
              )}
            </div>
          );
        })}
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addEpisode}>
          新增分集
        </Button>
      </div>

      <div className="script-layout">
        <aside className="script-rail">
          <div className="script-rail-block">
            <strong>本集大纲 <span className="script-rail-count">{beats.length} 场</span></strong>
            {!beats.length && (
              <Typography.Text type="secondary">
                用「## 标题」或「第N场」标记场次
              </Typography.Text>
            )}
            <div className="script-beats">
              {beats.map((b) => (
                <button key={b.offset} type="button" onClick={() => jumpToBeat(b.offset)}>
                  <span className="script-beat-index">{String(b.index).padStart(2,"0")}</span><span>{b.title}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="script-rail-block">
            <strong>整剧梗概</strong>
            <div className="script-synopsis"><Input.TextArea
              rows={7}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="全剧人物、时代、主线一句话到几段"
              aria-label="整剧梗概"
            />
            <Button size="small" onClick={saveSynopsis} disabled={synopsis === (project!.synopsis || project!.scriptText || "")}>
              保存梗概
            </Button></div>
          </div>
        </aside>

        <section className="script-editor">
          {!current ? (
            <Blank text="还没有分集，点击上方新增" />
          ) : (
            <>
              <div className="script-editor-head">
                <div className="script-document-label"><FileTextOutlined /><span>第 {current.number} 集 · 正文</span></div>
                <Space>
                  <Select
                    value={status}
                    style={{ width: 110 }}
                    options={[
                      { value: "draft", label: "草稿" },
                      { value: "ready", label: "已定稿" },
                      { value: "archived", label: "已归档" },
                    ]}
                    onChange={setStatus}
                  />
                  <Tag>{body.length} 字</Tag>
                  <Button type="primary" loading={saving} disabled={!dirty} onClick={saveEpisode}>
                    {dirty ? "保存本集" : "已保存"}
                  </Button>
                </Space>
              </div>
              <div className="script-paper">
              <Input className="script-title" value={title} maxLength={80} aria-label="分集名称" placeholder="为这一集命名" onChange={(e)=>setTitle(e.target.value)} />
              <Input
                className="script-summary"
                value={summary}
                maxLength={500}
                placeholder="用一句话概括本集故事…"
                aria-label="本集摘要"
                onChange={(e) => setSummary(e.target.value)}
              />
              <Input.TextArea
                ref={editorRef}
                className="script-body"
                value={body}
                rows={22}
                placeholder="在这里写本集剧本正文…"
                aria-label="本集剧本正文"
                onChange={(e) => setBody(e.target.value)}
              />
              </div>
              <div className="script-footer">
                <span className="script-footer-caption">从剧本继续创作</span>
                <Space wrap>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={(e) =>
                      copyInstructions("assets", e.currentTarget).catch((err) =>
                        message.error(err.message),
                      )
                    }
                  >
                    提取资产指令
                  </Button>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={(e) =>
                      copyInstructions("shots", e.currentTarget).catch((err) =>
                        message.error(err.message),
                      )
                    }
                  >
                    拆解分镜指令
                  </Button>
                </Space>
              </div>
            </>
          )}
        </section>
      </div>

      {current && <EpisodeFinalVideo key={current.id} projectId={project!.id} episodeId={current.id} />}

      <Modal
        open={importing}
        title="导入剧本"
        width={820}
        onCancel={() => {
          setImporting(false);
          setPreview(null);
        }}
        footer={
          <Space>
            <Button onClick={() => setImporting(false)}>取消</Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  let payload: any;
                  try {
                    payload = { ...JSON.parse(importText), mode: "preview" };
                  } catch {
                    payload = { text: importText, mode: "preview" };
                  }
                  const r = await api(`projects/${project!.id}/script/import`, "POST", payload);
                  setPreview(r.preview);
                } catch (e) {
                  message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              检查内容
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!preview?.length}
              onClick={async () => {
                setBusy(true);
                try {
                  let payload: any;
                  try {
                    payload = { ...JSON.parse(importText), mode: "commit" };
                  } catch {
                    payload = { text: importText, mode: "commit" };
                  }
                  const r = await api(`projects/${project!.id}/script/import`, "POST", payload);
                  await refreshProject();
                  message.success(
                    `已导入 ${r.created.length} 集，更新 ${r.updated.length} 集`,
                  );
                  setImporting(false);
                  setPreview(null);
                  if (r.episodes?.[0]?.id) switchEpisode(r.episodes[0].id);
                } catch (e) {
                  message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认导入
            </Button>
          </Space>
        }
      >
        <Space className="form-toolbar">
          <Upload
            accept=".json,.txt,.md"
            showUploadList={false}
            beforeUpload={(file) => {
              file.text().then((v) => {
                setImportText(v);
                setPreview(null);
              });
              return false;
            }}
          >
            <Button icon={<FolderOpenOutlined />}>选择本地文件</Button>
          </Upload>
          <Typography.Text type="secondary">
            支持 script JSON，或纯文本按「第 N 集」自动切分
          </Typography.Text>
        </Space>
        <Input.TextArea
          className="json-input spaced"
          rows={14}
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setPreview(null);
          }}
          placeholder={`{\n  "schemaVersion": 1,\n  "kind": "script",\n  "synopsis": "",\n  "episodes": [{ "key": "ep-01", "title": "重逢", "body": "..." }]\n}`}
        />
        {preview && (
          <div className="spaced">
            {preview.map((row, i) => (
              <div key={i}>
                {row.title} · {row.action} · {String(row.body || "").length} 字
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
