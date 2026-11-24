const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { BlockList, isIPv4 } = require('node:net');

const run = promisify(execFile);
const nonPublic = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 3],
]) nonPublic.addSubnet(address, prefix);

const INTERVAL_MS = 5 * 60 * 1000;
const ACTIONS = new Set(['DescribeSecurityGroupAttribute', 'ModifySecurityGroupRule']);
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function ecsRequest(config, action, params = {}, fetchImpl = fetch) {
  if (!ACTIONS.has(action) || !/^cn-[a-z0-9-]+$/.test(config.regionId || '') ||
      !/^sg-[a-z0-9]+$/.test(config.securityGroupId || '') ||
      !config.accessKeyId || !config.accessKeySecret) {
    throw Error('阿里云白名单配置无效');
  }
  const host = `ecs.${config.regionId}.aliyuncs.com`;
  const query = Object.entries({ RegionId: config.regionId, SecurityGroupId: config.securityGroupId, ...params })
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
  const headers = {
    host,
    'x-acs-action': action,
    'x-acs-content-sha256': sha256(''),
    'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    'x-acs-signature-nonce': crypto.randomUUID(),
    'x-acs-version': '2014-05-26',
  };
  const names = Object.keys(headers);
  const canonicalHeaders = names.map(name => `${name}:${headers[name]}\n`).join('');
  const signed = names.join(';');
  const canonical = ['POST', '/', query, canonicalHeaders, signed, headers['x-acs-content-sha256']].join('\n');
  const algorithm = 'ACS3-HMAC-SHA256';
  const signature = crypto.createHmac('sha256', config.accessKeySecret).update(`${algorithm}\n${sha256(canonical)}`).digest('hex');
  headers.authorization = `${algorithm} Credential=${config.accessKeyId},SignedHeaders=${signed},Signature=${signature}`;
  const response = await fetchImpl(`https://${host}/?${query}`, {
    method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!response.ok || result.Code) {
    const code = /^[\w.:-]+$/.test(result.Code || '') ? result.Code : `HTTP ${response.status}`;
    throw Error(`阿里云 ${action} 请求失败（${code}）`);
  }
  return result;
}

async function refreshWhitelist(config, previousIp, fetchImpl = fetch) {
  if (!/^sgr-[a-z0-9]+$/.test(config.ruleId || '')) throw Error('缺少有效的阿里云安全组规则 ID');
  const response = await fetchImpl('https://api.ipify.org', { redirect: 'error', signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw Error(`公网 IPv4 查询失败（HTTP ${response.status}）`);
  const ip = (await response.text()).trim();
  if (!isIPv4(ip) || nonPublic.check(ip)) throw Error('公网 IP 查询未返回可用的公网 IPv4 地址');
  if (ip === previousIp) return { ip, changed: false };
  const source = `${ip}/32`;
  const details = await ecsRequest(config, 'DescribeSecurityGroupAttribute', { Direction: 'ingress' }, fetchImpl);
  const rule = details.Permissions?.Permission?.find(rule => rule.SecurityGroupRuleId === config.ruleId);
  if (!rule || rule.PortRange !== '18456/18456' || rule.IpProtocol?.toLowerCase() !== 'tcp' ||
      rule.Policy?.toLowerCase() !== 'accept' || (rule.Direction && rule.Direction !== 'ingress') ||
      !isIPv4(String(rule.SourceCidrIp || '').replace(/\/32$/, ''))) {
    throw Error('白名单规则必须是 TCP 18456 的单个 IPv4 入站允许规则');
  }
  if (rule.SourceCidrIp === source || rule.SourceCidrIp === ip) return { ip, changed: false };
  await ecsRequest(config, 'ModifySecurityGroupRule', {
    SecurityGroupRuleId: config.ruleId, SourceCidrIp: source,
    IpProtocol: 'tcp', PortRange: '18456/18456', Policy: 'accept', Priority: rule.Priority,
  }, fetchImpl);
  return { ip, changed: true };
}

let timer;
function startWhitelistWatcher(configPath) {
  if (timer) return;
  const file = path.join(path.dirname(configPath), 'public-ip-whitelist.json');
  if (!fs.existsSync(file)) return;
  let previousIp, lastError, busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      if (fs.statSync(file).mode & 0o077) throw Error('公网 IP 白名单凭据文件权限应为 600');
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      const { stdout } = await run('/sbin/route', ['-n', 'get', '-inet', 'default'], { timeout: 3000 });
      if (!/^\s*interface:\s+en\d+\s*$/m.test(stdout)) {
        previousIp = undefined;
        throw Error('当前 IPv4 默认路由不是本机物理网络，等待直连后重试');
      }
      const { ip, changed } = await refreshWhitelist(config, previousIp);
      if (changed) console.log('已更新工作台 TCP 18456 公网 IPv4 白名单');
      else if (!previousIp) console.log('工作台 TCP 18456 公网 IPv4 白名单已核对');
      previousIp = ip;
      lastError = undefined;
    } catch (error) {
      const message = error instanceof SyntaxError ? '公网 IP 白名单配置或服务响应格式无效' : error.message;
      if (message !== lastError) console.error('公网 IP 白名单未更新：', message);
      lastError = message;
    } finally {
      busy = false;
    }
  }
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  void tick();
}

module.exports = { ecsRequest, refreshWhitelist, startWhitelistWatcher };
