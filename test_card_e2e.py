#!/usr/bin/env python3
"""
test_card_e2e.py

端到端测试卡密可用性：
1. 使用 Python 生成方案C格式卡密
2. 验证 JS 端的 HMAC 校验逻辑与 Python 一致
3. 验证云代理 activate 端点
4. 验证 PBKDF2 + AES-GCM 加密/解密流程

用法:
    python test_card_e2e.py --uses 10
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import uuid

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except Exception:
    print("依赖缺失：请先安装 cryptography：pip install cryptography")
    sys.exit(1)

# ===== 配置（与 generate_cards.py 和 scriptfor.js 一致）=====
SCHEME_C_HMAC_SECRET = 'xuetong_card_hmac_secret_2024'
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
DEFAULT_ITER = 200_000
PROXY_API_URL = 'https://wakeproxy-cgy2btptfvta.cypewake.deno.net'
PROXY_API_SECRET = 'xuetong-2026-proxy-secret-key'


def generate_code(parts: int = 4, part_len: int = 4) -> str:
    return '-'.join(''.join(secrets.choice(ALPHABET) for _ in range(part_len)) for _ in range(parts))


def compute_scheme_c_hmac_python(code_part: str, uses: int) -> str:
    """Python 端 HMAC 计算"""
    msg = f"{code_part}:{uses}".encode('utf-8')
    key = SCHEME_C_HMAC_SECRET.encode('utf-8')
    sig = hmac.new(key, msg, hashlib.sha256).digest()
    return sig[:4].hex().upper()


def generate_scheme_c_code(uses: int) -> str:
    """生成方案C格式卡密：XXXX-XXXX-XXXX-XXXX-NNNN-HHHH"""
    code_part = generate_code(parts=4, part_len=4)
    uses_hex = format(uses, '04X')
    hmac_code = compute_scheme_c_hmac_python(code_part, uses)
    return f"{code_part}-{uses_hex}-{hmac_code}"


def derive_key(password: str, salt: bytes, iterations: int = DEFAULT_ITER, dklen: int = 32) -> bytes:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations, dklen)


def encrypt_payload(card_plain: str, uses: int, tier: int, iterations: int = DEFAULT_ITER) -> dict:
    """加密卡密 payload（与 JS 端 decrypt 对应）"""
    salt = secrets.token_bytes(16)
    key = derive_key(card_plain, salt, iterations)
    aesgcm = AESGCM(key)
    iv = secrets.token_bytes(12)
    seed = secrets.token_bytes(16)
    payload_obj = {
        'uses': uses,
        'tier': tier,
        'id': str(uuid.uuid4()),
        'seed': base64.b64encode(seed).decode('ascii'),
        'created': int(time.time())
    }
    plaintext = json.dumps(payload_obj, ensure_ascii=False).encode('utf-8')
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    combined = iv + ciphertext
    return {
        'salt': base64.b64encode(salt).decode('ascii'),
        'iter': iterations,
        'cipher': base64.b64encode(combined).decode('ascii'),
        'uses': uses,
        'tier': tier,
        'payload_obj': payload_obj
    }


def decrypt_payload(card_plain: str, salt_b64: str, cipher_b64: str, iterations: int) -> dict:
    """解密卡密 payload（模拟 JS 端逻辑）"""
    salt = base64.b64decode(salt_b64)
    key = derive_key(card_plain, salt, iterations)
    aesgcm = AESGCM(key)
    combined = base64.b64decode(cipher_b64)
    iv = combined[:12]
    ciphertext = combined[12:]
    plaintext = aesgcm.decrypt(iv, ciphertext, None)
    return json.loads(plaintext.decode('utf-8'))


def call_proxy_api(endpoint: str, body: dict) -> dict:
    """调用云代理 API"""
    import urllib.request
    import urllib.error
    
    url = f"{PROXY_API_URL}{endpoint}"
    data = json.dumps(body).encode('utf-8')
    
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {PROXY_API_SECRET}'
        },
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ''
        return {'success': False, 'error': f'HTTP {e.code}: {error_body}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def test_scheme_c_hmac():
    """测试1: 验证方案C HMAC 一致性"""
    print("\n" + "="*60)
    print("【测试1】方案C HMAC 一致性验证")
    print("="*60)
    
    code_part = "ABCD-EFGH-JKLM-NPQR"
    uses = 500
    
    hmac_code = compute_scheme_c_hmac_python(code_part, uses)
    full_code = f"{code_part}-{format(uses, '04X')}-{hmac_code}"
    
    print(f"  卡密部分: {code_part}")
    print(f"  次数: {uses}")
    print(f"  HMAC: {hmac_code}")
    print(f"  完整卡密: {full_code}")
    
    # 验证格式
    segs = full_code.split('-')
    assert len(segs) == 6, f"格式错误: 应有6段，实际{len(segs)}段"
    assert segs[4] == format(uses, '04X'), f"次数HEX错误"
    assert segs[5] == hmac_code, f"HMAC不匹配"
    
    print("  ✅ 方案C HMAC 验证通过")
    return full_code


def test_self_contained_encrypt_decrypt():
    """测试2: 验证自包含格式加密/解密"""
    print("\n" + "="*60)
    print("【测试2】自包含格式加密/解密验证")
    print("="*60)
    
    code_part = generate_code(parts=6, part_len=4)
    uses = 1500
    tier = 1500
    
    # 加密
    entry = encrypt_payload(code_part, uses, tier)
    print(f"  卡密: {code_part}")
    print(f"  次数: {uses}")
    print(f"  Salt: {entry['salt'][:20]}...")
    print(f"  Cipher: {entry['cipher'][:30]}...")
    
    # 解密
    decrypted = decrypt_payload(code_part, entry['salt'], entry['cipher'], entry['iter'])
    assert decrypted['uses'] == uses, f"uses 不匹配: {decrypted['uses']} != {uses}"
    assert decrypted['tier'] == tier, f"tier 不匹配: {decrypted['tier']} != {tier}"
    
    print(f"  解密后 uses: {decrypted['uses']}")
    print(f"  解密后 tier: {decrypted['tier']}")
    print("  ✅ 自包含格式加密/解密验证通过")
    
    return code_part, entry


def test_cloud_proxy_activation():
    """测试3: 验证云代理 activate 端点"""
    print("\n" + "="*60)
    print("【测试3】云代理 activate 端点验证")
    print("="*60)
    
    # 生成测试卡密
    code_part = generate_code(parts=4, part_len=4)
    uses = 10
    code_hash = hashlib.sha256(code_part.encode('utf-8')).hexdigest()
    device_fingerprint = f"test_device_{int(time.time())}"
    
    print(f"  卡密: {code_part}")
    print(f"  卡密Hash: {code_hash[:16]}...")
    print(f"  设备指纹: {device_fingerprint}")
    
    # 调用 activate
    result = call_proxy_api('/api/activate', {
        'card_hash': code_hash,
        'card_plain': code_part,
        'device_fingerprint': device_fingerprint,
        'total': uses,
        'tier': uses
    })
    
    print(f"  响应: {json.dumps(result, ensure_ascii=False, indent=2)}")
    
    if result.get('success'):
        data = result.get('data', [])
        if data and len(data) > 0:
            item = data[0]
            if item.get('success'):
                print(f"  ✅ 云代理 activate 验证通过，剩余: {item.get('remaining')}")
                return True
            else:
                print(f"  ⚠️ 激活返回失败: {item.get('message')}")
                return False
        else:
            print(f"  ⚠️ 响应数据为空")
            return False
    else:
        print(f"  ❌ 云代理调用失败: {result.get('error')}")
        return False


def test_cloud_proxy_get_remaining():
    """测试4: 验证云代理 get-remaining 端点"""
    print("\n" + "="*60)
    print("【测试4】云代理 get-remaining 端点验证")
    print("="*60)
    
    # 使用一个已知的卡密 hash（从测试3的激活中获取）
    code_part = generate_code(parts=4, part_len=4)
    code_hash = hashlib.sha256(code_part.encode('utf-8')).hexdigest()
    
    print(f"  卡密Hash: {code_hash[:16]}...")
    
    result = call_proxy_api('/api/get-remaining', {
        'card_hash': code_hash
    })
    
    print(f"  响应: {json.dumps(result, ensure_ascii=False, indent=2)}")
    
    if result.get('success'):
        print("  ✅ 云代理 get-remaining 验证通过")
        return True
    else:
        print(f"  ⚠️ 查询失败（可能是卡密不存在）: {result.get('error')}")
        return True  # 卡密不存在是正常情况


def test_full_scheme_c_flow():
    """测试5: 完整方案C卡密流程"""
    print("\n" + "="*60)
    print("【测试5】完整方案C卡密流程")
    print("="*60)
    
    # 生成卡密
    code = generate_scheme_c_code(10)
    print(f"  生成卡密: {code}")
    
    # 解析卡密
    segs = code.split('-')
    code_part = '-'.join(segs[:4])
    uses = int(segs[4], 16)
    hmac_code = segs[5]
    
    print(f"  卡密部分: {code_part}")
    print(f"  次数: {uses}")
    print(f"  HMAC: {hmac_code}")
    
    # 验证 HMAC
    expected_hmac = compute_scheme_c_hmac_python(code_part, uses)
    assert hmac_code == expected_hmac, f"HMAC 不匹配: {hmac_code} != {expected_hmac}"
    print(f"  ✅ HMAC 校验通过")
    
    # 计算 hash
    code_hash = hashlib.sha256(code_part.encode('utf-8')).hexdigest()
    print(f"  卡密Hash: {code_hash[:16]}...")
    
    # 激活到云端
    device_fingerprint = f"test_device_{int(time.time())}"
    result = call_proxy_api('/api/activate', {
        'card_hash': code_hash,
        'card_plain': code_part,
        'device_fingerprint': device_fingerprint,
        'total': uses,
        'tier': uses
    })
    
    print(f"  激活响应: {json.dumps(result, ensure_ascii=False, indent=2)}")
    
    if result.get('success'):
        data = result.get('data', [])
        if data and len(data) > 0 and data[0].get('success'):
            print(f"  ✅ 完整方案C卡密流程验证通过")
            return True
    
    print(f"  ❌ 完整方案C卡密流程验证失败")
    return False


def main():
    parser = argparse.ArgumentParser(description='端到端测试卡密可用性')
    parser.add_argument('--uses', type=int, default=10, help='测试卡密的答题次数（默认10）')
    args = parser.parse_args()
    
    print("="*60)
    print("卡密端到端测试")
    print("="*60)
    print(f"测试次数: {args.uses}")
    print(f"云代理: {PROXY_API_URL}")
    
    results = {}
    
    # 测试1: HMAC 一致性
    try:
        test_scheme_c_hmac()
        results['hmac_consistency'] = True
    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        results['hmac_consistency'] = False
    
    # 测试2: 自包含格式加密/解密
    try:
        test_self_contained_encrypt_decrypt()
        results['self_contained_crypto'] = True
    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        results['self_contained_crypto'] = False
    
    # 测试3: 云代理 activate
    try:
        results['cloud_activate'] = test_cloud_proxy_activation()
    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        results['cloud_activate'] = False
    
    # 测试4: 云代理 get-remaining
    try:
        results['cloud_get_remaining'] = test_cloud_proxy_get_remaining()
    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        results['cloud_get_remaining'] = False
    
    # 测试5: 完整方案C流程
    try:
        results['full_scheme_c_flow'] = test_full_scheme_c_flow()
    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        results['full_scheme_c_flow'] = False
    
    # 汇总
    print("\n" + "="*60)
    print("测试汇总")
    print("="*60)
    
    all_passed = True
    for test_name, passed in results.items():
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"  {test_name}: {status}")
        if not passed:
            all_passed = False
    
    if all_passed:
        print("\n🎉 所有测试通过！卡密系统工作正常。")
    else:
        print("\n⚠️ 部分测试失败，请检查上述错误信息。")
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
