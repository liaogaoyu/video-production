import { useEffect, useState } from "react";
import {
  App,
  Alert,
  Button,
  Form,
  Input,
  Space,
  Typography,
} from "antd";
import { api } from "./api";
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
          创作属于你的故事，项目与余额独立保存。
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
