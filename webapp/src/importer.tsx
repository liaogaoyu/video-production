import { useState } from "react";
import { App, Alert, Button, Input, Modal, Space, Table, Upload } from "antd";
import { CopyOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { api, copy } from "./api";
import { useWorkspace } from "./context";
import storyboardSkill from "../../skills/coherent-storyboard/SKILL.md?raw";
import { buildShotInstructions, shotTemplate } from "./storyboard-instructions.mjs";
import assetSkill from "../../skills/consistent-assets/SKILL.md?raw";
import { buildAssetInstructions, assetTemplate } from "./asset-instructions.mjs";
const templates = {
  assets: assetTemplate,
  shots: shotTemplate,
};
export function Importer({
  kind,
  onClose,
}: {
  kind: "assets" | "shots";
  onClose: () => void;
}) {
  const { project, refreshProject } = useWorkspace(),
    [text, setText] = useState(""),
    [preview, setPreview] = useState<any[] | null>(null),
    [busy, setBusy] = useState(false),
    [copying, setCopying] = useState(false),
    [copied, setCopied] = useState(false),
    { message } = App.useApp();
  const parse = () => JSON.parse(text);
  const check = async () => {
    setBusy(true);
    try {
      const r = await api(`projects/${project!.id}/${kind}/import`, "POST", {
        ...parse(),
        mode: "preview",
      });
      setPreview(r.preview);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={kind === "assets" ? "导入资产清单" : "导入分镜脚本"}
      open
      onCancel={onClose}
      width={820}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button loading={busy} onClick={check}>
            检查内容
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!preview?.some((r) => r.accepted)}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api(
                  `projects/${project!.id}/${kind}/import`,
                  "POST",
                  { ...parse(), mode: "commit" },
                );
                await refreshProject();
                message.success(`已导入 ${r.created.length} 条内容`);
                onClose();
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
          accept=".json"
          showUploadList={false}
          beforeUpload={(file) => {
            file.text().then((v) => {
              setText(v);
              setPreview(null);
            });
            return false;
          }}
        >
          <Button icon={<FolderOpenOutlined />}>选择本地 JSON</Button>
        </Upload>
        <Button
          icon={<CopyOutlined />}
          loading={copying}
          onClick={async (event) => {
            const anchor = event.currentTarget;
            setCopying(true);
            setCopied(false);
            try {
              await copy(
                kind === "shots"
                  ? buildShotInstructions(storyboardSkill, project)
                  : buildAssetInstructions(assetSkill, project),
                anchor,
              );
              setCopied(true);
              message.success("已复制，可粘贴到 Codex 使用");
            } catch (error) {
              message.error((error as Error).message);
            } finally {
              setCopying(false);
            }
          }}
        >
          {copied ? "已复制 Codex 指令" : "复制 Codex 指令"}
        </Button>
      </Space>
      {kind === "shots" && (
        <Alert className="spaced" type="info" title="Codex 指令已包含连贯分镜规则：优先 15 秒，其次 14 秒；连续动作合并，必要时自然拆分。" />
      )}
      {kind === "assets" && (
        <Alert className="spaced" type="info" title="剧情忠于原文，外观主动设计：按角色定位塑造气质与辨识度，统一美术风格；人物三列全身＋面部/俯视，场景四视角，道具单图。" />
      )}
      <Input.TextArea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={14}
        placeholder={JSON.stringify(templates[kind], null, 2)}
        className="json-input"
      />
      {preview && (
        <>
          <Alert
            className="spaced"
            type={preview.some((r) => !r.accepted) ? "warning" : "success"}
            title={`${preview.filter((r) => r.accepted).length} 条可导入，${preview.filter((r) => !r.accepted).length} 条跳过`}
          />
          <Table
            size="small"
            rowKey={(_, i) => String(i)}
            dataSource={preview}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: "名称", render: (_, r) => r.name || r.title },
              {
                title: "检查结果",
                render: (_, r) => (r.accepted ? "可导入" : r.reason),
              },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
