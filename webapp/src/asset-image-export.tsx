import { useState } from "react";
import { App, Button, Dropdown } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { api } from "./api";
import { useWorkspace } from "./context";
import { downloadExport } from "./project-export";

export function AssetImageExport() {
  const { project } = useWorkspace();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const available = project!.data.assets.some(asset => asset.versions.length > 0);
  const run = async (allVersions: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api(`projects/${project!.id}/exports`, "POST", { kind: "asset-images", allVersions });
      await downloadExport(result.exportId);
      message.success(`已导出 ${result.imageCount} 张资产图片`);
      if (result.missing?.length) message.warning(`${result.missing.length} 张图片文件不可用，已跳过`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return <Dropdown disabled={busy || !available} trigger={["click"]} menu={{
    items: [
      { key: "current", label: "导出当前图片（每个资产一张）" },
      { key: "all", label: "导出全部图片（包含历史版本）" },
    ],
    onClick: ({ key }) => { void run(key === "all"); },
  }}><Button icon={<DownloadOutlined />} loading={busy} disabled={!available || busy}>导出图片 ZIP</Button></Dropdown>;
}
