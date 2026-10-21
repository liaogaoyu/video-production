import { useState } from "react";
import { Alert, App, Button, Dropdown, Modal, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { api } from "./api";
import { useWorkspace } from "./context";

export async function downloadExport(exportId: string) {
  for (let i = 0; i < 900; i++) {
    const result = await api(`exports/${exportId}`);
    if (result.status === "succeeded") {
      location.assign(`/api/v1/exports/${exportId}/download`);
      return;
    }
    if (result.status === "failed")
      throw Error(result.errorMessage || "导出失败");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error("导出仍在处理中，请稍后重试。服务器会继续处理本次导出。");
}

export function ProjectExport() {
  const { project } = useWorkspace();
  const { message } = App.useApp();
  const [kind, setKind] = useState<"videos" | "jianying" | null>(null);
  const [busy, setBusy] = useState(false);
  const shots = project?.data.shots || [];
  const missing = shots.filter(
    (shot) =>
      !project?.data.jobs.some(
        (job) => job.sourceId === shot.id && job.status === "done" && job.video,
      ),
  );
  const completed = shots.length - missing.length;
  const submit = async () => {
    setBusy(true);
    try {
      const result = await api(`projects/${project!.id}/exports`, "POST", {
        kind,
        allowPartial: missing.length > 0,
      });
      await downloadExport(result.exportId);
      if (result.missing?.length && !missing.length)
        message.warning(
          `${result.missing.length} 个分镜的视频文件不可用，请查看包内缺失清单`,
        );
      message.success("导出完成，已开始下载");
      setKind(null);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Dropdown
        trigger={["click"]}
        disabled={busy || !shots.length}
        menu={{
          items: [
            { key: "jianying", label: "导出剪映草稿包（试用）" },
            { key: "videos", label: "按分镜顺序导出视频 ZIP" },
          ],
          onClick: ({ key }) => setKind(key as "videos" | "jianying"),
        }}
      >
        <Button
          icon={<DownloadOutlined />}
          loading={busy}
          disabled={!shots.length}
        >
          导出全部分镜
        </Button>
      </Dropdown>
      <Modal
        title={
          kind === "jianying"
            ? "导出剪映草稿包（试用）"
            : "按顺序导出全部分镜视频"
        }
        open={kind !== null}
        onCancel={() => {
          if (!busy) setKind(null);
        }}
        onOk={submit}
        confirmLoading={busy}
        okButtonProps={{ disabled: !completed }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        okText={
          busy
            ? "打包中，请稍候"
            : missing.length
              ? `仅导出已完成的 ${completed} 个分镜`
              : "导出并下载"
        }
      >
        <Typography.Paragraph>
          当前项目共 {shots.length} 个分镜，可导出 {completed}{" "}
          个。按集数、镜头编号排列，每个分镜使用最新成功且已下载的视频。
        </Typography.Paragraph>
        {!!missing.length && (
          <Alert
            type="warning"
            showIcon
            title={`${missing.length} 个分镜尚无视频，不会进入导出时间线`}
            description={
              missing
                .slice(0, 6)
                .map((shot) => `${shot.episode}-${shot.number} ${shot.title}`)
                .join("；") + (missing.length > 6 ? "……" : "")
            }
          />
        )}
        {kind === "jianying" && (
          <>
            <Typography.Paragraph style={{ marginTop: 16 }}>
              包含视频素材及连续时间线，保留原声，使用视频实际时长。下载并解压后，在本机运行包内
              Windows 或 Mac 导入脚本，再打开剪映。
            </Typography.Paragraph>
            <Alert
              type="info"
              showIcon
              title="剪映专业版兼容性试用"
              description="支持生成 Windows/Mac 草稿包；不同剪映版本可能不兼容。目前未完成两端剪映内打开与播放验收，请保留原视频。"
            />
          </>
        )}
        {kind === "videos" && (
          <Typography.Paragraph style={{ marginTop: 16 }}>
            下载包含按顺序编号的视频 ZIP 和缺失清单，可直接解压使用。
          </Typography.Paragraph>
        )}
        {busy && (
          <Typography.Paragraph style={{ marginTop: 16 }}>
            服务器正在打包，完成后会自动下载。
          </Typography.Paragraph>
        )}
      </Modal>
    </>
  );
}
