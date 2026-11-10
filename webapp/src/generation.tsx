import { money } from "./money";
import { LegacyGeneration } from "./legacy-generation";
import { useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore JavaScript module shared with the flow tests.
import { generationFlow } from "./generation-flow.mjs";
import { App, Alert, Checkbox, Modal, Select, Space, Table, Typography } from "antd";
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
    [appendDisplayRules, setAppendDisplayRules] = useState(true),
    [quote, setQuote] = useState<any>(null),
    [billingEnabled, setBillingEnabled] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [estimating, setEstimating] = useState(false),
    submitting = useRef(false),
    [error, setError] = useState("");
  const projectId = project!.id,
    ratio = project!.data.settings.ratio,
    sourcesKey = JSON.stringify(sourceIds),
    flow = useMemo(() => generationFlow({
      quote: () => api(`projects/${projectId}/generation-quotes`, "POST", {
        offerId: offer, sourceIds: JSON.parse(sourcesKey), retryJobId, ratio, appendDisplayRules,
      }),
      confirm: (id: string) => api(`generation-quotes/${id}/confirm`, "POST", {}),
    }), [projectId, ratio, sourcesKey, offer, retryJobId, appendDisplayRules]);
  useEffect(() => {
    if (!offer || (billingEnabled === false && user?.role === "admin")) return;
    let active = true;
    setQuote(null);
    setError("");
    setEstimating(true);
    flow.getQuote().then((value: any) => {
      if (active) setQuote(value);
    }).catch((e: Error) => {
      if (active) setError(e.message);
    }).finally(() => { if (active) setEstimating(false); });
    return () => { active = false; };
  }, [flow, offer, billingEnabled, user?.role]);
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
      onCancel={() => { if (!submitting.current) onClose(); }}
      cancelButtonProps={{ disabled: busy }}
      closable={!busy}
      maskClosable={!busy}
      confirmLoading={busy}
      okButtonProps={{ disabled: !offer || busy }}
      okText="开始生成"
      width={660}
      onOk={async () => {
        if (submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        try {
            await flow.submit();
            window.dispatchEvent(new Event("billing-changed"));
            await refreshProject();
            onClose();
            go("jobs", project!.id);
            message.success("费用已预扣，任务已提交");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      <Typography.Paragraph>
        {sourceIds.length} 个任务 · {project!.data.settings.ratio}
        {kind === "video" ? " · 按分镜时长生成" : ""}
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text>选择模型</Typography.Text>
        <Select
          aria-label="选择生成模型"
          style={{ width: "100%" }}
          value={offer || undefined}
          disabled={busy}
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
      {kind === "image" && <Checkbox className="spaced" checked={appendDisplayRules}
        disabled={busy} onChange={(e) => setAppendDisplayRules(e.target.checked)}>
        追加多视角展示要求（角色设定板、场景四视图、道具单图）
      </Checkbox>}
      {estimating && !quote && <Typography.Paragraph className="spaced">正在预估费用…</Typography.Paragraph>}
      {quote && (
        <>
          <Alert
            className="spaced"
            type="info"
            title={`预计预扣 ${money(quote.amount)}；可用余额 ${money(quote.wallet.available)}`}
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
                title: offers.find(o=>o.id===offer)?.provider === "seedance_api" ? "预计渠道成本（元）" : "预计上游积分",
                dataIndex: offers.find(o=>o.id===offer)?.provider === "seedance_api" ? "costCny" : "officialCredits",
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
            ? "自动使用项目公共提示词、公共参考图及资产专属参考图。取消勾选后，不追加展示版式或无人场景等系统要求。"
            : "账号由服务器自动分配。查询和重试下载不重复计费；重新生成需要新报价。"
        }
      />
      {error && <Alert className="spaced" type="error" title={error} />}
    </Modal>
  );
}
