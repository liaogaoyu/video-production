const { test } = require('node:test');
const assert = require('node:assert/strict');
const { refreshWhitelist } = require('./public-ip-whitelist.cjs');

const config = {
  regionId: 'cn-hangzhou', securityGroupId: 'sg-test', ruleId: 'sgr-test',
  accessKeyId: 'test', accessKeySecret: 'test',
};
const rule = {
  SecurityGroupRuleId: 'sgr-test', PortRange: '18456/18456', IpProtocol: 'TCP',
  Policy: 'Accept', Priority: 1, SourceCidrIp: '175.0.52.247', Direction: 'ingress',
};

test('only updates the configured IPv4 rule when the public IP changes', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    if (url === 'https://api.ipify.org') return new Response('175.0.52.248\n');
    const action = options.headers['x-acs-action'];
    calls.push(action);
    if (action === 'DescribeSecurityGroupAttribute') {
      return Response.json({ Permissions: { Permission: [rule] } });
    }
    const query = new URL(url).searchParams;
    assert.equal(query.get('SecurityGroupRuleId'), config.ruleId);
    assert.equal(query.get('SourceCidrIp'), '175.0.52.248/32');
    assert.equal(query.get('PortRange'), rule.PortRange);
    assert.equal(query.get('Priority'), '1');
    return Response.json({ RequestId: 'test' });
  };
  assert.deepEqual(await refreshWhitelist(config, undefined, fetch), { ip: '175.0.52.248', changed: true });
  assert.deepEqual(await refreshWhitelist(config, '175.0.52.248', fetch), { ip: '175.0.52.248', changed: false });
  assert.deepEqual(calls, ['DescribeSecurityGroupAttribute', 'ModifySecurityGroupRule']);
});

test('does not modify an unrelated port or use a private IP', async () => {
  const wrongPort = async (url, options) => {
    if (url === 'https://api.ipify.org') return new Response('175.0.52.248');
    assert.equal(options.headers['x-acs-action'], 'DescribeSecurityGroupAttribute');
    return Response.json({ Permissions: { Permission: [{ ...rule, PortRange: '22/22' }] } });
  };
  await assert.rejects(refreshWhitelist(config, undefined, wrongPort), /TCP 18456/);
  await assert.rejects(refreshWhitelist(config, undefined, async url => {
    assert.equal(url, 'https://api.ipify.org');
    return new Response('192.168.1.1');
  }), /公网 IPv4/);
});
