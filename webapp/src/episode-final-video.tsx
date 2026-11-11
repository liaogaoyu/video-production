import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Modal, Space, Typography, Upload } from "antd";
import { PlayCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { api, time, upload } from "./api";

type FinalVideo = {
  id: string;
  url: string;
  filename: string;
  bytes: number;
  uploadedAt: string;
};

type UploadTicket = { direct: false } | {
  direct: true;
  uploadId: string;
  url: string;
  fields: Record<string, string>;
};

function sendToOss(ticket: Extract<UploadTicket, { direct: true }>, file: File, progress: (percent: number) => void) {
  const form = new FormData();
  for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
  form.append("file", file);
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", ticket.url);
    request.timeout = 60 * 60 * 1000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.min(100, Math.floor(event.loaded / event.total * 100)));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`OSS 上传失败（HTTP ${request.status}），请重试`));
    };
    request.onerror = () => reject(new Error("无法连接 OSS，请检查网络后重试"));
    request.ontimeout = () => reject(new Error("OSS 上传超时，请重试"));
    request.send(form);
  });
}

export function EpisodeFinalVideo({
  projectId,
  episodeId,
}: {
  projectId: string;
  episodeId: string;
}) {
  const endpoint = `projects/${projectId}/episodes/${episodeId}/final-video`;
  const { message } = App.useApp();
  const [video, setVideo] = useState<FinalVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingId, setPendingId] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    api<{ video: FinalVideo | null }>(endpoint)
      .then((result) => { if (active) setVideo(result.video); })
      .catch((error: Error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  async function confirmUpload(uploadId: string) {
    const result = await api<{ video: FinalVideo }>(`${endpoint}/complete`, "POST", { uploadId });
    setVideo(result.video);
    setPendingId("");
    setLoadError("");
    message.success("本集成片已保存");
  }

  return (
    <Card title="本集成片" size="small" style={{ marginTop: 20 }}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Typography.Text type="secondary" style={{ overflowWrap: "anywhere" }}>
          {loading ? "正在读取成片…" : loadError || (video
            ? `${video.filename} · ${(video.bytes / 1_000_000).toFixed(1)} MB · ${time(video.uploadedAt)}`
            : "上传本集最终剪辑的视频，支持 MP4、MOV、M4V，最大 500 MB。")}
        </Typography.Text>
        <Space wrap>
          <Upload
            accept=".mp4,.mov,.m4v,video/mp4,video/quicktime,video/x-m4v"
            showUploadList={false}
            disabled={loading || uploading}
            beforeUpload={async (file) => {
              if (file.size > 500_000_000) {
                message.error("视频不能超过 500MB");
                return Upload.LIST_IGNORE;
              }
              setUploading(true);
              setProgress(0);
              setPendingId("");
              try {
                const ticket = await api<UploadTicket>(`${endpoint}/upload`, "POST", { filename: file.name, bytes: file.size });
                if (ticket.direct) {
                  await sendToOss(ticket, file, setProgress);
                  setPendingId(ticket.uploadId);
                  await confirmUpload(ticket.uploadId);
                } else {
                  const result = await upload(endpoint, file, 15 * 60 * 1000);
                  setVideo(result.video);
                  setLoadError("");
                  message.success("本集成片已保存");
                }
              } catch (error) {
                message.error((error as Error).message);
              } finally {
                setUploading(false);
              }
              return Upload.LIST_IGNORE;
            }}
          >
            <Button type={video ? "default" : "primary"} icon={<UploadOutlined />} loading={uploading}>
              {uploading ? (progress === 100 || pendingId ? "正在确认…" : `正在上传 ${progress}%`) : video ? "替换本集成片" : "上传本集成片"}
            </Button>
          </Upload>
          {pendingId && !uploading && <Button onClick={async () => {
            setUploading(true);
            try { await confirmUpload(pendingId); }
            catch (error) { message.error((error as Error).message); }
            finally { setUploading(false); }
          }}>重试确认</Button>}
          {video && <Button icon={<PlayCircleOutlined />} onClick={() => {
            setPreviewError(false);
            setPreview(true);
          }}>预览成片</Button>}
        </Space>
      </Space>
      <Modal title="本集成片预览" open={preview} onCancel={() => setPreview(false)} width={960} footer={null} destroyOnHidden>
        {video && (previewError ? (
          <Space direction="vertical">
            <Alert type="info" title="当前浏览器无法播放此视频，可以下载原文件查看。" />
            <Button href={`${video.url}?download=1`} download={video.filename}>下载原文件</Button>
          </Space>
        ) : (
          <video className="preview-video" src={video.url} controls preload="metadata" onError={() => setPreviewError(true)} />
        ))}
      </Modal>
    </Card>
  );
}
