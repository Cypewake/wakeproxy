/**
 * 邀请码功能测试
 * 测试完整邀请码流程：注册 → 获取 → 兑换 → 验证
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

async function testInviteCode() {
  console.log('=== 邀请码功能测试 ===\n');
  
  // ===== 步骤 1: 注册邀请码 =====
  console.log('【步骤 1】注册邀请码...');
  const inviteCode = 'INVITE' + Date.now().toString().slice(-6);
  const ownerDevice = 'device-owner-' + Date.now();
  
  const registerResp = await apiCall('/api/register-invite', {
    invite_code: inviteCode,
    device_fingerprint: ownerDevice
  });
  
  console.log('  状态:', registerResp.status === 200 ? '✅ 成功' : '❌ 失败');
  console.log('  返回:', JSON.stringify(registerResp.data, null, 2));
  
  // ===== 步骤 2: 获取邀请码 =====
  console.log('\n【步骤 2】获取邀请码...');
  const getInviteResp = await apiCall('/api/get-invite-code', {
    device_fingerprint: ownerDevice
  });
  
  console.log('  状态:', getInviteResp.status === 200 ? '✅ 成功' : '❌ 失败');
  console.log('  返回:', JSON.stringify(getInviteResp.data, null, 2));
  
  // ===== 步骤 3: 其他设备兑换邀请码 =====
  console.log('\n【步骤 3】其他设备兑换邀请码...');
  const userDevice = 'device-user-' + Date.now();
  
  const redeemResp = await apiCall('/api/redeem-invite', {
    invite_code: inviteCode,
    device_fingerprint: userDevice,
    bonus: 10
  });
  
  console.log('  状态:', redeemResp.status === 200 ? '✅ 成功' : '❌ 失败');
  console.log('  返回:', JSON.stringify(redeemResp.data, null, 2));
  
  // ===== 步骤 4: 验证邀请码使用次数 =====
  console.log('\n【步骤 4】验证邀请码使用统计...');
  const redeemResp2 = await apiCall('/api/redeem-invite', {
    invite_code: inviteCode,
    device_fingerprint: 'device-user2-' + Date.now(),
    bonus: 10
  });
  
  console.log('  第二次兑换状态:', redeemResp2.status === 200 ? '✅ 成功' : '❌ 失败');
  console.log('  返回:', JSON.stringify(redeemResp2.data, null, 2));
  
  // ===== 步骤 5: 无效邀请码 =====
  console.log('\n【步骤 5】测试无效邀请码...');
  const invalidResp = await apiCall('/api/redeem-invite', {
    invite_code: 'INVALID',
    device_fingerprint: 'device-test-' + Date.now(),
    bonus: 10
  });
  
  console.log('  状态:', invalidResp.status === 200 ? '✅ 成功' : '❌ 失败');
  console.log('  返回:', JSON.stringify(invalidResp.data, null, 2));
  
  // ===== 总结 =====
  console.log('\n=== 邀请码功能测试总结 ===');
  const allPassed = 
    registerResp.status === 200 &&
    getInviteResp.status === 200 &&
    redeemResp.status === 200 &&
    redeemResp2.status === 200 &&
    invalidResp.status === 200;
  
  console.log('注册邀请码:', registerResp.status === 200 ? '✅' : '❌');
  console.log('获取邀请码:', getInviteResp.status === 200 ? '✅' : '❌');
  console.log('兑换邀请码:', redeemResp.status === 200 ? '✅' : '❌');
  console.log('多次兑换:', redeemResp2.status === 200 ? '✅' : '❌');
  console.log('无效邀请码处理:', invalidResp.status === 200 ? '✅' : '❌');
  console.log('\n整体结果:', allPassed ? '✅ 邀请码功能完全正常' : '⚠️ 部分功能异常');
}

testInviteCode().catch(err => {
  console.error('测试异常:', err);
});
