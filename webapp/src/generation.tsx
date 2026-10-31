import { money, billingSource } from "./money";
import { LegacyGeneration } from "./legacy-generation";
import { useEffect, useState } from "react";
import { App, Alert, Modal, Select, Space, Table, Typography } from "antd";
import { api } from "./api";
import { useWorkspace } from "./context";
export function Generation({
  kind,
  sourceIds,
  onClose,
  retryJobId,
}: {
  kind: "image" | "video";
  sourceIds: string[];
  onClose: () => void;
  retryJobId?: string;
}) {
  const { project, refreshProject, go, user } = useWorkspace(),
    { message } = App.useApp(),
    [offers, setOffers] = useState<any[]>([]),
    [offer, setOffer] = useState(""),
    [quote, setQuote] = useState<any>(null),
    [billingEnabled, setBillingEnabled] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api("model-offers")
      .then((r) => {
        setBillingEnabled(r.enabled);
        const items = r.items.filter((o: any) => o.kind === kind);
        setOffers(items);
        setOffer(
          items.find((o: any) => o.priceReady)?.id || items[0]?.id || "",
        );
      })
      .catch((e) => setError(e.message));
  }, [kind]);
  if (billingEnabled === false && (!user || user.role === "admin"))
    return (
      <LegacyGeneration kind={kind} sourceIds={sourceIds} onClose={onClose} />
    );
  return (
    <Modal
      open
      title={kind === "image" ? "生成资产图片" : "生成分镜视频"}
      onCancel={onClose}
      confirmLoading={busy}
      okButtonProps={{ disabled: !offer || busy }}
      okText={quote ? `确认预扣 ${money(quote.amount)}` : "获取生成报价"}
      width={660}
      onOk={async () => {
        setBusy(true);
        setError("");
        try {
          if (!quote) {
            setQuote(
              await api(`projects/${project!.id}/generation-quotes`, "POST", {
                offerId: offer,
                sourceIds,
                retryJobId,
                ratio: project!.data.settings.ratio,
              }),
            );
          } else {
            await api(`generation-quotes/${quote.id}/confirm`, "POST", {});
            window.dispatchEvent(new Event("billing-changed"));
            await refreshProject();
            onClose();
            go("jobs", project!.id);
            message.success("费用已预扣，任务已提交");
          }
        } catch (e) {
          setError((e as Error).message);
          if (quote && Date.now() > quote.expiresAt) setQuote(null);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Typography.Paragraph>
        {sourceIds.length} 个任务 · {project!.data.settings.ratio}
        {kind === "video" ? " · 按分镜时长生成 · 720p" : ""}
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text>选择模型</Typography.Text>
        <Select
          aria-label="选择生成模型"
          style={{ width: "100%" }}
          value={offer || undefined}
          onChange={(v) => {
            setOffer(v);
            setQuote(null);
            setError("");
          }}
          options={offers.map((o) => ({
            value: o.id,
            label: o.name,
          }))}
        />
      </Space>
      {quote && (
        <>
          <Alert
            className="spaced"
            type="info"
            title={`预计预扣 ${money(quote.amount)}；可用余额 ${money(quote.wallet.available)}`}
            description={`报价有效至 ${new Date(quote.expiresAt).toLocaleTimeString()}。${quote.basis}。成功后按实际消耗多退少补；余额不足的差额会记为待补款，充值后自动补齐。失败退回预扣费用。`}
          />
          <Table
            rowKey="sourceId"
            size="small"
            pagination={{ pageSize: 5 }}
            expandable={
              kind === "image"
                ? {
                    expandedRowRender: (r: any) => (
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          maxHeight: 260,
                          overflow: "auto",
                        }}
                      >
                        {r.promptPreview}
                      </pre>
                    ),
                  }
                : undefined
            }
            dataSource={quote.items}
            columns={[
              { title: "任务", dataIndex: "title" },
              {
                title: "预计上游积分",
                dataIndex: "officialCredits",
                render: (v) => (v === null ? "按张计价" : v),
              },
              { title: "预计费用", dataIndex: "amount", render: money },
            ]}
          />
        </>
      )}
      <Alert
        className="spaced"
        type="info"
        title={
          kind === "image"
            ? "自动使用项目公共提示词、公共参考图及资产专属参考图。人物设定板、场景无人四视角、道具单图。"
            : "账号由服务器自动分配。查询和重试下载不重复计费；重新生成需要新报价。"
        }
      />
      {error && <Alert className="spaced" type="error" title={error} />}
    </Modal>
  );
}
