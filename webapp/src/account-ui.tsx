import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { api, time } from "./api";
import { useWorkspace } from "./context";
import type { User } from "./types";
export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [enabled, setEnabled] = useState(false),
    [form] = Form.useForm(),
    { message } = App.useApp();
  useEffect(() => {
    api("auth/registration")
      .then((r) => setEnabled(r.enabled))
      .catch(() => {});
  }, []);
  const titles: any = {
    login: "登录工作台",
    register: "邮箱注册",
    verify: "验证邮箱",
    forgot: "找回密码",
    reset: "设置新密码",
  };
  return (
    <main className="login-page">
      <section className="login-card">
        <Typography.Title level={2}>{titles[mode]}</Typography.Title>
        <Typography.Paragraph type="secondary">
          创作属于你的故事，项目与积分独立保存。
        </Typography.Paragraph>
        {error && <Alert type="error" title={error} />}
        <Form
          form={form}
          layout="vertical"
          size="large"
          onFinish={async (v) => {
            setBusy(true);
            setError("");
            try {
              if (mode === "login") {
                const r = await api("auth/login", "POST", {
                  username: v.username,
                  password: v.password,
                });
                onLogin(r.user);
              } else if (mode === "register") {
                await api("auth/register", "POST", {
                  email: v.email,
                  password: v.password,
                });
                setMode("verify");
                message.success("验证码已发送，请检查邮箱和垃圾邮件");
              } else if (mode === "verify") {
                await api("auth/email/verify", "POST", {
                  email: v.email,
                  code: v.code,
                });
                form.setFieldsValue({ username: v.email, code: "" });
                setMode("login");
                message.success("邮箱验证成功，请登录");
              } else if (mode === "forgot") {
                await api("auth/password/forgot", "POST", { email: v.email });
                setMode("reset");
                message.info("如邮箱已注册，验证码将发送到该邮箱");
              } else {
                await api("auth/password/reset", "POST", {
                  email: v.email,
                  code: v.code,
                  password: v.password,
                });
                setMode("login");
                form.setFieldsValue({
                  username: v.email,
                  password: "",
                  code: "",
                });
                message.success("密码已重置，请重新登录");
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "login" ? (
            <Form.Item
              name="username"
              label="邮箱 / 管理员账号"
              rules={[{ required: true }]}
            >
              <Input autoComplete="username" autoFocus />
            </Form.Item>
          ) : (
            <Form.Item
              name="email"
              label="邮箱"
              rules={[{ required: true, type: "email" }]}
            >
              <Input autoComplete="email" />
            </Form.Item>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <Form.Item
              name="password"
              label={mode === "reset" ? "新密码" : "密码"}
              rules={[
                { required: true },
                { min: mode === "login" ? 1 : 8, message: "密码至少8位" },
              ]}
            >
              <Input.Password
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </Form.Item>
          )}
          {["verify", "reset"].includes(mode) && (
            <Form.Item
              name="code"
              label="6位邮箱验证码"
              rules={[{ required: true, len: 6 }]}
            >
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block loading={busy}>
            {mode === "forgot" ? "发送验证码" : titles[mode]}
          </Button>
        </Form>
        <Space wrap className="spaced">
          <Button
            type="link"
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            登录
          </Button>
          <Button
            type="link"
            disabled={!enabled}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            {enabled ? "注册账号" : "注册暂未开放"}
          </Button>
          <Button
            type="link"
            onClick={() => {
              setMode("forgot");
              setError("");
            }}
          >
            忘记密码
          </Button>
          {mode === "verify" && (
            <Button
              type="link"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("auth/email/resend", "POST", {
                    email: form.getFieldValue("email"),
                  });
                  message.success("已重新发送");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              重新发送
            </Button>
          )}
        </Space>
      </section>
    </main>
  );
}
const actions: any = {
  topup: "微信充值",
  adjust: "后台调整",
  freeze: "生成冻结",
  settle: "成功结算",
  refund: "失败退回",
};
export function WalletPage() {
  const { user, setUser } = useWorkspace(),
    [data, setData] = useState<any>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    { message } = App.useApp();
  const load = () =>
    Promise.all([
      api("me/wallet"),
      api("me/ledger"),
      api("recharge-instructions"),
    ])
      .then(([w, l, r]) => {
        setData({ wallet: w.wallet, items: l.items, recharge: r });
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener("billing-changed", h);
    return () => window.removeEventListener("billing-changed", h);
  }, []);
  return (
    <>
      <div className="page-heading">
        <h1>积分与账号</h1>
        <Button onClick={() => void load()}>刷新余额</Button>
      </div>
      {error && <Alert type="error" title={error} />}
      <Tabs
        items={[
          {
            key: "wallet",
            label: "积分钱包",
            children: (
              <>
                <Space size="large" wrap>
                  <Card>
                    <Statistic
                      title="可用积分"
                      value={data.wallet?.available ?? 0}
                    />
                  </Card>
                  <Card>
                    <Statistic
                      title="冻结积分"
                      value={data.wallet?.frozen ?? 0}
                    />
                  </Card>
                </Space>
                <Card className="spaced" title="添加微信充值">
                  <Descriptions
                    column={1}
                    items={[
                      {
                        key: "id",
                        label: "你的用户编号",
                        children: (
                          <Typography.Text copyable>{user?.id}</Typography.Text>
                        ),
                      },
                      {
                        key: "wechat",
                        label: "充值微信",
                        children: data.recharge?.wechat ? (
                          <Typography.Text copyable>
                            {data.recharge.wechat}
                          </Typography.Text>
                        ) : (
                          "管理员尚未设置，请联系管理员"
                        ),
                      },
                      {
                        key: "rate",
                        label: "兑换比例",
                        children: `1元＝${data.recharge?.pointsPerYuan || 100}平台积分`,
                      },
                    ]}
                  />
                  {data.recharge?.qrDataUrl && (
                    <img
                      src={data.recharge.qrDataUrl}
                      alt="管理员充值微信二维码"
                      style={{ width: 180, height: 180, objectFit: "contain" }}
                    />
                  )}
                  <p>{data.recharge?.note}</p>
                  <Alert
                    type="info"
                    title="微信付款时备注用户编号，由管理员确认后入账。生成前冻结，成功结算，失败退回。"
                  />
                </Card>
                <Card className="spaced" title="积分流水">
                  <Table<any>
                    rowKey="id"
                    dataSource={data.items || []}
                    pagination={{ pageSize: 12 }}
                    scroll={{ x: 700 }}
                    columns={[
                      { title: "时间", dataIndex: "created_at", render: time },
                      {
                        title: "类型",
                        dataIndex: "action",
                        render: (v) => actions[v] || v,
                      },
                      { title: "可用变动", dataIndex: "available_delta" },
                      { title: "冻结变动", dataIndex: "frozen_delta" },
                      {
                        title: "实际扣费",
                        render: (_, r) =>
                          r.action === "settle" ? r.amount : "—",
                      },
                      { title: "说明", dataIndex: "note" },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: "account",
            label: "账号安全",
            children: (
              <Card title="修改密码">
                <Form
                  layout="vertical"
                  style={{ maxWidth: 460 }}
                  initialValues={{ username: user?.username }}
                  onFinish={async (v) => {
                    setBusy(true);
                    try {
                      const r = await api("auth/password", "PUT", v);
                      setUser(r.user);
                      message.success("密码已更新，其他登录会话已退出");
                    } catch (e) {
                      message.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Form.Item
                    name="username"
                    label="登录账号"
                    rules={[{ required: true }]}
                  >
                    <Input readOnly />
                  </Form.Item>
                  <Form.Item
                    name="currentPassword"
                    label="当前密码"
                    rules={[{ required: true }]}
                  >
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="新密码"
                    rules={[{ required: true, min: 8 }]}
                  >
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={busy}>
                    保存新密码
                  </Button>
                </Form>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
