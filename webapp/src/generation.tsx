import { useRef, useState } from "react";
import { App, Alert, Form, Modal, Select, Typography } from "antd";
import { api, id } from "./api";
import { useWorkspace } from "./context";
import type { Account } from "./types";
export function Generation({
  kind,
  sourceIds,
  onClose,
}: {
  kind: "image" | "video";
  sourceIds: string[];
  onClose: () => void;
}) {
  const { project, refreshProject, go } = useWorkspace(),
    { message } = App.useApp(),
    [form] = Form.useForm(),
    [busy, setBusy] = useState(false),
    [accounts, setAccounts] = useState<Account[]>([]),
    [error, setError] = useState(""),
    key = useRef(id()),
    channel = Form.useWatch("channel", form) || "jimeng";
  const loadAccounts = () =>
    api("dreamina-web/accounts")
      .then((r) =>
        setAccounts(
          r.accounts.filter((a: Account) => a.authorized && a.enabled),
        ),
      )
      .catch((e) => setError(e.message));
  return (
    <Modal
      open
      title={kind === "image" ? "提交生图任务" : "生成分镜视频"}
      onCancel={onClose}
      confirmLoading={busy}
      okText="确认并提交"
      onOk={() => form.submit()}
      width={560}
    >
      <Typography.Paragraph>
        共 {sourceIds.length} 个任务 · {project!.data.settings.ratio}
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          channel: "jimeng",
          model: "seedance2.0",
          resolution: "720p",
          webModel: "jimeng-video-seedance-2.0-fast",
          accountId: "auto",
        }}
        onFinish={async (v) => {
          setBusy(true);
          setError("");
          try {
            const web = kind === "video" && v.channel === "web";
            await api(
              `projects/${project!.id}/${web ? "web-video-jobs" : "jobs/batch"}`,
              "POST",
              {
                kind,
                sourceIds,
                ratio: project!.data.settings.ratio,
                ...(web
                  ? { model: v.webModel, accountId: v.accountId }
                  : {
                      model: kind === "video" ? v.model : undefined,
                      resolution: v.resolution,
                    }),
              },
              key.current,
            );
            await refreshProject();
            onClose();
            go("jobs", project!.id);
            message.success("任务已提交，关闭页面后仍会继续执行");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === "video" && (
          <>
            <Form.Item name="channel" label="视频渠道">
              <Select
                onChange={(v) => v === "web" && loadAccounts()}
                options={[
                  { value: "jimeng", label: "即梦国内 CLI" },
                  { value: "web", label: "Dreamina 国际网页" },
                ]}
              />
            </Form.Item>
            {channel === "web" ? (
              <>
                <Form.Item name="accountId" label="账号">
                  <Select
                    options={[
                      { value: "auto", label: "账号池自动分配" },
                      ...accounts.map((a) => ({
                        value: a.id,
                        label: `${a.name} · ${a.totalCredit ?? "余额未知"}`,
                      })),
                    ]}
                  />
                </Form.Item>
                <Form.Item name="webModel" label="模型">
                  <Select
                    options={[
                      {
                        value: "jimeng-video-seedance-2.0-fast",
                        label: "Seedance 2.0 Fast",
                      },
                      {
                        value: "jimeng-video-seedance-2.0",
                        label: "Seedance 2.0",
                      },
                    ]}
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item name="model" label="模型">
                  <Select
                    options={[
                      "seedance2.0",
                      "seedance2.0fast",
                      "seedance2.0_vip",
                      "seedance2.0fast_vip",
                      "seedance2.5",
                    ].map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
                <Form.Item name="resolution" label="分辨率">
                  <Select
                    options={["720p", "1080p"].map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </Form.Item>
              </>
            )}
          </>
        )}
      </Form>
      <Alert
        type="info"
        title={
          kind === "image"
            ? `使用已保存的生图配置，自动携带 ${project!.data.projectReferences?.length || 0} 张公共参考图及各资产专属参考图`
            : "按分镜时长生成，携带已绑定资产的固定图片；生成将消耗账号积分。"
        }
      />
      {error && (
        <Alert className="spaced" type="error" showIcon title={error} />
      )}
    </Modal>
  );
}
