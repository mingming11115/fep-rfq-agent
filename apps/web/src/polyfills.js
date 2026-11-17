// 非安全上下文（http + IP/域名）下的兜底。
//
// 浏览器只在安全上下文（HTTPS / localhost / 127.0.0.1 / file://）暴露
// crypto.randomUUID() 与 crypto.subtle，其余情况二者均为 undefined，
// 调用会直接抛 TypeError，而报错信息指向 UUID，很难联想到是协议问题。
//
// 这里补齐项目实际用到的两个能力：
//   crypto.randomUUID()             —— 用 getRandomValues 生成合规的 v4 UUID
//   crypto.subtle.digest('SHA-256') —— 用纯 JS 实现，保证与原生结果逐字节一致
//
// 安全上下文下两者本就存在，此处不做任何改动，行为零变化。

import { sha256 } from './sha256.js';

const HEX = [];
for (let i = 0; i < 256; i += 1) HEX.push((i + 0x100).toString(16).slice(1));

function randomBytes(target, length) {
  const bytes = new Uint8Array(length);
  if (typeof target.getRandomValues === 'function') {
    // getRandomValues 不受安全上下文限制，是这里唯一可用的强随机源
    target.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

function formatUuid(bytes) {
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
    out += HEX[bytes[i]];
  }
  return out;
}

function createRandomUuid(target) {
  return function randomUUID() {
    const bytes = randomBytes(target, 16);
    // RFC 4122：第 6 字节高 4 位固定版本 4，第 8 字节高 2 位固定变体 10
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuid(bytes);
  };
}

function toBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Uint8Array.from(data);
  throw new TypeError('不支持的摘要输入类型');
}

function createDigest() {
  return async function digest(algorithm, data) {
    const name = typeof algorithm === 'string' ? algorithm : algorithm && algorithm.name;
    if (!/^sha-?256$/i.test(String(name || ''))) {
      throw new Error(`polyfill 仅实现 SHA-256，收到 ${name}`);
    }
    return sha256(toBytes(data)).buffer;
  };
}

function defineValue(target, key, value) {
  try {
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
    return true;
  } catch (error) {
    return false;
  }
}

// 只补缺失的能力，已存在的原生实现一律保留，方便测试传入假对象
export function installPolyfills(target = globalThis.crypto) {
  const patched = [];
  if (!target) return patched;

  if (typeof target.randomUUID !== 'function' && defineValue(target, 'randomUUID', createRandomUuid(target))) {
    patched.push('crypto.randomUUID');
  }

  const nativeDigest = target.subtle && typeof target.subtle.digest === 'function';
  if (!nativeDigest) {
    const digest = createDigest();
    // 继承原对象，避免覆盖 subtle 上可能存在的其它方法
    const subtle = target.subtle ? Object.create(target.subtle) : {};
    if (defineValue(subtle, 'digest', digest) && defineValue(target, 'subtle', subtle)) {
      patched.push('crypto.subtle.digest');
    }
  }

  return patched;
}

const patched = installPolyfills();

if (patched.length) {
  console.info(
    `[RFQ] 当前为非安全上下文（${globalThis.location ? globalThis.location.origin : '未知来源'}），` +
    `已为 ${patched.join('、')} 启用 polyfill，相关功能降级可用。` +
    '建议部署 HTTPS 以获得完整能力。'
  );
}
