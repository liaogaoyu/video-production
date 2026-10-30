import { useEffect, useState } from "react";
import { App, Alert, Button, Card, Input, Space } from "antd";
import { api } from "./api";
import { useWorkspace } from "./context";
export function ProjectStyle() {
  const { project, refreshProject } = useWorkspace(),
    [value, setValue] = useState(project?.assetCommonPrompt || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    { message } = App.useApp();
  useEffect(
    () => setValue(project?.assetCommonPrompt || ""),
    [project?.id, project?.assetCommonPrompt],
  );
  return (
    <Card className="spaced" title="公共资产风格提示词">
      <Input.TextArea
        aria-label="公共资产风格提示词"
        rows={3}
        maxLength={10000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="例如：真人实拍，秋日下午暖金日光，统一木色、米白与朱红配色。"
      />
      <Space className="spaced">
        <Button
          type="primary"
          loading={busy}
          disabled={value === (project?.assetCommonPrompt || "")}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("projects/" + project!.id, "PATCH", {
                revision: project!.revision,
                assetCommonPrompt: value,
              });
              await refreshProject();
              message.success("公共提示词已保存，仅影响后续生图");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          保存公共提示词
        </Button>
        <Button onClick={() => setValue("")}>清空</Button>
      </Space>
      <p className="muted">
        新任务自动组合公共提示词、当前资产提示词和展示规则。场景始终无人；已提交任务不受后续修改影响。
      </p>
      {error && <Alert type="error" title={error} />}
    </Card>
  );
}
