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
  Space,
  Tag,
  Typography,
} from "antd";
import {
  PlusOutlined,
  ImportOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { api } from "./api";
import { useWorkspace } from "./context";
import { Action, Blank, FileUpload, Thumb } from "./common";
import { Importer } from "./importer";
import { Generation } from "./generation";
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
    [importing, setImporting] = useState(false),
    [generating, setGenerating] = useState(false),
    [form] = Form.useForm(),
    [saving, setSaving] = useState(false),
    { message, modal } = App.useApp();
  const asset = assets.find((a) => a.id === editor);
  const edit = (a?: Asset) => {
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
    setSaving(true);
    try {
      await api(
        editor ? "assets/" + editor : `projects/${project!.id}/assets`,
        editor ? "PATCH" : "POST",
        { ...v, ...(asset ? { revision: asset.revision } : {}) },
      );
      await refreshProject();
      setDrawerOpen(false);
      message.success("资产已保存");
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
        <Space wrap>
          <Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>
            导入资产
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => edit()}>
            新建资产
          </Button>
          <Button
            type="primary"
            disabled={!selected.length}
            onClick={() => setGenerating(true)}
          >
            生成所选 {selected.length || ""}
          </Button>
        </Space>
      </div>
      <div className="toolbar">
        <Space wrap>
          <Input.Search
            aria-label="搜索资产"
            placeholder="搜索名称、描述"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 240 }}
          />
          <Select
            value={type}
            onChange={setType}
            options={["all", "角色", "场景", "道具"].map((v) => ({
              value: v,
              label: v === "all" ? "全部类型" : v,
            }))}
          />
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "全部状态" },
              { value: "missing", label: "待生成" },
              { value: "unfixed", label: "待固定" },
              { value: "locked", label: "已固定" },
            ]}
          />
        </Space>
        <Space>
          <Button onClick={() => setSelected(filtered.map((a) => a.id))}>
            全选
          </Button>
          <Button
            onClick={() =>
              setSelected(assets.filter((a) => !a.image).map((a) => a.id))
            }
          >
            选择待生成
          </Button>
          {selected.length > 0 && (
            <>
              <Button onClick={() => setSelected([])}>取消选择</Button>
              <Action
                icon={<LockOutlined />}
                run={async () => {
                  for (const a of assets.filter((a) => selected.includes(a.id)))
                    await lock(a, true);
                  await refreshProject();
                }}
              >
                批量固定
              </Action>
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: `删除所选 ${selected.length} 个资产？`,
                    onOk: async () => {
                      for (const a of selected)
                        await api("assets/" + a, "DELETE");
                      setSelected([]);
                      await refreshProject();
                    },
                  })
                }
              >
                删除
              </Button>
            </>
          )}
        </Space>
      </div>
      <div className="asset-grid">
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
            <Space>
              <Button size="small" onClick={() => edit(a)}>
                编辑
              </Button>
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
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="prompt"
            label="图片生成提示词"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存资产
          </Button>
        </Form>
        {asset && (
          <section className="drawer-section">
            <div className="section-heading">
              <h3>生成参考图</h3>
              <FileUpload
                url={`assets/${asset.id}/references`}
                onDone={refreshProject}
                label="添加参考图"
              />
            </div>
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
          sourceIds={selected}
          onClose={() => setGenerating(false)}
        />
      )}
    </>
  );
}
