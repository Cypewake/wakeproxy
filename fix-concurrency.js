const SUPABASE_URL = 'https://pzlmnasbtjcclazdwtir.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bG1uYXNidGpjY2xhemR3dGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTA2MTgsImV4cCI6MjA5NDA4NjYxOH0.P7_RmeoFEMc6f0kZPL55hzuUeGf5VoBIeN5QUhBUi3Y';

const sql = `
CREATE OR REPLACE FUNCTION consume_usage(
  p_card_hash TEXT,
  p_device_fingerprint TEXT,
  p_count INTEGER DEFAULT 1
)
RETURNS TABLE(remaining INTEGER, success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT cu.remaining INTO v_remaining 
  FROM card_usage cu 
  WHERE cu.card_hash = consume_usage.p_card_hash
  FOR UPDATE;
  
  IF v_remaining IS NULL THEN
    remaining := 0;
    success := FALSE;
    message := '卡密未激活';
    RETURN NEXT;
    RETURN;
  END IF;
  
  IF v_remaining < consume_usage.p_count THEN
    remaining := v_remaining;
    success := FALSE;
    message := '次数不足';
    RETURN NEXT;
    RETURN;
  END IF;
  
  UPDATE card_usage 
  SET remaining = remaining - consume_usage.p_count, updated_at = NOW()
  WHERE card_hash = consume_usage.p_card_hash;
  
  SELECT cu.remaining INTO v_remaining
  FROM card_usage cu
  WHERE cu.card_hash = consume_usage.p_card_hash;
  
  INSERT INTO device_usage (device_fingerprint, card_hash, used_count)
  VALUES (consume_usage.p_device_fingerprint, consume_usage.p_card_hash, consume_usage.p_count)
  ON CONFLICT (device_fingerprint)
  DO UPDATE SET 
    used_count = device_usage.used_count + consume_usage.p_count,
    last_active = NOW();
  
  remaining := v_remaining;
  success := TRUE;
  message := '消耗成功';
  RETURN NEXT;
END;
$$;
`;

async function executeSQL() {
  console.log('正在执行 SQL 修复...\n');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ SQL 执行成功！');
      console.log('结果:', JSON.stringify(data, null, 2));
    } else {
      const error = await response.text();
      console.log('❌ SQL 执行失败:');
      console.log('状态码:', response.status);
      console.log('错误信息:', error);
    }
  } catch (err) {
    console.log('❌ 请求失败:', err.message);
  }
}

executeSQL();
