/**
 * 完整 API 端点测试脚本
 * 测试所有代理服务器端点：激活、消耗、查询、邀请码
 */

const BASE_URL = 'https://wakeproxy.cypewake.deno.net';
const AUTH = 'Bearer xuetong-2026-proxy-secret-key';

async function apiCall(endpoint, body) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': AUTH
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { status: response.status, data };
}

// 测试结果收集
const results = { passed: 0, failed: 0, tests: [] };

function test(name, condition, detail = '') {
  const status = condition ? '✅ PASS' : '❌ FAIL';
  results.tests.push({ name, status, detail });
  if (condition) results.passed++;
  else results.failed++;
  console.log(`  ${status} - ${name}${detail ? ': ' + detail : ''}`);
}

async function runTests() {
  console.log('=== 学习通代理 API 完整测试 ===\n');
  
  // ===== 1. 健康检查 =====
  console.log('1. 健康检查端点');
  const healthResp = await fetch(`${BASE_URL}/health`);
  const healthData = await healthResp.json();
  test('GET /health 返回 200', healthResp.status === 200);
  test('返回 success: true', healthData.success === true);
  test('包含服务名称', healthData.service === 'wakeproxy');
  test('包含版本号', healthData.version === '1.2.0');
  test('包含时间戳', !!healthData.time);
  
  // ===== 2. 未授权访问 =====
  console.log('\n2. 未授权访问测试');
  const noAuthResp = await fetch(`${BASE_URL}/api/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_hash: 'test', device_fingerprint: 'test' })
  });
  const noAuthData = await noAuthResp.json();
  test('无 Authorization 返回 401', noAuthResp.status === 401);
  test('返回未授权错误', noAuthData.error === '未授权');
  
  const wrongAuthResp = await fetch(`${BASE_URL}/api/activate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer wrong-key'
    },
    body: JSON.stringify({ card_hash: 'test', device_fingerprint: 'test' })
  });
  const wrongAuthData = await wrongAuthResp.json();
  test('错误密钥返回 401', wrongAuthResp.status === 401);
  
  // ===== 3. 缺少参数 =====
  console.log('\n3. 参数验证测试');
  const missingParamResp = await apiCall('/api/activate', { card_hash: 'test' });
  test('缺少 device_fingerprint 返回 400', missingParamResp.status === 400);
  test('返回参数错误', missingParamResp.data.error && missingParamResp.data.error.includes('device_fingerprint'));
  
  // ===== 4. 卡密激活 =====
  console.log('\n4. 卡密激活测试');
  const cardHash = 'test-activate-' + Date.now();
  const deviceFp = 'fp-test-' + Date.now();
  
  const activateResp = await apiCall('/api/activate', {
    card_hash: cardHash,
    device_fingerprint: deviceFp,
    total: 50,
    tier: 50
  });
  test('激活返回 200', activateResp.status === 200);
  test('激活成功', activateResp.data.success === true);
  test('返回剩余次数 50', activateResp.data.data && activateResp.data.data[0].remaining === 50);
  
  // 重复激活同一卡密
  const duplicateActivate = await apiCall('/api/activate', {
    card_hash: cardHash,
    device_fingerprint: deviceFp + '-2',
    total: 50,
    tier: 50
  });
  test('重复激活返回失败', duplicateActivate.data.data && duplicateActivate.data.data[0].success === false);
  
  // ===== 5. 查询剩余次数 =====
  console.log('\n5. 查询剩余次数');
  const getRemainingResp = await apiCall('/api/get-remaining', { card_hash: cardHash });
  test('查询返回 200', getRemainingResp.status === 200);
  test('返回剩余次数', getRemainingResp.data.data && getRemainingResp.data.data[0].remaining === 50);
  test('返回总次数', getRemainingResp.data.data && getRemainingResp.data.data[0].total === 50);
  test('返回等级', getRemainingResp.data.data && getRemainingResp.data.data[0].tier === 50);
  
  // ===== 6. 消耗次数 =====
  console.log('\n6. 消耗次数测试');
  const consumeResp = await apiCall('/api/consume', {
    card_hash: cardHash,
    device_fingerprint: deviceFp,
    count: 5
  });
  test('消耗返回 200', consumeResp.status === 200);
  test('消耗成功', consumeResp.data.data && consumeResp.data.data[0].success === true);
  
  const afterConsume = await apiCall('/api/get-remaining', { card_hash: cardHash });
  test('消耗后剩余 45', afterConsume.data.data && afterConsume.data.data[0].remaining === 45);
  
  // 负数 count 测试（应该被修正为 1）
  const negativeConsume = await apiCall('/api/consume', {
    card_hash: cardHash,
    device_fingerprint: deviceFp,
    count: -10
  });
  test('负数 count 被修正为 1', negativeConsume.status === 200);
  
  const afterNegative = await apiCall('/api/get-remaining', { card_hash: cardHash });
  test('负数消耗后剩余 44', afterNegative.data.data && afterNegative.data.data[0].remaining === 44);
  
  // ===== 7. 邀请码注册和获取 =====
  console.log('\n7. 邀请码功能测试');
  const inviteDeviceFp = 'fp-invite-' + Date.now();
  
  const registerResp = await apiCall('/api/register-invite', {
    invite_code: 'TESTCODE',
    device_fingerprint: inviteDeviceFp
  });
  test('注册邀请码返回 200', registerResp.status === 200);
  test('注册成功', registerResp.data.success === true);
  
  const getInviteResp = await apiCall('/api/get-invite-code', {
    device_fingerprint: inviteDeviceFp
  });
  test('获取邀请码返回 200', getInviteResp.status === 200);
  test('返回邀请码', getInviteResp.data.data && getInviteResp.data.data.length > 0);
  
  // ===== 8. 邀请码兑换 =====
  console.log('\n8. 邀请码兑换测试');
  const redeemDeviceFp = 'fp-redeem-' + Date.now();
  
  // 先注册一个邀请码
  await apiCall('/api/register-invite', {
    invite_code: 'REDEEM123',
    device_fingerprint: 'fp-redeem-owner'
  });
  
  const redeemResp = await apiCall('/api/redeem-invite', {
    invite_code: 'REDEEM123',
    device_fingerprint: redeemDeviceFp,
    bonus: 10
  });
  test('兑换邀请码返回 200', redeemResp.status === 200);
  test('兑换成功', redeemResp.data.success === true);
  
  // 无效邀请码格式
  const invalidInvite = await apiCall('/api/redeem-invite', {
    invite_code: 'ab',  // 太短
    device_fingerprint: redeemDeviceFp
  });
  test('短邀请码被拒绝', invalidInvite.data.data && invalidInvite.data.data[0].success === false);
  
  // ===== 9. 未知端点 =====
  console.log('\n9. 未知端点测试');
  const unknownResp = await apiCall('/api/unknown', { test: 'test' });
  test('未知端点返回 404', unknownResp.status === 404);
  test('返回未知端点错误', unknownResp.data.error === '未知的 API 端点');
  
  // ===== 10. GET 请求被拒绝 =====
  console.log('\n10. HTTP 方法验证');
  const getResp = await fetch(`${BASE_URL}/api/activate`);
  test('GET 请求返回 405', getResp.status === 405);
  
  // ===== 输出总结 =====
  console.log('\n=== 测试总结 ===');
  console.log(`总计: ${results.passed + results.failed} 个测试`);
  console.log(`通过: ${results.passed} ✅`);
  console.log(`失败: ${results.failed} ❌`);
  console.log(`通过率: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  
  if (results.failed > 0) {
    console.log('\n失败的测试:');
    results.tests.filter(t => t.status === '❌ FAIL').forEach(t => {
      console.log(`  - ${t.name}${t.detail ? ': ' + t.detail : ''}`);
    });
  }
  
  return results;
}

runTests().then(r => {
  Deno.exit(r.failed === 0 ? 0 : 1);
}).catch(err => {
  console.error('测试异常:', err);
  Deno.exit(1);
});
