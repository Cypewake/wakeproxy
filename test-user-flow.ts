/**
 * 核心用户体验测试
 * 模拟真实用户流程：提交卡密 → 激活 → 查询次数 → 挂机答题消耗 → 次数用完
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

async function runUserFlowTest() {
  console.log('=== 核心用户体验测试 ===\n');
  console.log('模拟场景：用户购买卡密 → 激活 → 挂机刷课 → 次数消耗\n');
  
  // ===== 步骤 1: 用户获得新卡密并激活 =====
  console.log('【步骤 1】用户激活卡密...');
  const cardHash = 'user-card-' + Date.now();
  const deviceFp = 'user-device-' + Date.now();
  
  const activateResp = await apiCall('/api/activate', {
    card_hash: cardHash,
    device_fingerprint: deviceFp,
    total: 100,
    tier: 100
  });
  
  console.log('  激活状态:', activateResp.status === 200 ? '✅ 成功' : '❌ 失败');
  console.log('  返回数据:', JSON.stringify(activateResp.data, null, 2));
  
  if (activateResp.status !== 200 || !activateResp.data.data?.[0]?.success) {
    console.log('\n❌ 激活失败，用户无法开始使用！');
    return false;
  }
  
  // ===== 步骤 2: 用户查询剩余次数 =====
  console.log('\n【步骤 2】用户查询剩余次数...');
  const remainingResp = await apiCall('/api/get-remaining', { card_hash: cardHash });
  
  console.log('  查询状态:', remainingResp.status === 200 ? '✅ 成功' : '❌ 失败');
  console.log('  剩余次数:', remainingResp.data.data?.[0]?.remaining);
  console.log('  总次数:', remainingResp.data.data?.[0]?.total);
  console.log('  等级:', remainingResp.data.data?.[0]?.tier);
  
  // ===== 步骤 3: 用户开始挂机刷课（模拟多次答题消耗） =====
  console.log('\n【步骤 3】用户开始挂机刷课（模拟 10 次答题消耗）...');
  
  let currentRemaining = remainingResp.data.data?.[0]?.remaining;
  let consumeCount = 0;
  let failedCount = 0;
  
  for (let i = 1; i <= 10; i++) {
    const consumeResp = await apiCall('/api/consume', {
      card_hash: cardHash,
      device_fingerprint: deviceFp,
      count: 1
    });
    
    if (consumeResp.data.data?.[0]?.success) {
      consumeCount++;
      currentRemaining = consumeResp.data.data[0].remaining;
      console.log(`  第 ${i} 题: ✅ 消耗成功，剩余 ${currentRemaining} 次`);
    } else {
      failedCount++;
      console.log(`  第 ${i} 题: ❌ 消耗失败`);
    }
    
    // 模拟答题间隔延迟
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n  消耗统计: 成功 ${consumeCount}/10, 失败 ${failedCount}/10`);
  
  // ===== 步骤 4: 用户再次查询剩余次数 =====
  console.log('\n【步骤 4】用户查询剩余次数...');
  const finalRemainingResp = await apiCall('/api/get-remaining', { card_hash: cardHash });
  const finalRemaining = finalRemainingResp.data.data?.[0]?.remaining;
  
  console.log('  最终剩余:', finalRemaining);
  console.log('  预期剩余:', 100 - 10);
  console.log('  数据一致性:', finalRemaining === 90 ? '✅ 正确' : '❌ 错误');
  
  // ===== 步骤 5: 模拟次数用完 =====
  console.log('\n【步骤 5】模拟次数用完场景...');
  
  // 快速消耗剩余次数
  for (let i = 0; i < finalRemaining; i++) {
    await apiCall('/api/consume', {
      card_hash: cardHash,
      device_fingerprint: deviceFp,
      count: 1
    });
  }
  
  // 尝试再次消耗（应该失败）
  const overConsumeResp = await apiCall('/api/consume', {
    card_hash: cardHash,
    device_fingerprint: deviceFp,
    count: 1
  });
  
  console.log('  次数用完后消耗:', overConsumeResp.data.data?.[0]?.success === false ? '✅ 正确拒绝' : '❌ 应该拒绝');
  console.log('  错误信息:', overConsumeResp.data.data?.[0]?.message);
  
  // ===== 总结 =====
  console.log('\n=== 用户体验测试总结 ===');
  
  const allPassed = 
    activateResp.status === 200 &&
    activateResp.data.data?.[0]?.success === true &&
    remainingResp.status === 200 &&
    consumeCount === 10 &&
    finalRemaining === 90 &&
    overConsumeResp.data.data?.[0]?.success === false;
  
  console.log('激活功能:', activateResp.status === 200 ? '✅' : '❌');
  console.log('查询功能:', remainingResp.status === 200 ? '✅' : '❌');
  console.log('消耗功能:', consumeCount === 10 ? '✅' : '❌');
  console.log('数据一致性:', finalRemaining === 90 ? '✅' : '❌');
  console.log('次数限制:', overConsumeResp.data.data?.[0]?.success === false ? '✅' : '❌');
  console.log('\n整体结果:', allPassed ? '✅ 用户流程完全正常' : '⚠️ 部分功能异常');
  
  return allPassed;
}

runUserFlowTest().then(success => {
  console.log('\n测试完成:', success ? '通过' : '失败');
}).catch(err => {
  console.error('测试异常:', err);
});
