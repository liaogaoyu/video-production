import { Card, Image, Space, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { Action, FileUpload } from "./common";
import { useWorkspace } from "./context";
import { api } from "./api";

export function ProjectReferences() {
  const { project, refreshProject } = useWorkspace();
  const references = project!.data.projectReferences || [];
  return (
    <Card
      size="small"
      className="spaced"
      title={`项目公共参考图 · ${references.length}/15`}
      extra={
        <FileUpload
          url={`projects/${project!.id}/references`}
          label="上传公共参考图"
          onDone={refreshProject}
          disabled={references.length >= 15}
        />
      }
    >
      <Typography.Paragraph type="secondary">
        当前项目所有资产生成时自动携带，也适用于之后新建的资产。与资产专属参考图合并去重后最多
        15 张，已提交的任务保持原参考图。
      </Typography.Paragraph>
      {references.length ? (
        <Image.PreviewGroup>
          <Space wrap align="start">
            {references.map((reference, index) => (
              <div key={reference.id} className="project-reference-item">
                <Image
                  src={reference.url}
                  alt={`公共参考图 ${index + 1}`}
                  width={88}
                  height={88}
                  style={{ objectFit: "cover", borderRadius: 6 }}
                />
                <Action
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`移除公共参考图 ${index + 1}`}
                  run={async () => {
                    await api(
                      `projects/${project!.id}/references/${reference.id}`,
                      "DELETE",
                    );
                    await refreshProject();
                  }}
                >
                  移除
                </Action>
              </div>
            ))}
          </Space>
        </Image.PreviewGroup>
      ) : (
        <Typography.Text type="secondary">
          上传统一风格、人物外观或场景设定等参考图片。
        </Typography.Text>
      )}
    </Card>
  );
}
