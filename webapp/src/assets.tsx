import { AssetImageExport } from "./asset-image-export";
import {ProjectStyle} from './project-style';
import { useState } from "react";
import {
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Select,
  Segmented,
  Space,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  PlusOutlined,
  ImportOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
  SettingOutlined,
  UploadOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { api, upload } from "./api";
import { useWorkspace } from "./context";
import { Action, Blank, FileUpload, Thumb } from "./common";
import { Importer } from "./importer";
import { Generation } from "./generation";
import { ProjectReferences } from "./project-references";
import type { Asset } from "./types";
export function AssetsPage() {
  const { project, refreshProject } = useWorkspace(),
    assets = project!.data.assets,
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState<string[]>([]),
    [editor, setEditor] = useState<string | null | undefined>(),
    [drawerOpen, setDrawerOpen] = useState(false),
    [commonOpen, setCommonOpen] = useState(false),
    [importing, setImporting] = useState(false),
    [generating, setGenerating] = useState<string[] | null>(null),
    [form] = Form.useForm(),
    [pendingReferences, setPendingReferences] = useState<{uid: string; file: File}[]>([]),
    [creationMode, setCreationMode] = useState<"generate" | "upload">("generate"),
    [localImage, setLocalImage] = useState<File | null>(null),
    [saving, setSaving] = useState(false),
    { message, modal } = App.useApp();
  const asset = assets.find((a) => a.id === editor);
  const edit = (a?: Asset, mode: "generate" | "upload" = "generate") => {
    setCreationMode(mode);
    setLocalImage(null);
    setPendingReferences([]);
    setEditor(a?.id || null);
    setDrawerOpen(true);
    form.setFieldsValue(
      a || { name: "", type: "角色", description: "", prompt: "" },
    );
  };
  const filtered = assets.filter(
    (a) =>
      (type === "all" || a.type === type) &&
      (!query || a.name.includes(query) || a.description.includes(query)) &&
      (status === "all" ||
        (status === "missing" && !a.image) ||
        (status === "locked" && a.locked) ||
        (status === "unfixed" && a.image && !a.locked)),
  );
  const lock = async (a: Asset, value: boolean) => {
    if (value && !a.selectedVersionId) throw Error("请先生成或上传图片");
    await api(`assets/${a.id}/locked-version`, "PUT", {
      versionId: value ? a.selectedVersionId : null,
    });
  };
  const save = async (v: any) => {
    if (!asset && creationMode === "upload" && !localImage) {
      message.error("请先选择要上传的资产图片"); return;
    }
    setSaving(true);
    try {
      const saved = await api(
        editor ? "assets/" + editor : `projects/${project!.id}/assets`,
        editor ? "PATCH" : "POST",
        { ...v, ...(!asset && creationMode === "upload" ? {prompt: "", description: ""} : {}), ...(asset ? { revision: asset.revision } : {}) },
      );
      const assetId = editor || saved.id;
      if (localImage || pendingReferences.length) {
        // Keep the created asset ID so an upload retry never creates a duplicate.
        setEditor(assetId);
        await refreshProject();
        if (localImage) {
          await upload(`assets/${assetId}/versions`, localImage);
          setLocalImage(null);
        }
        for (const reference of pendingReferences) {
          await upload(`assets/${assetId}/references`, reference.file);
          setPendingReferences((items) => items.filter((item) => item.uid !== reference.uid));
        }
      }
      await refreshProject();
      setDrawerOpen(false);
      message.success(pendingReferences.length ? "资产及生图参考图已保存" : "资产已保存");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>资产库</h1>
          <Typography.Text type="secondary">
            {assets.length} 个资产 · {assets.filter((a) => a.locked).length}{" "}
            个已固定
          </Typography.Text>
        </div>

      </div>
      <button className="asset-project-settings" onClick={() => setCommonOpen(true)}>
        <span className="asset-settings-icon"><SettingOutlined /></span>
        <span className="asset-settings-copy"><strong>项目公共设置</strong><span>统一资产的风格与参考图，应用于后续生图</span></span>
        <span className="asset-settings-summary">{project!.assetCommonPrompt ? "已设置公共风格" : "未设置公共风格"} · {project!.data.projectReferences?.length || 0} 张参考图</span>
        <span className="asset-settings-link">设置 →</span>
      </button>
      <section className="asset-workbench" aria-label="资产列表操作">
        <div className="asset-toolbar-row">
          <Segmented aria-label="资产分类" value={type} onChange={(v) => setType(String(v))}
            options={["all", "角色", "场景", "道具"].map((v) => ({value: v,
              label: `${v === "all" ? "全部" : v} ${v === "all" ? assets.length : assets.filter((a) => a.type === v).length}`,
            }))} />
          <Space wrap>
            <AssetImageExport />
            <Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>导入资产</Button>
            <Button icon={<UploadOutlined />} onClick={() => edit(undefined, "upload")}>上传资产</Button>
            <Button icon={<PlusOutlined />} onClick={() => edit()}>新建资产</Button>
          </Space>
        </div>
        <div className="asset-toolbar-row asset-search-row">
          <Input.Search aria-label="搜索资产" placeholder="搜索资产名称或描述" allowClear value={query}
            onChange={(e) => setQuery(e.target.value)} className="asset-search" />
          <Select aria-label="资产状态" value={status} onChange={setStatus} style={{minWidth: 128}}
            options={[
              {value: "all", label: "全部状态"}, {value: "missing", label: "待生成"},
              {value: "unfixed", label: "待固定"}, {value: "locked", label: "已固定"},
            ]} />
          <Typography.Text type="secondary" className="asset-results-count">显示 {filtered.length} 个资产</Typography.Text>
        </div>
        <div className={"asset-selection-row" + (selected.length ? " has-selection" : "")}>
          <Space wrap size={12}>
            <Checkbox aria-label="选择当前筛选的全部资产" disabled={!filtered.length}
              checked={filtered.length > 0 && filtered.every((a) => selected.includes(a.id))}
              indeterminate={filtered.some((a) => selected.includes(a.id)) && !filtered.every((a) => selected.includes(a.id))}
              onChange={(e) => setSelected((ids) => e.target.checked
                ? [...new Set([...ids, ...filtered.map((a) => a.id)])]
                : ids.filter((id) => !filtered.some((a) => a.id === id)))}>
              全选当前结果
            </Checkbox>
            <Button type="link" size="small" disabled={!filtered.some((a) => !a.image)}
              onClick={() => setSelected(filtered.filter((a) => !a.image).map((a) => a.id))}>选择待生成</Button>
            {selected.length > 0 && <>
              <span className="asset-selection-count">已选 {selected.length} 项</span>
              <Button type="text" size="small" onClick={() => setSelected([])}>取消选择</Button>
            </>}
          </Space>
          <Space wrap>
            {selected.length > 0 && <>
              <Action icon={<LockOutlined />} run={async () => {
                const targets = assets.filter((a) => selected.includes(a.id));
                if (targets.some((a) => !a.selectedVersionId)) throw Error("所选资产中有未生成图片的资产，请先生成后再固定");
                for (const a of targets) await lock(a, true);
                await refreshProject();
              }}>批量固定</Action>
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => modal.confirm({
                title: `删除所选 ${selected.length} 个资产？`,
                onOk: async () => {
                  for (const a of selected) await api("assets/" + a, "DELETE");
                  setSelected([]); await refreshProject();
                },
              })}>删除</Button>
            </>}
            <Button type="primary" icon={<PlayCircleOutlined />} disabled={!selected.length}
              onClick={() => setGenerating([...selected])}>{selected.length ? `生成所选 ${selected.length} 项` : "选择资产后生成"}</Button>
          </Space>
        </div>
      </section>
      <Drawer title="项目公共设置" open={commonOpen} onClose={() => setCommonOpen(false)} width={680}>
        <Typography.Paragraph type="secondary">设置统一的美术风格与参考图，后续生成时自动带入。已提交任务保持不变。</Typography.Paragraph>
        <ProjectStyle />
        <ProjectReferences />
      </Drawer>
      <div className="asset-grid asset-library-grid">
        {filtered.map((a) => (
          <Card
            key={a.id}
            className={
              "asset-card " + (selected.includes(a.id) ? "is-selected" : "")
            }
            styles={{ body: { padding: 16 } }}
            cover={
              <div className="asset-cover">
                <div
                  onClick={() => edit(a)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && edit(a)}
                >
                  <Thumb url={a.image} />
                </div>
                <Checkbox
                  aria-label={`选择资产 ${a.name}`}
                  className="asset-check"
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, a.id]
                        : ids.filter((i) => i !== a.id),
                    )
                  }
                />
                <Tag
                  className="asset-state"
                  icon={a.locked ? <LockOutlined /> : undefined}
                  color={a.locked ? "blue" : undefined}
                >
                  {a.locked ? "已固定" : a.image ? "待固定" : "待生成"}
                </Tag>
              </div>
            }
          >
            <div className="card-title">
              <strong onClick={() => edit(a)}>{a.name}</strong>
              <Tag>{a.type}</Tag>
            </div>
            <p className="asset-description">{a.description || a.prompt}</p>
            <Space wrap size={6} className="asset-card-actions">
              <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setGenerating([a.id])}>生成</Button>
              <Button size="small" onClick={() => edit(a)}>
                编辑
              </Button>
              <FileUpload url={`assets/${a.id}/versions`} onDone={refreshProject}
                label="上传" disabled={a.locked} />
              {a.image && (
                <Action
                  size="small"
                  run={async () => {
                    await lock(a, !a.locked);
                    await refreshProject();
                  }}
                >
                  {a.locked ? "解除固定" : "固定版本"}
                </Action>
              )}
            </Space>
          </Card>
        ))}
      </div>
      {!filtered.length && (
        <Blank
          text={
            assets.length
              ? "没有符合条件的资产"
              : "暂无资产，导入清单或新建资产"
          }
        />
      )}
      <Drawer
        title={asset?.name || "新建资产"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        afterOpenChange={(open) => {
          if (!open) setEditor(undefined);
        }}
        width={720}
        extra={
          <Action
            disabled={!asset}
            danger
            run={async () => {
              await api("assets/" + asset!.id, "DELETE");
              setDrawerOpen(false);
              await refreshProject();
            }}
          >
            删除
          </Action>
        }
        destroyOnHidden
      >
        {!asset && <div className="asset-creation-mode spaced">
          <Typography.Paragraph strong>选择创建方式</Typography.Paragraph>
          <Segmented block value={creationMode} aria-label="资产创建方式"
            disabled={saving} options={[{value: "generate", label: "AI 生成"}, {value: "upload", label: "上传图片"}]}
            onChange={(value) => {setCreationMode(value as "generate" | "upload"); setLocalImage(null); setPendingReferences([]);}} />
          <Typography.Paragraph type="secondary" style={{marginTop: 10, marginBottom: 0}}>
            {creationMode === "upload" ? "上传已有图片，保存后直接作为资产使用。" : "填写提示词，可添加参考图，再生成资产图片。"}
          </Typography.Paragraph>
        </div>}
        {!asset && creationMode === "upload" && <div className="spaced">
          <Upload.Dragger accept="image/png,image/jpeg,image/webp" maxCount={1}
            disabled={saving} fileList={localImage ? [{uid: "local-image", name: localImage.name, status: "done"}] : []}
            beforeUpload={(file) => {
              if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                message.error("请选择 PNG、JPG 或 WebP 图片"); return Upload.LIST_IGNORE;
              }
              setLocalImage(file);
              if (!form.getFieldValue("name")) form.setFieldValue("name", file.name.replace(/\.[^.]+$/, "").slice(0,80));
              return false;
            }} onRemove={() => {setLocalImage(null); return true;}}>
            <p><UploadOutlined style={{fontSize: 26, color: "#3366ff"}} /></p>
            <p>点击或拖入资产图片</p>
            <Typography.Text type="secondary">PNG / JPG / WebP，可直接作为资产使用，无需生成</Typography.Text>
          </Upload.Dragger>
        </div>}
        {asset && (
          <>
            <div className="asset-preview">
              <Thumb url={asset.image} large />
            </div>
            <div className="version-strip">
              {asset.versions.map((v) => (
                <Button
                  key={v.id}
                  className={
                    "version-item " +
                    (v.id === asset.selectedVersionId ? "active" : "")
                  }
                  disabled={asset.locked}
                  onClick={async () => {
                    try {
                      await api("assets/" + asset.id, "PATCH", {
                        revision: asset.revision,
                        selectedVersionId: v.id,
                      });
                      await refreshProject();
                    } catch (e) {
                      message.error((e as Error).message);
                    }
                  }}
                >
                  <img src={v.image} alt="图片版本" />
                </Button>
              ))}
            </div>
            <Space className="form-toolbar">
              <FileUpload
                url={`assets/${asset.id}/versions`}
                onDone={refreshProject}
                label="上传图片版本"
                disabled={asset.locked}
              />
              <Action
                icon={asset.locked ? <UnlockOutlined /> : <LockOutlined />}
                run={async () => {
                  await lock(asset, !asset.locked);
                  await refreshProject();
                }}
              >
                {asset.locked ? "解锁编辑" : "固定当前版本"}
              </Action>
            </Space>
          </>
        )}
        <Form
          form={form}
          layout="vertical"
          disabled={asset?.locked}
          onFinish={save}
        >
          <Form.Item name="name" label="资产名称" rules={[{ required: true }]}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select
              options={["角色", "场景", "道具"].map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Form.Item>
          {(asset || creationMode === "generate") && <>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          {(!asset || pendingReferences.length > 0) && <Form.Item label="生图参考图"
            extra={`仅用于引导 AI 生图，不会直接成为资产图片。自动继承 ${project!.data.projectReferences?.length || 0} 张公共参考图。`}>
            <Upload accept="image/png,image/jpeg,image/webp" multiple listType="picture"
              disabled={saving}
              fileList={pendingReferences.map((r) => ({uid: r.uid, name: r.file.name, status: "done", originFileObj: r.file as any}))}
              beforeUpload={(file) => {
                if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                  message.error("请选择 PNG、JPG 或 WebP 参考图"); return Upload.LIST_IGNORE;
                }
                setPendingReferences((items) => {
                  const limit = Math.max(0, 15 - (asset?.references.length || 0) - (project!.data.projectReferences?.length || 0));
                  if (items.length >= limit) return items;
                  return [...items, {uid: file.uid, file}];
                });
                return false;
              }} onRemove={(file) => {setPendingReferences((items) => items.filter((r) => r.uid !== file.uid)); return true;}}>
              <Button icon={<PlusOutlined />} disabled={saving || pendingReferences.length + (asset?.references.length || 0) + (project!.data.projectReferences?.length || 0) >= 15}>添加生图参考图</Button>
            </Upload>
            <Typography.Text type="secondary">最多合计 15 张，保存资产时上传；可移除后重新选择。</Typography.Text>
          </Form.Item>}
          <Form.Item
            name="prompt"
            label="图片生成提示词"
            rules={[{ required: !localImage && !asset?.image, message: "请填写生图提示词，或上传资产图片" }]}
          >
            <Input.TextArea placeholder="上传图片直接使用时可不填；需要 AI 生图时填写" rows={8} />
          </Form.Item>
          </>}
          <Button type="primary" htmlType="submit" loading={saving}>
            保存资产
          </Button>
        </Form>
        {asset && (
          <section className="drawer-section">
            <div className="section-heading">
              <h3>资产专属参考图</h3>
              <FileUpload
                url={`assets/${asset.id}/references`}
                onDone={refreshProject}
                label="添加参考图"
              />
            </div>
            <Typography.Paragraph type="secondary">
              自动继承项目公共参考图{" "}
              {project!.data.projectReferences?.length || 0}{" "}
              张，以下图片仅用于此资产。
            </Typography.Paragraph>
            <div className="reference-strip">
              {asset.references.map((r) => (
                <div key={r.id}>
                  <Image src={r.url} alt="参考图" width={100} />
                  <Action
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    run={async () => {
                      await api(
                        `assets/${asset.id}/references/${r.id}`,
                        "DELETE",
                      );
                      await refreshProject();
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </Drawer>
      {importing && (
        <Importer kind="assets" onClose={() => setImporting(false)} />
      )}{" "}
      {generating && (
        <Generation
          kind="image"
          sourceIds={generating}
          onClose={() => setGenerating(null)}
        />
      )}
    </>
  );
}
