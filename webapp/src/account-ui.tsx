import { money, billingSource } from "./money";
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

const actions: any = {
  topup: "微信充值",
  adjust: "后台调整",
  freeze: "生成预扣",
  settle: "成功结算",
  refund: "失败退款",
  supplement: "实际费用补扣",
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
        <h1>余额与账号</h1>
        <Button onClick={() => void load()}>刷新余额</Button>
      </div>
      {error && <Alert type="error" title={error} />}
      <Tabs
        items={[
          {
            key: "wallet",
            label: "人民币钱包",
            children: (
              <>
                <Space size="large" wrap>
                  <Card>
                    <Statistic
                      title="可用余额（元）"
                      precision={2}
                      prefix="¥"
                      value={(data.wallet?.available ?? 0) / 100}
                    />
                  </Card>
                  <Card>
                    <Statistic
                      title="预扣待结算（元）"
                      precision={2}
                      prefix="¥"
                      value={(data.wallet?.frozen ?? 0) / 100}
                    />
                  </Card>
                </Space>
                {(data.wallet?.due ?? 0) > 0 && (
                  <Alert
                    className="spaced"
                    type="warning"
                    title={`待补费用 ${money(data.wallet.due)}`}
                    description="充值后自动补齐。补齐前暂停新的付费生成，已有任务继续查询和下载。"
                  />
                )}
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
                        label: "入账方式",
                        children: "人民币余额，按实收金额入账",
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
                    title="微信付款时备注用户编号，由管理员确认后入账。生成前预扣，按实际消耗多退少补，失败退款。"
                  />
                </Card>
                <Card className="spaced" title="余额账单">
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
                      {
                        title: "余额变动",
                        dataIndex: "available_delta",
                        render: money,
                      },
                      {
                        title: "预扣变动",
                        dataIndex: "frozen_delta",
                        render: money,
                      },
                      {
                        title: "实际扣费",
                        render: (_, r) =>
                          ["settle", "supplement"].includes(r.action)
                            ? money(r.amount)
                            : "—",
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
