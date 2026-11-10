import {useEffect, useRef, useState} from 'react';
import {Alert, App, Button, List, Modal, Space, Tag, Typography} from 'antd';
import {api, id, time} from './api';
import {useWorkspace} from './context';

type LocalTask = {
  id:string; shot_id:string; state:string; note:string; phase?:string;
  title?:string; episode?:number; number?:number; project_name?:string; account_label?:string;
  completed?:number|null; total?:number|null; updated_at?:string; seen_at?:string;
  interruption?:{phase:string; reason:string; recovery:string}|null;
};
type LocalQueue = {
  active:LocalTask[]; waiting:LocalTask[]; recent:LocalTask[];
  worker:{online:boolean; seen_at:string|null};
  quota?:{available:number; total:number}|null;
  account_reports?:{id:string; label:string; labels:string[]; seen_at:string}[];
};
const labels:Record<string,string> = {
  queued:'等待本地电脑领取', claimed:'正在准备豆包账号', prepared:'节点已准备，等待提交',
  submitting:'正在提交', running:'生成中，账号已锁定', awaiting_video:'等待视频回传，账号已锁定',
  blocked:'需要检查，账号锁已保留', succeeded:'视频已回传',
  failed:'豆包生成失败，可重新提交',
  cancelling:'正在终止本机操作', cancelled:'已终止',
};
const phases:Record<string,string> = {
  claimed:'已领取', switching_account:'正在检查或切换账号', opening_canvas:'正在打开画布',
  fetching_references:'正在获取参考图', writing_prompt:'正在填写提示词',
  uploading_references:'正在上传参考图', setting_parameters:'正在设置模型、画幅与时长',
  prepared:'节点已准备，等待提交', checking_submission:'正在核对提交条件', submitting:'正在向豆包提交',
  generating:'豆包正在生成', downloading:'已生成，正在下载成片', uploading:'正在回传成片',
  cancelling:'正在终止本机操作', retrying:'等待自动重试', needs_attention:'已暂停，等待处理',
  resume_requested:'已请求继续原任务',
};
const terminal=['succeeded','cancelled','failed'];
function status(task:LocalTask) {
  if(!task.phase || terminal.includes(task.state) || task.state==='cancelling') return labels[task.state]||task.state;
  const phase=phases[task.phase]||labels[task.state]||task.state;
  if(task.completed==null || !task.total) return phase;
  return task.phase==='generating' ? `${phase} ${task.completed}%` : `${phase} ${task.completed}/${task.total} 张`;
}
function QueueList({title,tasks,waiting=false,onResume,resuming}:{title:string;tasks:LocalTask[];waiting?:boolean;onResume?:(task:LocalTask)=>void;resuming?:string}) {
  return <section>
    <Typography.Title level={5}>{title}（{tasks.length}）</Typography.Title>
    <List size="small" dataSource={tasks} rowKey="id" locale={{emptyText:'暂无任务'}}
      renderItem={(task,index)=><List.Item>
        <List.Item.Meta title={<Space wrap>
          {waiting && <Tag>第 {index+1} 位</Tag>}
          <span>{task.episode&&task.number?`第 ${task.episode} 集 · 分镜 ${task.number}`:'分镜'}{task.title?` · ${task.title}`:''}</span>
        </Space>} description={<div>
          <div>{[task.project_name,task.account_label,time(task.seen_at||task.updated_at)].filter(Boolean).join(' · ')}</div>
          {task.interruption ? <div style={{overflowWrap:'anywhere'}}>
            <Typography.Text type="danger">{phases[task.interruption.phase]||task.interruption.phase}。{task.interruption.reason}</Typography.Text>
            <div>{task.interruption.recovery}</div>
          </div> : (task.phase==='needs_attention' || task.phase==='retrying') ?
            <div>执行器未上报具体错误。请查看绑定 Mac 的 worker.log，确认豆包登录和画布状态，再恢复执行器。</div> :
            task.note && <div>{task.note}</div>}
          {onResume && Date.now()-Date.parse(task.seen_at||task.updated_at||'')>60000 &&
            <div>领取此任务的 Mac 已超过 1 分钟未连接。请恢复该 Mac 的豆包执行器和 SSH 隧道。</div>}
        </div>}/>
        {onResume && task.phase==='needs_attention' && task.interruption &&
          ['claimed','prepared','submitting','running','awaiting_video'].includes(task.state) &&
          <Button size="small" loading={resuming===task.id} disabled={!!resuming} onClick={()=>onResume(task)}>继续原任务</Button>}
        <Tag color={task.state==='succeeded'?'success':task.state==='failed'||task.phase==='needs_attention'?'error':
          terminal.includes(task.state)||waiting?'default':'processing'}>{status(task)}</Tag>
      </List.Item>}/>
  </section>;
}
export function DoubaoLocal({shotId, saved, onComplete}:{shotId:string; saved:boolean; onComplete:()=>Promise<void>}) {
  const {user} = useWorkspace();
  const {message} = App.useApp();
  const [task,setTask] = useState<LocalTask>();
  const [queue,setQueue] = useState<LocalQueue>();
  const [queueOpen,setQueueOpen] = useState(false);
  const [queueError,setQueueError] = useState(false);
  const [busy,setBusy] = useState(false);
  const [resuming,setResuming] = useState('');
  const requestKey = useRef(id());
  const completed = useRef('');
  const admin = !user || user.role === 'admin';
  useEffect(()=>{
    if (!admin) return;
    let stopped=false;
    const poll=async()=>{
      try {
        const overview=await api<LocalQueue>('doubao-local/queue');
        if (stopped) return;
        setQueue(overview);
        setQueueError(false);
        const current=[...overview.active,...overview.waiting,...overview.recent].find(t=>t.shot_id===shotId);
        setTask(current);
        if(current?.state==='succeeded' && completed.current!==current.id) {
          completed.current=current.id;
          await onComplete();
        }
      } catch { if(!stopped) setQueueError(true); }
    };
    void poll();
    const timer=setInterval(()=>void poll(),5000);
    return ()=>{stopped=true;clearInterval(timer);};
  },[admin,shotId,onComplete]);
  if(!admin) return null;
  const active=task && !terminal.includes(task.state);
  const quota=queue?.quota;
  const resume=async (paused:LocalTask)=>{
    setResuming(paused.id);
    try {
      await api(`doubao-local/tasks/${paused.id}/resume`,'POST',{});
      setQueue(previous=>previous && {...previous,active:previous.active.map(item=>
        item.id===paused.id?{...item,phase:'resume_requested'}:item)});
      message.success('已通知绑定的 Mac 继续原任务');
    } catch(error) {message.error((error as Error).message);}
    finally {setResuming('');}
  };
  return <Space wrap>
    <Button size="small" disabled={!saved || !!active} loading={busy} onClick={async()=>{
      setBusy(true);
      try {
        const created=await api<LocalTask>('doubao-local/tasks','POST',{shotId,requestKey:requestKey.current});
        setTask(created);requestKey.current=id();
        message.success('已加入本地豆包队列');
      } catch(error) {message.error((error as Error).message);}
      finally {setBusy(false);}
    }}>本地豆包生成</Button>
    <Button size="small" onClick={()=>setQueueOpen(true)}>豆包队列{queue? `（${queue.active.length+queue.waiting.length}）`:''}</Button>
    {quota && !queueError && <Tag color={quota.available?'blue':'default'}>豆包今日剩余 {quota.available} 次</Tag>}
    {task && ['queued','claimed','prepared'].includes(task.state) && <Button size="small" danger loading={busy} onClick={async()=>{
      setBusy(true);
      try {
        const result=await api<LocalTask>(`doubao-local/tasks/${task.id}/cancel`,'POST',{});
        setTask(result);message.success(result.state==='cancelled'?'任务已终止':'已请求终止本机操作');
      } catch(error) {message.error((error as Error).message);}
      finally {setBusy(false);}
    }}>终止操作</Button>}
    {task && <Typography.Text type="secondary" title={task.note}>{status(task)}</Typography.Text>}
    <Modal title="本地豆包队列" open={queueOpen} onCancel={()=>setQueueOpen(false)} footer={null} width={720}>
      {queueError && <Alert type="warning" showIcon message="队列刷新失败，当前显示上一次同步的数据。"/>}
      {queue ? <Space direction="vertical" size="middle" style={{width:'100%'}}>
        {quota && <Typography.Text>
          今日可新提交 <strong>{quota.available}</strong> 次 / 总额度 {quota.total} 次
          <Typography.Text type="secondary">（已扣除排队预留）</Typography.Text>
        </Typography.Text>}
        <Alert showIcon type={queue.worker.online?'success':'warning'}
          message={queue.worker.online?'本地执行器在线':'本地执行器暂时失联'}
          description={queue.worker.seen_at?`最后连接：${time(queue.worker.seen_at)}`:'尚未收到执行器的连接记录。'}/>
        {!!queue.account_reports?.length && <details>
          <summary>执行器上报的账号（{queue.account_reports.length} 台设备）</summary>
          {queue.account_reports.map(report=><section key={report.id}>
            <Typography.Text strong>{report.label}</Typography.Text>
            <Typography.Text type="secondary"> · {time(report.seen_at)}</Typography.Text>
            <div>{report.labels.map(label=><Tag key={label}>{label}</Tag>)}</div>
          </section>)}
        </details>}
        <QueueList title="正在执行" tasks={queue.active} onResume={resume} resuming={resuming}/>
        <QueueList title="等待中" tasks={queue.waiting} waiting/>
        <QueueList title="最近完成与终止" tasks={queue.recent.slice(0,20)}/>
      </Space> : <Typography.Text type="secondary">{queueError?'等待连接恢复':'正在读取队列…'}</Typography.Text>}
    </Modal>
  </Space>;
}
