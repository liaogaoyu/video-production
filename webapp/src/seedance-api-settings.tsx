import {useEffect,useState} from 'react';
import {App,Alert,Button,Card,Form,Input,InputNumber,Space,Switch,Typography} from 'antd';
import {api} from './api';
export function SeedanceApiSettings(){
 const [form]=Form.useForm(),[config,setConfig]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState(false),{message}=App.useApp();
 const apply=(c:any)=>{setConfig(c);form.setFieldsValue({...c,apiKey:''});};
 useEffect(()=>{api('admin/seedance-api').then(apply).catch(e=>setError(e.message));},[]);
 return <Card title="Seedance API 渠道" className="spaced">
  <Typography.Paragraph type="secondary">6godboy · 官转渠道二 · 人民币计价。Fast ¥0.20/秒，2.0 满血版 ¥0.43/秒。报价不调用上游接口，参考图在提交生成后上传。</Typography.Paragraph>
  {error&&<Alert type="error" title={error} className="spaced"/>}
  <Form form={form} layout="vertical" disabled={busy||!config} onFinish={async values=>{
   setBusy(true);setError('');setChecked(false);try{apply(await api('admin/seedance-api','PUT',{...values,revision:config.revision}));message.success('API 渠道已保存');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }}>
   <Form.Item name="enabled" label="启用渠道" valuePropName="checked"><Switch/></Form.Item>
   <Form.Item name="apiKey" label="API Key" extra={config?.keyConfigured?'已加密保存；留空保留原 Key。':'请填写官转渠道二分组的 Key。'}><Input.Password autoComplete="off" placeholder={config?.keyConfigured?'已配置':'输入 API Key'}/></Form.Item>
   <Form.Item name="markupPercent" label="成本加价比例（%）" rules={[{required:true}]} extra="按固定秒价预扣，再按 API 返回的实际费用多退少补。0% 不加价。"><InputNumber min={0} max={10000} precision={0} addonAfter="%"/></Form.Item>
   <Space wrap><Button type="primary" htmlType="submit" loading={busy}>保存渠道</Button><Button disabled={busy||!config?.keyConfigured} onClick={async()=>{setBusy(true);setError('');try{await api('admin/seedance-api/check','POST',{});setChecked(true);message.success('API 连接正常');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>测试连接</Button></Space>
  </Form>
  {checked&&<Alert className="spaced" type="success" title="已成功读取渠道能力与余额"/>}
 </Card>;
}
