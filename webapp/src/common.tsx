import { useState } from "react";
import { App, Button, Empty, Image, Upload } from "antd";
import {
  PictureOutlined,
  VideoCameraOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { ButtonProps } from "antd";
import { upload } from "./api";
export function Action({
  run,
  children,
  ...props
}: ButtonProps & { run: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false),
    { message } = App.useApp();
  return (
    <Button
      {...props}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
export function Thumb({
  url,
  video = false,
  large = false,
}: {
  url?: string;
  video?: boolean;
  large?: boolean;
}) {
  return url ? (
    video ? (
      <video
        className={large ? "preview-video" : "thumb-video"}
        src={url}
        controls={large}
        preload="metadata"
      />
    ) : (
      <Image
        preview={large}
        src={url}
        alt="资产图片"
        className={large ? "preview-image" : "thumb-image"}
      />
    )
  ) : (
    <div className={"media-empty " + (large ? "large" : "")}>
      {video ? <VideoCameraOutlined /> : <PictureOutlined />}
    </div>
  );
}
export function FileUpload({
  url,
  onDone,
  label = "上传图片",
  disabled = false,
}: {
  url: string;
  onDone: () => Promise<void>;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    { message } = App.useApp();
  return (
    <Upload
      accept="image/png,image/jpeg,image/webp"
      showUploadList={false}
      disabled={disabled || busy}
      beforeUpload={(file) => {
        setBusy(true);
        upload(url, file)
          .then(onDone)
          .then(() => message.success("上传成功"))
          .catch((e) => message.error(e.message))
          .finally(() => setBusy(false));
        return false;
      }}
    >
      <Button icon={<UploadOutlined />} loading={busy} disabled={disabled}>
        {label}
      </Button>
    </Upload>
  );
}
export const Blank = ({ text = "暂无内容" }: { text?: string }) => (
  <div className="blank">
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />
  </div>
);
