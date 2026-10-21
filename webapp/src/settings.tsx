import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  LoginOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { api, time } from "./api";
import { useWorkspace } from "./context";
import { Action } from "./common";
import type { Account } from "./types";
export function SettingsPage() {
  const { user, setUser } = useWorkspace(),
    [domestic, setDomestic] = useState<Account[]>([]),
    [international, setInternational] = useState<Account[]>([]),
    [pool, setPool] = useState({ strategy: "round-robin", remoteTaskLimit: 3 }),
    [runtime, setRuntime] = useState<any>({}),
    [savedKey, setSavedKey] = useState(false),
    [loading, setLoading] = useState(true),
    [add, setAdd] = useState<"domestic" | "international" | null>(null),
    [auth, setAuth] = useState<Account | null>(null),
    [login, setLogin] = useState<Account | null>(null),
    [modelForm] = Form.useForm(),
    [addForm] = Form.useForm(),
    [securityForm] = Form.useForm(),
    [saving, setSaving] = useState(false),
    { message } = App.useApp();
  const refresh = async () => {
    const [d, w, r] = await Promise.all([
      api("jimeng/accounts"),
      api("dreamina-web/accounts"),
      api("system/runtime"),
    ]);
    setDomestic(d.accounts);
    setInternational(w.accounts);
    setPool(d.pool);
    setRuntime(r);
  };
  useEffect(() => {
    let live = true;
    Promise.all([refresh(), api("connections/image")])
      .then(([, v]) => {
        if (live) {
          setSavedKey(v.apiKeySaved);
          modelForm.setFieldsValue({ ...v, apiKey: "" });
        }
      })
      .catch((e) => message.error(e.message))
      .finally(() => live && setLoading(false));
    securityForm.setFieldsValue({ username: user?.username });
    return () => {
      live = false;
    };
  }, []);
  if (loading)
    return (
      <div className="page-loading">
        <Spin />
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>模型与账号</h1>
          <Typography.Text type="secondary">配置保存在服务器</Typography.Text>
        </div>
        <Action run={refresh} icon={<ReloadOutlined />}>
          刷新状态
        </Action>
      </div>
      <div className="settings-grid">
        <div>
          <Card title="生图模型">
            <Form
              form={modelForm}
              layout="vertical"
              onFinish={async (v) => {
                setSaving(true);
                try {
                  const result = await api("connections/image", "PUT", v);
                  setSavedKey(result.apiKeySaved);
                  modelForm.setFieldsValue({ ...result, apiKey: "" });
                  message.success("生图配置已保存");
                } catch (e) {
                  message.error((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Form.Item name="name" label="配置名称">
                <Input />
              </Form.Item>
              <Form.Item
                name="baseUrl"
                label="接口地址"
                rules={[
                  { required: true },
                  { type: "url", message: "请输入完整接口地址" },
                ]}
              >
                <Input placeholder="https://服务地址/v1" />
              </Form.Item>
              <Form.Item
                name="model"
                label="模型名称"
                rules={[{ required: true }]}
              >
                <Input placeholder="gpt-image-2" />
              </Form.Item>
              <Form.Item name="resolution" label="输出分辨率（APIMart）">
                <Select
                  options={["1k", "2k", "4k"].map((value) => ({
                    value,
                    label: value.toUpperCase(),
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="apiKey"
                label="API Key"
                extra={savedKey ? "已加密保存，留空保留原密钥" : ""}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存配置
              </Button>
            </Form>
          </Card>
          <Card title="登录账号" className="spaced">
            {user ? (
              <Form
                form={securityForm}
                layout="vertical"
                onFinish={async (v) => {
                  try {
                    const r = await api("auth/password", "PUT", v);
                    setUser(r.user);
                    securityForm.resetFields([
                      "currentPassword",
                      "password",
                      "confirm",
                    ]);
                    message.success("账号密码已更新，其他登录会话已退出");
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                }}
              >
                <Form.Item
                  label="登录账号"
                  name="username"
                  rules={[{ required: true }]}
                >
                  <Input autoComplete="username" />
                </Form.Item>
                <Form.Item
                  label="当前密码"
                  name="currentPassword"
                  rules={[{ required: true }]}
                >
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
                <Form.Item
                  label="新密码"
                  name="password"
                  rules={[
                    { required: true, min: 8, message: "新密码至少 8 位" },
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Form.Item
                  label="确认新密码"
                  name="confirm"
                  dependencies={["password"]}
                  rules={[
                    { required: true },
                    ({ getFieldValue }) => ({
                      validator(_, v) {
                        return !v || getFieldValue("password") === v
                          ? Promise.resolve()
                          : Promise.reject(Error("两次密码不一致"));
                      },
                    }),
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Button htmlType="submit">更新账号密码</Button>
              </Form>
            ) : (
              <Alert
                type="info"
                title="本地环境尚未启用登录"
                description="服务器登录账号由管理员初始化。"
              />
            )}
          </Card>
        </div>
        <div>
          <Card
            title={
              <Space>
                即梦国内 CLI <Tag>{domestic.length}</Tag>
              </Space>
            }
            extra={
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  addForm.resetFields();
                  setAdd("domestic");
                }}
              >
                添加账号
              </Button>
            }
          >
            <Alert
              type={runtime.cli?.available ? "success" : "warning"}
              title={runtime.cli?.message || "正在检查 CLI 环境"}
              className="form-toolbar"
            />
            {domestic.map((a) => (
              <div className="account-row" key={a.id}>
                <div className="account-info">
                  <strong>{a.name}</strong>
                  <p className="muted">{a.cliMessage}</p>
                  <span className="muted">
                    {a.totalCredit == null
                      ? "积分未查询"
                      : `${a.totalCredit} 积分`}
                  </span>
                </div>
                <Space wrap>
                  <Button size="small" onClick={() => setAuth(a)}>
                    CLI 授权
                  </Button>
                  <Action
                    size="small"
                    run={async () => {
                      await api(`jimeng/accounts/${a.id}/check`, "POST", {});
                      message.success("已安排检查");
                      setTimeout(() => refresh().catch(() => {}), 3000);
                    }}
                  >
                    检查
                  </Action>
                  <Switch
                    size="small"
                    checked={a.enabled}
                    onChange={async (enabled) => {
                      try {
                        await api("jimeng/accounts/" + a.id, "PATCH", {
                          enabled,
                        });
                        await refresh();
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    }}
                  />
                  <Popconfirm
                    title="移除此账号？"
                    onConfirm={async () => {
                      await api("jimeng/accounts/" + a.id, "DELETE");
                      await refresh();
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                </Space>
              </div>
            ))}
            {!domestic.length && (
              <Typography.Text type="secondary">暂无账号</Typography.Text>
            )}
            <div className="pool-settings">
              <label>
                分配方式
                <Select
                  value={pool.strategy}
                  options={[
                    { value: "round-robin", label: "轮流分配" },
                    { value: "least-busy", label: "空闲优先" },
                  ]}
                  onChange={async (strategy) => {
                    await api("jimeng/pool", "PUT", { ...pool, strategy });
                    await refresh();
                  }}
                />
              </label>
              <label>
                每账号同时生成的视频数
                <Select
                  value={pool.remoteTaskLimit}
                  options={[1, 2, 3, 5, 10].map((v) => ({
                    value: v,
                    label: String(v),
                  }))}
                  onChange={async (remoteTaskLimit) => {
                    try {
                      await api("jimeng/pool", "PUT", {
                        ...pool,
                        remoteTaskLimit,
                      });
                      await refresh();
                      message.success("并发设置已保存");
                    } catch (e) {
                      message.error((e as Error).message);
                    }
                  }}
                />
              </label>
            </div>
          </Card>
          <Card
            className="spaced"
            title={
              <Space>
                Dreamina 国际网页 <Tag>{international.length}</Tag>
              </Space>
            }
            extra={
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  addForm.resetFields();
                  setAdd("international");
                }}
              >
                添加账号
              </Button>
            }
          >
            <Typography.Paragraph type="secondary">
              Seedance 2.0 / Fast · 服务端保存登录态
            </Typography.Paragraph>
            {international.map((a) => (
              <div className="account-row" key={a.id}>
                <div className="account-info">
                  <strong>
                    {a.name} <Tag>{a.region.toUpperCase()}</Tag>
                  </strong>
                  <p className="muted">
                    {a.authorized ? "已登录" : "待登录"} ·{" "}
                    {a.totalCredit == null
                      ? "余额未查询"
                      : a.totalCredit + " 积分"}
                  </p>
                  {a.error && <p className="job-error">{a.error}</p>}
                  <small className="muted">
                    {a.checkedAt ? "更新于 " + time(a.checkedAt) : ""}
                  </small>
                </div>
                <Space wrap>
                  <Select
                    size="small"
                    aria-label={a.name + "并发数"}
                    value={a.maxConcurrent}
                    options={Array.from({ length: 10 }, (_, i) => ({
                      value: i + 1,
                      label: "并发 " + (i + 1),
                    }))}
                    onChange={async (maxConcurrent) => {
                      try {
                        await api("dreamina-web/accounts/" + a.id, "PATCH", {
                          maxConcurrent,
                        });
                        await refresh();
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    }}
                  />
                  <Button
                    size="small"
                    icon={<LoginOutlined />}
                    onClick={() => setLogin(a)}
                  >
                    网页登录
                  </Button>
                  <Action
                    size="small"
                    run={async () => {
                      await api(
                        `dreamina-web/accounts/${a.id}/check`,
                        "POST",
                        {},
                      );
                      await refresh();
                      message.success("余额已更新");
                    }}
                  >
                    检查积分
                  </Action>
                  <Switch
                    size="small"
                    checked={a.enabled}
                    onChange={async (enabled) => {
                      try {
                        await api("dreamina-web/accounts/" + a.id, "PATCH", {
                          enabled,
                        });
                        await refresh();
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    }}
                  />
                </Space>
              </div>
            ))}
            {!international.length && (
              <Typography.Text type="secondary">暂无账号</Typography.Text>
            )}
          </Card>
        </div>
      </div>
      <Modal
        open={!!add}
        title={add === "domestic" ? "添加即梦账号" : "添加国际网页账号"}
        onCancel={() => setAdd(null)}
        onOk={() => addForm.submit()}
      >
        <Form
          form={addForm}
          layout="vertical"
          initialValues={{ region: "us" }}
          onFinish={async (v) => {
            try {
              await api(
                add === "domestic"
                  ? "jimeng/accounts"
                  : "dreamina-web/accounts",
                "POST",
                v,
              );
              await refresh();
              setAdd(null);
              message.success("账号已添加");
            } catch (e) {
              message.error((e as Error).message);
            }
          }}
        >
          <Form.Item name="name" label="账号别名" rules={[{ required: true }]}>
            <Input maxLength={60} />
          </Form.Item>
          {add === "international" && (
            <Form.Item name="region" label="地区">
              <Select
                options={[
                  { value: "us", label: "美国" },
                  { value: "hk", label: "香港" },
                  { value: "jp", label: "日本" },
                  { value: "sg", label: "新加坡" },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
      {auth && (
        <CliAuth
          account={auth}
          onClose={() => setAuth(null)}
          onDone={refresh}
        />
      )}{" "}
      {login && (
        <BrowserLogin
          account={login}
          onClose={() => setLogin(null)}
          onDone={refresh}
        />
      )}
    </>
  );
}
function CliAuth({
  account,
  onClose,
  onDone,
}: {
  account: Account;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [session, setSession] = useState<any>({ status: "starting" }),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    api(`jimeng/accounts/${account.id}/auth-sessions`, "POST", {})
      .then((r) => {
        const poll = async () => {
          if (!alive) return;
          try {
            const s = await api("jimeng/auth-sessions/" + r.authSessionId);
            if (!alive) return;
            setSession(s);
            if (s.status === "authorized") {
              await onDone();
              onClose();
              return;
            }
            if (["failed", "expired", "cancelled"].includes(s.status)) return;
          } catch (e) {
            setError((e as Error).message);
          }
          if (alive) timer = setTimeout(poll, 1500);
        };
        poll();
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return (
    <Modal
      open
      title={"授权账号 · " + account.name}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <Typography.Paragraph>
        请在即梦官方授权页确认使用这个账号登录。
      </Typography.Paragraph>
      {session.authorizationUrl?.startsWith("https://jimeng.jianying.com/") ? (
        <Button
          type="primary"
          href={session.authorizationUrl}
          target="_blank"
          rel="noopener"
        >
          打开即梦授权页
        </Button>
      ) : (
        !error && <Spin />
      )}
      <p className="spaced">
        {session.message ||
          (["queued", "starting"].includes(session.status)
            ? "正在准备授权地址…"
            : "等待官方授权…")}
      </p>
      {error && <Alert type="error" title={error} />}
    </Modal>
  );
}
function BrowserLogin({
  account,
  onClose,
  onDone,
}: {
  account: Account;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [frame, setFrame] = useState(""),
    [text, setText] = useState(""),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    { message } = App.useApp();
  const base = `dreamina-web/accounts/${account.id}/login`;
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const f = await api(base + "/frame");
        if (alive) setFrame("data:image/jpeg;base64," + f.image);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
      if (alive) timer = setTimeout(poll, 1200);
    };
    api(base, "POST", {})
      .then(() => {
        if (alive) {
          setReady(true);
          poll();
        } else api(base, "DELETE").catch(() => {});
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
      clearTimeout(timer);
      api(base, "DELETE").catch(() => {});
    };
  }, []);
  const input = async (body: unknown) => {
    try {
      await api(base + "/input", "POST", body);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      open
      title={"网页登录 · " + account.name}
      width={1160}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button
            type="primary"
            disabled={!ready}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api(base + "/finish", "POST", {});
                await onDone();
                message.success("登录态已保存");
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            已登录，保存账号
          </Button>
        </Space>
      }
    >
      {error && <Alert type="warning" title={error} className="form-toolbar" />}
      {!frame ? (
        <div className="page-loading">
          <Spin description="正在启动服务端浏览器" />
        </div>
      ) : (
        <img
          className="remote-browser"
          src={frame}
          alt="服务端登录窗口"
          tabIndex={0}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.focus();
            input({
              type: "click",
              x: ((e.clientX - r.left) * 1100) / r.width,
              y: ((e.clientY - r.top) * 760) / r.height,
            });
          }}
          onWheel={(e) => input({ type: "scroll", delta: e.deltaY })}
          onKeyDown={(e) => {
            if (
              [
                "Tab",
                "Enter",
                "Backspace",
                "Escape",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
              ].includes(e.key)
            ) {
              e.preventDefault();
              input({ type: "key", key: e.key });
            } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              input({ type: "text", text: e.key });
            }
          }}
        />
      )}
      <Space.Compact block className="spaced">
        <Input.Password
          disabled={!ready}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="先点击网页输入框，再在这里输入文字"
        />
        <Button
          disabled={!ready}
          onClick={() => {
            input({ type: "text", text });
            setText("");
          }}
        >
          输入到网页
        </Button>
        {["Tab", "Enter", "Backspace"].map((key) => (
          <Button
            key={key}
            disabled={!ready}
            onClick={() => input({ type: "key", key })}
          >
            {key === "Backspace" ? "退格" : key}
          </Button>
        ))}
      </Space.Compact>
    </Modal>
  );
}
