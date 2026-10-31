import { money, billingSource } from "./money";
import { useEffect, useRef, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import { api, id, time } from "./api";
export function CommercialAdminPage() {
  const [settings, setSettings] = useState<any>(null),
    [users, setUsers] = useState<any[]>([]),
    [offers, setOffers] = useState<any[]>([]),
    [ledger, setLedger] = useState<any[]>([]),
    [billing, setBilling] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [topup, setTopup] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [refund, setRefund] = useState<any>(null),
    [adjust, setAdjust] = useState<any>(null),
    [testEmail, setTestEmail] = useState(""),
    [form] = Form.useForm(),
    [topupForm] = Form.useForm(),
    [offerForm] = Form.useForm(),
    [adjustForm] = Form.useForm(),
    [refundForm] = Form.useForm(),
    { message } = App.useApp(),
    key = useRef(id());
  const watchedRates = Form.useWatch("rates", form),
    watchedPoints = 1;
  const run = async (work: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      return await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const [s, u, o, l, b] = await Promise.all([
      api("admin/settings"),
      api("admin/users?q=" + encodeURIComponent(search)),
      api("admin/model-offers"),
      api("admin/ledger"),
      api("admin/billing"),
    ]);
    setSettings(s);
    form.setFieldsValue({ ...s, smtp: { ...s.smtp, password: "" } });
    setUsers(u.items);
    setOffers(o.items);
    setLedger(l.items);
    setBilling(b.items);
  };
  useEffect(() => {
    void run(refresh);
  }, []);
  const userTable = (
    <>
      <Space className="form-toolbar">
        <Input.Search
          aria-label="搜索用户邮箱或编号"
          placeholder="邮箱、账号或完整用户编号"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={() =>
            void run(async () =>
              setUsers(
                (await api("admin/users?q=" + encodeURIComponent(search)))
                  .items,
              ),
            )
          }
        />
        <Button onClick={() => void run(refresh)}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        scroll={{ x: 1100 }}
        dataSource={users}
        pagination={{ pageSize: 15 }}
        columns={[
          {
            title: "用户",
            render: (_, u) => (
              <>
                <strong>{u.email || u.username}</strong>
                <br />
                <Typography.Text copyable style={{ fontSize: 11 }}>
                  {u.id}
                </Typography.Text>
              </>
            ),
          },
          {
            title: "身份",
            dataIndex: "role",
            render: (v) => (v === "admin" ? "管理员" : "用户"),
          },
          {
            title: "邮箱验证",
            dataIndex: "email_verified_at",
            render: (v) => (v ? "已验证" : "未验证"),
          },
          { title: "可用余额", dataIndex: "available", render: money },
          { title: "预扣待结算", dataIndex: "frozen", render: money },
          { title: "待补款", dataIndex: "due", render: money },
          { title: "状态", dataIndex: "status" },
          {
            title: "操作",
            render: (_, u) => (
              <Space wrap>
                <Button
                  onClick={() => {
                    key.current = id();
                    topupForm.resetFields();
                    setTopup(u);
                  }}
                >
                  充值
                </Button>
                <Button
                  onClick={() => {
                    key.current = id();
                    adjustForm.resetFields();
                    setAdjust(u);
                  }}
                >
                  调整
                </Button>
                <Popconfirm
                  title={
                    u.status === "active"
                      ? "停用此账号并退出其会话？"
                      : "恢复此账号？"
                  }
                  onConfirm={() =>
                    run(async () => {
                      await api("admin/users/" + u.id, "PATCH", {
                        status: u.status === "active" ? "disabled" : "active",
                      });
                      await refresh();
                    })
                  }
                >
                  <Button
                    disabled={u.role === "admin"}
                    danger={u.status === "active"}
                  >
                    {u.status === "active" ? "停用" : "恢复"}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
  const pricing = (
    <Form
      form={form}
      layout="vertical"
      onFinish={(v) =>
        void run(async () => {
          const s = await api("admin/settings", "PUT", {
            ...v,
            revision: settings.revision,
          });
          setSettings(s);
          form.setFieldsValue({ ...s, smtp: { ...s.smtp, password: "" } });
          message.success("运营配置已保存，仅影响新报价");
        })
      }
    >
      <Card title="开放状态">
        <Space align="start" wrap>
          <Form.Item
            name="enabled"
            label="开放付费生成"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="registrationEnabled"
            label="开放邮箱注册"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Typography.Text>
            人民币余额，所有金额以元显示、以分记账。
          </Typography.Text>
        </Space>
        <Alert
          type="info"
          title="未配置邮件服务时不能开放注册；国内使用渠道预估，国际自动读取官网参考单价。新用户初始余额为0。"
        />
      </Card>
      <Card className="spaced" title="渠道成本与加价">
        <Space align="start" wrap>
          {[
            ["domestic", "国内快速渠道"],
            ["international", "国际慢速渠道"],
            ["image", "资产生图"],
          ].map(([g, label]) => (
            <Card size="small" title={label} key={g}>
              {g === "image" ? (
                <Form.Item
                  name={["rates", g, "costFen"]}
                  label="每张成本（分，10分＝0.1元）"
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} precision={0} />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    name={["rates", g, "purchaseFen"]}
                    label="采购金额（分，26000分＝260元）"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                  <Form.Item
                    name={["rates", g, "purchaseCredits"]}
                    label="购得官方积分"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                </>
              )}
              <Form.Item
                name={["rates", g, "markupPercent"]}
                label="成本加价比例（%）"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={10000} precision={0} />
              </Form.Item>
              {g === "domestic" && (
                <Form.Item
                  name={["rates", g, "estimateCreditsPerSecond"]}
                  label="预扣用：每秒预估官方积分（非最终扣费）"
                >
                  <InputNumber min={0} max={100000} precision={3} />
                </Form.Item>
              )}
              <Typography.Text type="secondary">
                {(() => {
                  const r = watchedRates?.[g];
                  if (!r) return "";
                  const n =
                    ((g === "image"
                      ? r.costFen
                      : r.purchaseFen / r.purchaseCredits) /
                      100) *
                    watchedPoints *
                    (1 + r.markupPercent / 100);
                  return `¥${Number.isFinite(n) ? n.toFixed(5) : "—"} 元 / ${g === "image" ? "张" : "官方积分"}，任务独立向上取整`;
                })()}
              </Typography.Text>
            </Card>
          ))}
        </Space>
      </Card>
      <Card className="spaced" title="微信人工充值">
        <Form.Item name="wechat" label="微信号">
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="rechargeNote" label="充值说明">
          <Input.TextArea rows={3} maxLength={1000} />
        </Form.Item>
        <Form.Item
          name="qrDataUrl"
          label="二维码图片（PNG/JPEG/WebP，最大1MB）"
        >
          <Input.TextArea
            rows={2}
            placeholder="上传后自动保存图片数据"
            readOnly
          />
        </Form.Item>
        <Upload
          accept="image/png,image/jpeg,image/webp"
          showUploadList={false}
          beforeUpload={(f) => {
            if (f.size > 1000000) {
              message.error("图片超过1MB");
              return false;
            }
            const r = new FileReader();
            r.onload = () => form.setFieldValue("qrDataUrl", r.result);
            r.readAsDataURL(f);
            return false;
          }}
        >
          <Button>上传二维码</Button>
        </Upload>{" "}
        <Button onClick={() => form.setFieldValue("qrDataUrl", "")}>
          清空二维码
        </Button>
      </Card>
      <Card className="spaced" title="SMTP 邮件配置">
        <Alert
          type={settings?.smtpConfigured ? "success" : "warning"}
          title={
            settings?.smtpConfigured
              ? "邮件凭据已保存（加密存储）；可发送测试邮件验证"
              : "尚未配置邮件；注册保持关闭"
          }
        />
        <Space align="start" wrap>
          <Form.Item name={["smtp", "host"]} label="SMTP地址">
            <Input placeholder="smtp.example.com" />
          </Form.Item>
          <Form.Item name={["smtp", "port"]} label="端口">
            <Select
              style={{ width: 140 }}
              options={[
                { value: 465, label: "465 TLS" },
                { value: 587, label: "587 STARTTLS" },
              ]}
            />
          </Form.Item>
        </Space>
        <Form.Item name={["smtp", "user"]} label="SMTP用户名">
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name={["smtp", "from"]} label="发信邮箱">
          <Input />
        </Form.Item>
        <Form.Item
          name={["smtp", "password"]}
          label="SMTP授权码（留空保留原值）"
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Space>
          <Input
            placeholder="测试收信邮箱"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button
            disabled={!settings?.smtpConfigured}
            onClick={() =>
              void run(async () => {
                await api("admin/settings/test-email", "POST", {
                  email: testEmail,
                });
                message.success("测试邮件已发送");
              })
            }
          >
            发送测试邮件
          </Button>
        </Space>
      </Card>
      <Button
        className="spaced"
        type="primary"
        htmlType="submit"
        loading={busy}
      >
        保存运营配置
      </Button>
    </Form>
  );
  const offerTable = (
    <>
      <Alert
        className="spaced"
        type="info"
        title="模型只配置展示与上架。人民币价格由渠道兑换成本和加价比例决定；国内每秒预估积分只用于预扣，国际渠道自动读取官网参考单价；最终按官方实际积分多退少补。"
      />
      <Table
        rowKey="id"
        dataSource={offers}
        columns={[
          { title: "公开名称", dataIndex: "name" },
          { title: "渠道", dataIndex: "group_key" },
          {
            title: "上架",
            dataIndex: "enabled",
            render: (v) => (v ? "是" : "否"),
          },
          {
            title: "价格依据",
            render: (_, o) =>
              o.kind === "image" ? "按张" : "官方实际积分 × 渠道费率",
          },
          {
            title: "操作",
            render: (_, o) => (
              <Button
                onClick={() => {
                  setEditing(o);
                  offerForm.setFieldsValue({
                    name: o.name,
                    enabled: !!o.enabled,
                    perSecondCredits: o.pricing.perSecondCredits ?? null,
                    rateCards: o.pricing.rateCards || [],
                  });
                }}
              >
                编辑
              </Button>
            ),
          },
        ]}
      />
    </>
  );
  return (
    <>
      <div className="page-heading">
        <h1>运营管理</h1>
        <Button loading={busy} onClick={() => void run(refresh)}>
          刷新
        </Button>
      </div>
      {error && <Alert className="spaced" type="error" title={error} />}
      <Tabs
        items={[
          { key: "users", label: "用户与充值", children: userTable },
          { key: "pricing", label: "定价与邮件", children: pricing },
          { key: "offers", label: "公开模型与预测", children: offerTable },
          {
            key: "ledger",
            label: "余额流水",
            children: (
              <Table
                rowKey="id"
                dataSource={ledger}
                scroll={{ x: 900 }}
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: "时间", dataIndex: "created_at", render: time },
                  { title: "用户", dataIndex: "username" },
                  { title: "类型", dataIndex: "action" },
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
                    title: "扣费/入账金额",
                    dataIndex: "amount",
                    render: money,
                  },
                  { title: "备注", dataIndex: "note" },
                ]}
              />
            ),
          },
          {
            key: "billing",
            label: "任务对账",
            children: (
              <>
                <Alert
                  className="spaced"
                  type="info"
                  title="生成前预扣，成功交付后按官方实际消耗多退少补。未取得实际消耗时待核账，失败退款；余额不足的补款充值后自动扣回。成本和费率按报价快照保存。"
                />
                <Table
                  rowKey="job_id"
                  scroll={{ x: 1100 }}
                  dataSource={billing}
                  pagination={{ pageSize: 15 }}
                  columns={[
                    {
                      title: "用户 / 任务",
                      render: (_, r) => (
                        <>
                          {r.username}
                          <br />
                          {r.snapshot.title}
                        </>
                      ),
                    },
                    { title: "模型", render: (_, r) => r.snapshot.modelName },
                    { title: "任务状态", dataIndex: "job_status" },
                    { title: "账务状态", dataIndex: "status" },
                    { title: "预扣", dataIndex: "reserved", render: money },
                    { title: "已付", dataIndex: "charged", render: money },
                    {
                      title: "实际费用",
                      dataIndex: "actual_amount",
                      render: money,
                    },
                    { title: "待补", dataIndex: "due", render: money },
                    {
                      title: "上游积分/张数",
                      render: (_, r) =>
                        r.usage?.credits ?? r.usage?.count ?? "待核账",
                    },
                    {
                      title: "计量来源",
                      render: (_, r) => billingSource(r.usage?.source),
                    },
                    {
                      title: "原始成本（元）",
                      render: (_, r) => {
                        const x = r.snapshot,
                          units = r.usage?.credits ?? r.usage?.count;
                        if (units == null) return "待核账";
                        return (
                          x.kind === "image"
                            ? (units * x.rate.costFen) / 100
                            : (units * x.rate.purchaseFen) /
                              100 /
                              x.rate.purchaseCredits
                        ).toFixed(4);
                      },
                    },
                    {
                      title: "操作",
                      render: (_, r) =>
                        r.status === "frozen" ? (
                          <Button
                            danger
                            onClick={() => {
                              setRefund(r);
                              refundForm.resetFields();
                            }}
                          >
                            核对并终止退款
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Modal
        open={!!topup}
        title={`人工充值 · ${topup?.email || topup?.username || ""}`}
        onCancel={() => setTopup(null)}
        onOk={() => topupForm.submit()}
        confirmLoading={busy}
        okText="确认收款并入账"
      >
        <Alert
          type="warning"
          title="请先核对微信收款。每次入账都会保留管理员和充值流水。"
        />
        <Form
          form={topupForm}
          layout="vertical"
          initialValues={{ giftYuan: 0 }}
          onFinish={(v) =>
            void run(async () => {
              await api(
                "admin/users/" + topup.id + "/topups",
                "POST",
                {
                  amountFen: Math.round(v.yuan * 100),
                  giftFen: Math.round((v.giftYuan || 0) * 100),
                  note: v.note,
                },
                key.current,
              );
              setTopup(null);
              await refresh();
              message.success("余额已到账");
            })
          }
        >
          <Form.Item
            name="yuan"
            label="实收金额（元）"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.01} max={1000000} precision={2} />
          </Form.Item>
          <Form.Item name="giftYuan" label="赠送金额（元）">
            <InputNumber min={0} precision={2} />
          </Form.Item>
          <Form.Item
            name="note"
            label="收款凭据或备注"
            rules={[{ required: true }]}
          >
            <Input.TextArea maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!adjust}
        title="余额调整（不修改历史流水）"
        onCancel={() => setAdjust(null)}
        onOk={() => adjustForm.submit()}
        confirmLoading={busy}
      >
        <Form
          form={adjustForm}
          layout="vertical"
          onFinish={(v) =>
            void run(async () => {
              await api(
                "admin/users/" + adjust.id + "/adjustments",
                "POST",
                { deltaFen: Math.round(v.yuan * 100), note: v.note },
                key.current,
              );
              setAdjust(null);
              await refresh();
              message.success("调整已记入流水");
            })
          }
        >
          <Form.Item
            name="yuan"
            label="调整金额（元）：正数增加，负数减少"
            rules={[{ required: true }]}
          >
            <InputNumber precision={2} />
          </Form.Item>
          <Form.Item name="note" label="原因" rules={[{ required: true }]}>
            <Input.TextArea maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!editing}
        width={780}
        title="公开模型与配置预测"
        onCancel={() => setEditing(null)}
        onOk={() => offerForm.submit()}
        confirmLoading={busy}
      >
        <Form
          form={offerForm}
          layout="vertical"
          onFinish={(v) =>
            void run(async () => {
              await api("admin/model-offers/" + editing.id, "PATCH", {
                name: v.name,
                enabled: v.enabled,
                pricing: {
                  ...editing.pricing,
                },
              });
              setEditing(null);
              await refresh();
              message.success("模型配置已保存");
            })
          }
        >
          <Form.Item
            name="name"
            label="用户看到的名称"
            rules={[{ required: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="enabled" label="上架" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!refund}
        title="核对并终止任务计费"
        onCancel={() => setRefund(null)}
        onOk={() => refundForm.submit()}
        confirmLoading={busy}
        okText="确认无法交付并退回预扣费用"
      >
        <Alert
          type="warning"
          title="先核对官网和下载记录。该操作会停止此尝试的继续查询，退回用户预扣费用，上游成本由平台承担。"
        />
        <Form
          form={refundForm}
          layout="vertical"
          onFinish={(v) =>
            void run(async () => {
              await api("admin/billing/" + refund.job_id + "/refund", "POST", {
                confirmedNoDelivery: true,
                note: v.note,
              });
              setRefund(null);
              await refresh();
              message.success("已终止并退回预扣费用");
            })
          }
        >
          <Form.Item
            name="note"
            label="核对结果 / 终止原因"
            rules={[{ required: true }]}
          >
            <Input.TextArea maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
