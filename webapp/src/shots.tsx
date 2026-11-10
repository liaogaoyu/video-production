import {DoubaoLocal} from "./doubao-local";
import {ShotVideoUpload} from "./shot-video-upload";
import { useEffect, useMemo, useRef, useState } from "react";
import { EpisodeFinalVideo } from "./episode-final-video";
import {
  App,
  Button,
  Checkbox,
  Dropdown,
  Input,
  InputNumber,
  Modal,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  PlusOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
  MoreOutlined,
  EditOutlined,
  VideoCameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import { api, labels } from "./api";
import { useWorkspace } from "./context";
import { Blank, Thumb } from "./common";
import { Importer } from "./importer";
import { Generation } from "./generation";
import { downloadExport } from "./project-export";
import { PromptMentions } from "./prompt-mentions";
import { ReferenceTags } from "./reference-tags";
import { formatPromptForReading } from "./prompt-layout.mjs";
import type { Episode, Shot } from "./types";

function episodeLabel(e: Episode) {
  return `第 ${e.number} 集 · ${e.title}`;
}
function shotCode(episode: Episode | undefined, shot: Shot) {
  const ep = String(episode?.number || shot.episode || 1).padStart(2, "0");
  return `${ep}-${String(shot.number).padStart(2, "0")}`;
}
function activeStatuses(status?: string) {
  return ["queued", "preparing", "submitting", "remote_running", "downloading"].includes(
    status || "",
  );
}

export function ShotsPage() {
  const { project, refreshProject, go, episodeId: routeEpisode } = useWorkspace();
  const { shots, assets, jobs, episodes } = project!.data;
  const { message, modal } = App.useApp();
  const [episodeId, setEpisodeId] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [checked, setChecked] = useState<string[]>([]);
  const [draft, setDraft] = useState({ title: "", duration: 15, prompt: "" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState<string[] | null>(null);
  const [preview, setPreview] = useState("");
  const [exporting, setExporting] = useState(false);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erasing, setErasing] = useState(false);
  const episodeStripRef = useRef<HTMLDivElement>(null);

  const sortedEpisodes = useMemo(
    () => [...(episodes || [])].sort((a, b) => a.number - b.number),
    [episodes],
  );
  const current =
    sortedEpisodes.find((e) => e.id === episodeId) ||
    sortedEpisodes.find((e) => e.id === routeEpisode) ||
    sortedEpisodes[0];
  const episodeShots = useMemo(
    () =>
      shots
        .filter((s) =>
          current
            ? s.episodeId === current.id || (!s.episodeId && s.episode === current.number)
            : false,
        )
        .sort((a, b) => a.number - b.number),
    [shots, current],
  );
  const selected =
    episodeShots.find((s) => s.id === selectedId) || episodeShots[0] || null;
  const checkedInEpisode = checked.filter((id) =>
    episodeShots.some((s) => s.id === id),
  );

  useEffect(() => {
    if (current && current.id !== episodeId) setEpisodeId(current.id);
  }, [current, episodeId]);
  useEffect(() => {
    const strip = episodeStripRef.current;
    const chip = strip?.querySelector(".is-active");
    if (!strip || !chip) return;
    const { left, right } = chip.getBoundingClientRect();
    const bounds = strip.getBoundingClientRect();
    if (left < bounds.left) strip.scrollLeft += left - bounds.left;
    else if (right > bounds.right) strip.scrollLeft += right - bounds.right;
  }, [current?.id]);
  useEffect(() => {
    if (!selected) {
      setSelectedId("");
      return;
    }
    if (selected.id !== selectedId) setSelectedId(selected.id);
    setDraft({
      title: selected.title,
      duration: selected.duration,
      prompt: selected.prompt,
    });
  }, [selected?.id, selected?.revision]);
  useEffect(() => {
    setChecked((ids) => ids.filter((id) => episodeShots.some((s) => s.id === id)));
  }, [current?.id]);

  const latest = (shot: Shot) =>
    [...jobs].reverse().find((j) => j.sourceId === shot.id);
  const videoOf = (shot: Shot) =>
    [...jobs].reverse().find((j) => j.sourceId === shot.id && j.video)?.video ||
    "";
  const statusOf = (shot: Shot) => {
    if (
      selected?.id === shot.id &&
      (draft.title !== shot.title ||
        draft.prompt !== shot.prompt ||
        draft.duration !== shot.duration)
    )
      return { label: "正在编辑", color: "gold" as const };
    const job = latest(shot);
    if (job?.status === "done") return { label: "已完成", color: "green" as const };
    if (activeStatuses(job?.status)) return { label: "生成中", color: "blue" as const };
    if (
      job &&
      ["failed", "download_failed", "auth_expired", "submit_unknown"].includes(
        job.status,
      )
    )
      return { label: labels[job.status] || "失败", color: "red" as const };
    return { label: "待生成", color: "default" as const };
  };

  const switchEpisode = (id: string) => {
    setEpisodeId(id);
    setSelectedId("");
    setChecked([]);
    go("shots", project!.id, id);
  };

  const ensureEpisode = async () => {
    if (current) return current;
    const created = await api(`projects/${project!.id}/episodes`, "POST", {
      title: "第 1 集",
    });
    await refreshProject();
    setEpisodeId(created.id);
    go("shots", project!.id, created.id);
    return created as Episode;
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

  const renameEpisode = async (episode = current) => {
    if (!episode) return;
    const title = window.prompt("分集名称", episode.title);
    if (title == null) return;
    setNaming(true);
    try {
      await api(`projects/${project!.id}/episodes/${episode.id}`, "PATCH", {
        title,
        revision: episode.revision,
      });
      await refreshProject();
      message.success("分集已更新");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setNaming(false);
    }
  };

  const deleteEpisode = (episode = current) => {
    if (!episode) return;
    const count = shots.filter(
      (s) =>
        s.episodeId === episode.id || (!s.episodeId && s.episode === episode.number),
    ).length;
    modal.confirm({
      title: `删除「${episodeLabel(episode)}」？`,
      content: count
        ? `将同时删除本集 ${count} 个分镜，此操作不可恢复。`
        : "此操作不可恢复。",
      okType: "danger",
      okText: "删除分集",
      onOk: async () => {
        setBusy(true);
        try {
          await api(
            `projects/${project!.id}/episodes/${episode.id}`,
            "DELETE",
          );
          setSelectedId("");
          setChecked([]);
          await refreshProject();
          const next = sortedEpisodes.find((e) => e.id !== episode.id);
          if (next) switchEpisode(next.id);
          else go("shots", project!.id);
          message.success("分集已删除");
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const insertShot = async (afterId?: string) => {
    try {
      const episode = await ensureEpisode();
      const created = await api(`projects/${project!.id}/shots/insert`, "POST", {
        episodeId: episode.id,
        afterId,
        title: "新分镜",
        duration: 15,
        prompt: "请填写本镜提示词",
      });
      await refreshProject();
      setSelectedId(created.id);
      message.success("已插入分镜");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const saveShot = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api("shots/" + selected.id, "PATCH", {
        title: draft.title,
        duration: draft.duration,
        prompt: draft.prompt,
        episodeId: selected.episodeId || current?.id,
        revision: selected.revision,
      });
      await refreshProject();
      message.success("分镜已保存");
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteShots = (ids: string[]) => {
    if (!ids.length) return;
    modal.confirm({
      title: ids.length === 1 ? "删除这个分镜？" : `删除选中的 ${ids.length} 个分镜？`,
      content: "删除后不可恢复。",
      okType: "danger",
      okText: "删除",
      onOk: async () => {
        setBusy(true);
        try {
          await api(`projects/${project!.id}/shots/delete`, "POST", { ids });
          if (ids.includes(selectedId)) setSelectedId("");
          setChecked((list) => list.filter((id) => !ids.includes(id)));
          await refreshProject();
          message.success(ids.length === 1 ? "分镜已删除" : `已删除 ${ids.length} 个分镜`);
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const exportEpisode = async () => {
    if (!current) return;
    setExporting(true);
    try {
      const result = await api(`projects/${project!.id}/exports`, "POST", {
        kind: "videos",
        episodeId: current.id,
        allowPartial: true,
      });
      await downloadExport(result.exportId);
      message.success("本集导出完成");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const toggleChecked = (id: string, on: boolean) => {
    setChecked((list) =>
      on ? [...new Set([...list, id])] : list.filter((item) => item !== id),
    );
  };

  const dirty =
    !!selected &&
    (draft.title !== selected.title ||
      draft.prompt !== selected.prompt ||
      draft.duration !== selected.duration);

  return (
    <div className="storyboard-page">
      <div className="page-heading storyboard-heading">
        <div className="storyboard-heading-title">
          <h1>分镜故事板</h1>
          <div className="editor-page-summary"><span>{sortedEpisodes.length} 集</span><i /><span>{project!.data.settings.ratio}</span></div>
        </div>
        <Space wrap>
          <Button size="small" icon={<ImportOutlined />} onClick={() => setImporting(true)}>
            导入分镜
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={!current || !episodeShots.length}
            onClick={exportEpisode}
          >
            导出本集
          </Button>
        </Space>
      </div>

      <div className="episode-strip" ref={episodeStripRef}>
        {sortedEpisodes.map((e) => {
          const active = current?.id === e.id;
          return (
            <div
              key={e.id}
              className={"episode-chip" + (active ? " is-active" : "")}
            >
              <button
                type="button"
                className="episode-chip-main"
                aria-current={active ? "true" : undefined}
                onClick={() => switchEpisode(e.id)}
              >
                <span className="episode-chip-index">EP {String(e.number).padStart(2, "0")}</span>
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
                        onClick: () => renameEpisode(e),
                      },
                      {
                        key: "delete",
                        icon: <DeleteOutlined />,
                        label: "删除分集",
                        danger: true,
                        onClick: () => deleteEpisode(e),
                      },
                    ],
                  }}
                  trigger={["click"]}
                >
                  <button
                    type="button"
                    className="episode-chip-more"
                    aria-label="分集操作"
                    disabled={naming || busy}
                  >
                    <MoreOutlined />
                  </button>
                </Dropdown>
              )}
            </div>
          );
        })}
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={addEpisode}
          loading={naming}
        >
          新增分集
        </Button>
      </div>

      <div className="storyboard-layout">
        <aside className="storyboard-rail">
          <div className="storyboard-rail-head">
            <div className="editor-section-title">
              <strong>本集分镜 <Typography.Text type="secondary">{episodeShots.length} 镜</Typography.Text></strong>
              <span>{episodeShots.reduce((sum,s)=>sum+s.duration,0)} 秒 · {episodeShots.filter(s=>latest(s)?.status==='done').length} 已完成</span>
            </div>
            <Space size={4} wrap>
              {checkedInEpisode.length > 0 ? (
                <>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={busy}
                    onClick={() => deleteShots(checkedInEpisode)}
                  >
                    批量删除
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => setGenerating(checkedInEpisode)}
                  >
                    生成选中
                  </Button>
                </>
              ) : (
                <Button
                  size="small"
                  type="primary"
                  disabled={!episodeShots.length}
                  onClick={() => setGenerating(episodeShots.map((s) => s.id))}
                >
                  批量生成
                </Button>
              )}
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => insertShot()}
                aria-label="新增分镜"
              />
            </Space>
          </div>

          {!!episodeShots.length && (
            <div className="storyboard-rail-tools">
              <Checkbox
                checked={
                  !!episodeShots.length &&
                  checkedInEpisode.length === episodeShots.length
                }
                indeterminate={
                  checkedInEpisode.length > 0 &&
                  checkedInEpisode.length < episodeShots.length
                }
                onChange={(e) =>
                  setChecked(
                    e.target.checked ? episodeShots.map((s) => s.id) : [],
                  )
                }
              >
                全选本集
              </Checkbox>
              {checkedInEpisode.length > 0 && (
                <Button type="link" size="small" onClick={() => setChecked([])}>
                  清空选择
                </Button>
              )}
            </div>
          )}

          <div className="storyboard-rail-list">
            {!episodeShots.length && (
              <Blank text={current ? "本集还没有分镜" : "请先新增分集"} />
            )}
            {episodeShots.map((s, index) => {
              const st = statusOf(s);
              const video = videoOf(s);
              const reference = assets.find(a=>s.refAssetIds.includes(a.id)&&a.image);
              const on = checked.includes(s.id);
              return (
                <div key={s.id} className="storyboard-shot-block">
                  {index > 0 && (
                    <button
                      type="button"
                      className="shot-insert"
                      onClick={() => insertShot(episodeShots[index - 1].id)}
                    >
                      + 插入分镜
                    </button>
                  )}
                  <div
                    className={
                      "storyboard-shot-card" +
                      (selected?.id === s.id ? " is-active" : "") +
                      (on ? " is-checked" : "")
                    }
                  >
                    <Checkbox
                      className="storyboard-shot-check"
                      aria-label={`选择分镜 ${s.title}`}
                      checked={on}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(e) => toggleChecked(s.id, e.target.checked)}
                    />
                    <button
                      type="button"
                      className="storyboard-shot-body"
                      onClick={() => setSelectedId(s.id)}
                      aria-pressed={selected?.id === s.id}
                      aria-label={`编辑分镜 ${s.title}`}
                    >
                      <div className="storyboard-shot-thumb">
                        <Thumb url={video || reference?.image || undefined} video={!!video} />
                        <span className="storyboard-shot-duration">{s.duration}s</span>
                      </div>
                      <div className="storyboard-shot-meta">
                        <div className="storyboard-shot-top">
                          <code>{shotCode(current, s)}</code>
                          <Tag color={st.color}>{st.label}</Tag>
                        </div>
                        <strong>{s.title}</strong>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
            {!!episodeShots.length && (
              <button
                type="button"
                className="shot-insert"
                onClick={() =>
                  insertShot(episodeShots[episodeShots.length - 1].id)
                }
              >
                + 插入分镜
              </button>
            )}
          </div>
        </aside>

        <section className="storyboard-editor">
          {!selected ? (
            <Blank text="选择左侧分镜开始编辑" />
          ) : (
            <>
              <div className="storyboard-editor-actions" role="group" aria-label="本镜操作">
                <Space size={6} wrap>
                  <Typography.Text className="storyboard-shot-code">
                    镜头 {shotCode(current, selected)}
                  </Typography.Text>
                  <Tag color={statusOf(selected).color}>{statusOf(selected).label}</Tag>
                </Space>
                <Space size={6} wrap>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlayCircleOutlined />}
                    disabled={saving}
                    onClick={async () => {
                      if (dirty && !(await saveShot())) return;
                      setGenerating([selected.id]);
                    }}
                  >
                    生成本镜
                  </Button>
                  <Button size="small" onClick={saveShot} loading={saving} disabled={!dirty}>
                    保存修改
                  </Button>
                  <DoubaoLocal key={selected.id} shotId={selected.id} saved={draft.prompt === selected.prompt && !saving} onComplete={refreshProject} />
                </Space>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>镜头名称</span>
                  <Input
                    size="small"
                    value={draft.title}
                    maxLength={80}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, title: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>秒数</span>
                  <InputNumber
                    size="small"
                    min={1}
                    max={60}
                    value={draft.duration}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, duration: Number(v) || 15 }))
                    }
                  />
                </label>
              </div>

              <div className="field field-prompt">
                <div className="prompt-tools">
                  <div className="storyboard-prompt-label">
                    <strong>视频提示词</strong>
                    <Typography.Text type="secondary">输入 @ 引用资产</Typography.Text>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        prompt: formatPromptForReading(d.prompt),
                      }))
                    }
                  >
                    整理换行
                  </Button>
                </div>
                <PromptMentions
                  key={selected.id}
                  assets={assets}
                  value={draft.prompt}
                  onChange={(prompt) =>
                    setDraft((d) => (d.prompt === prompt ? d : { ...d, prompt }))
                  }
                />
              </div>

              {!!selected.refs.length && (
                <div className="ref-chips">
                  <ReferenceTags shot={selected} assets={assets} />
                </div>
              )}

              <div className="storyboard-result">
                <div className="storyboard-result-copy">
                  {videoOf(selected) ? <div className="storyboard-result-thumb"><Thumb url={videoOf(selected)} video /></div> : <VideoCameraOutlined />}
                  <div className="storyboard-result-label"><strong>{videoOf(selected) ? "当前视频" : "等待视频"}</strong><span>{videoOf(selected) ? "可预览、上传替换或导出" : "上传已有视频，或生成这个镜头的视频"}</span></div>
                </div>
                <Space wrap>
                  <ShotVideoUpload key={selected.id} shotId={selected.id} onUploaded={refreshProject}/>
                  {videoOf(selected) && (
                    <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setPreview(videoOf(selected))}>
                      预览视频
                    </Button>
                  )}
                  {videoOf(selected) && (
                    <Button
                      size="small"
                      icon={<ClearOutlined />}
                      loading={erasing}
                      onClick={async () => {
                        try {
                          setErasing(true);
                          await api(`shots/${selected.id}/subtitle-erase`, "POST", { advanced: true });
                          message.success("已提交字幕擦除");
                          await refreshProject();
                        } catch (e) {
                          message.error((e as Error).message);
                        } finally {
                          setErasing(false);
                        }
                      }}
                    >
                      擦除字幕
                    </Button>
                  )}
                </Space>
              </div>

              <div className="storyboard-footer">
                <span className={`storyboard-save-state${dirty ? " is-dirty" : ""}`}>{dirty ? <ClockCircleOutlined /> : <CheckCircleOutlined />}{dirty ? "有未保存修改" : "修改已保存"}</span>
                <Button danger size="small" icon={<DeleteOutlined />} onClick={() => deleteShots([selected.id])}>
                  删除分镜
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {current && <EpisodeFinalVideo key={current.id} projectId={project!.id} episodeId={current.id} />}

      {importing && (
        <Importer kind="shots" onClose={() => setImporting(false)} />
      )}
      {generating && (
        <Generation
          kind="video"
          sourceIds={generating}
          onClose={() => setGenerating(null)}
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
    </div>
  );
}
