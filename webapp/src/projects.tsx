import { useState } from "react";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  PlusOutlined,
  ImportOutlined,
  ArrowRightOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { api, upload } from "./api";
import { useWorkspace } from "./context";
import { Action, Blank } from "./common";
import type { Project } from "./types";
export function ProjectsPage() {
  const { projects, reload, go } = useWorkspace(),
    [editing, setEditing] = useState<Project | null | undefined>(),
    [busy, setBusy] = useState(false),
    [form] = Form.useForm(),
    { message } = App.useApp();
  const edit = (p?: Project) => {
    setEditing(p || null);
    form.setFieldsValue(
      p
        ? { ...p, ratio: p.data.settings.ratio }
        : { name: "", description: "", style: "", ratio: "16:9" },
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>我的项目</h1>
          <Typography.Text type="secondary">
            {projects.length} 个项目
          </Typography.Text>
        </div>
        <Space>
          <Upload
            accept=".zip"
            showUploadList={false}
            beforeUpload={(file) => {
              upload("imports", file)
                .then(reload)
                .then(() => message.success("项目已导入"))
                .catch((e) => message.error(e.message));
              return false;
            }}
          >
            <Button icon={<ImportOutlined />}>导入项目包</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>
            新建项目
          </Button>
        </Space>
      </div>
      <div className="project-grid">
        {projects.map((p) => (
          <Card
            key={p.id}
            className="project-card"
            title={p.name}
            extra={
              <Space>
                <Button
                  type="text"
                  size="small"
                  aria-label={"编辑" + p.name}
                  icon={<EditOutlined />}
                  onClick={() => edit(p)}
                />
                <Popconfirm
                  title="删除这个项目？"
                  description="已提交的任务仍会继续归档。"
                  onConfirm={async () => {
                    await api("projects/" + p.id, "DELETE");
                    await reload();
                  }}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    aria-label={"删除" + p.name}
                    icon={<DeleteOutlined />}
                  />
                </Popconfirm>
              </Space>
            }
          >
            <p className="project-description">
              {p.description || "暂无项目简介"}
            </p>
            <div className="project-stats">
              <span>{p.data.assets.length} 资产</span>
              <span>{p.data.shots.length} 分镜</span>
              <Tag>{p.data.settings.ratio}</Tag>
            </div>
            <Button
              type="primary"
              ghost
              block
              icon={<ArrowRightOutlined />}
              onClick={() => go("assets", p.id)}
            >
              进入项目
            </Button>
          </Card>
        ))}
      </div>
      {!projects.length && <Blank text="新建项目，开始创作" />}
      <Modal
        title={editing ? "编辑项目" : "新建项目"}
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        confirmLoading={busy}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setBusy(true);
            try {
              const result = await api(
                "projects" + (editing ? "/" + editing.id : ""),
                editing ? "PATCH" : "POST",
                { ...v, ...(editing ? { revision: editing.revision } : {}) },
              );
              await reload();
              setEditing(undefined);
              if (!editing) go("assets", result.project.id);
              message.success("项目已保存");
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: "请输入项目名称" }]}
          >
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="description" label="项目简介">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item name="ratio" label="画幅">
            <Select
              options={["16:9", "9:16", "1:1"].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="style" label="风格备注">
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
