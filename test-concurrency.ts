/**
 * 并发测试脚本 - 验证多请求同时消耗的数据一致性
 * 测试场景：同时发起多个消耗请求，验证数据一致性
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

async function testConcurrency() {
  console.log('=== 并发测试开始 ===\n');
  
  const cardHash = 'concurrency-test-' + Date.now();
  const deviceFp = 'fp-concurrency-' + Date.now();
  
  // 1. 激活卡密（100次）
  console.log('1. 激活卡密（100次）...');
  const activateResult = await apiCall('/api/activate', {
    card_hash: cardHash,
    device_fingerprint: deviceFp,
    total: 100,
    tier: 100
  });
  console.log('   状态码:', activateResult.status);
  console.log('   响应:', JSON.stringify(activateResult.data, null, 2));
  
  // 2. 检查初始剩余次数
  const initialRemaining = await apiCall('/api/get-remaining', {
    card_hash: cardHash
  });
  console.log('\n2. 初始剩余:', JSON.stringify(initialRemaining.data, null, 2));
  
  // 3. 同时发起10个消耗请求（每个消耗1次）
  console.log('\n3. 同时发起10个消耗请求...');
  const consumePromises = Array(10).fill().map((_, i) => 
    apiCall('/api/consume', {
      card_hash: cardHash,
      device_fingerprint: deviceFp,
      count: 1
    }).then(r => ({ index: i, status: r.status, data: r.data }))
  );
  
  const consumeResults = await Promise.allSettled(consumePromises);
  
  let successCount = 0;
  let failCount = 0;
  consumeResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const resp = r.value;
      const isSuccess = resp.data && resp.data.success === true && 
                        resp.data.data && resp.data.data[0] && resp.data.data[0].success === true;
      if (isSuccess) {
        successCount++;
        console.log(`   [${i}] ✅ 成功`);
      } else {
        failCount++;
        console.log(`   [${i}] ❌ 失败:`, JSON.stringify(resp.data));
      }
    } else {
      failCount++;
      console.log(`   [${i}] ❌ 异常:`, r.reason);
    }
  });
  
  console.log(`\n   总计 - 成功: ${successCount}, 失败: ${failCount}`);
  
  // 4. 检查最终剩余次数
  const finalRemaining = await apiCall('/api/get-remaining', {
    card_hash: cardHash
  });
  console.log('\n4. 最终剩余次数:', JSON.stringify(finalRemaining.data, null, 2));
  
  // 5. 验证数据一致性
  const expectedRemaining = 100 - successCount;
  const actualRemaining = finalRemaining.data && finalRemaining.data.data && finalRemaining.data.data[0] 
    ? finalRemaining.data.data[0].remaining 
    : -1;
  
  console.log('\n=== 测试结果 ===');
  console.log(`预期剩余: ${expectedRemaining}`);
  console.log(`实际剩余: ${actualRemaining}`);
  console.log(`数据一致性: ${expectedRemaining === actualRemaining ? '✅ 通过' : '❌ 失败'}`);
  
  return {
    success: expectedRemaining === actualRemaining,
    expected: expectedRemaining,
    actual: actualRemaining,
    successCount,
    failCount
  };
}

// 运行测试
testConcurrency().then(result => {
  console.log('\n测试完成:', result);
  Deno.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error('测试异常:', err);
  Deno.exit(1);
});
