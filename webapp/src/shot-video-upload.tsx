import {useState} from 'react';
import {App,Button,Upload} from 'antd';
import {UploadOutlined} from '@ant-design/icons';
import {api} from './api';
export function ShotVideoUpload({shotId,onUploaded}:{shotId:string;onUploaded:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),{message}=App.useApp();
 return <Upload accept=".mp4,video/mp4" showUploadList={false} disabled={busy} beforeUpload={async file=>{
  if(file.size>500*1024*1024){message.error('视频不能超过 500MB');return Upload.LIST_IGNORE;}
  setBusy(true);
  try{const form=new FormData();form.append('file',file);await api(`shots/${shotId}/video`,'POST',form);await onUploaded();message.success('视频已上传，可直接预览和导出');}
  catch(e){message.error((e as Error).message);}finally{setBusy(false);}
  return Upload.LIST_IGNORE;
 }}><Button size="small" icon={<UploadOutlined/>} loading={busy}>{busy?'正在上传':'上传视频'}</Button></Upload>;
}
