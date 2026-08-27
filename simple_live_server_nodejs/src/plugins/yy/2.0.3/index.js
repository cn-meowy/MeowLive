// YY 2.0.3 — 取流走 Host.ws 通用桥,平台协议(TARS/握手/服务订阅)全部在 JS 端实现。

const __lp_yy_defaultHeaders = {
  "user-agent": " Platform/iOS17.5.1 APP/yymip8.40.0 Model/iPhone Browerser:Default Scale/3.00 YY(ClientVersion:8.40.0 ClientEdition:yymip) HostName/yy HostVersion/8.40.0 HostId/1 UnionVersion/2.690.0 Build1492 HostExtendInfo/b576b278cba95c5100f84a69b26dc36bf44f080608b937825dcd64ee5911351f74dbda4ac85cfb011f32eb00b7c16ecc6bad4eaa3cd9f69c923177e74f6212682492886a946abdcf921a84c93ff329d4fd9e2bc67f5fe727d9a7b10ee65fbbbf",
  "accept-language": "zh-Hans-CN;q=1",
  "accept-encoding": "gzip, deflate, br, zstd",
  "content-type": "application/json; charset=utf-8",
  Accept: "application/json"
};

const __lp_yy_playbackUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const __lp_yy_playbackHeaders = {
  Referer: "https://www.yy.com/",
  Origin: "https://www.yy.com"
};

const __lp_yy_sidQueryKeys = ["sid", "ssid", "roomId"];

function _yy_throw(code, message, context) {
  if (globalThis.Host && typeof Host.raise === "function") {
    Host.raise(code, message, context || {});
  }
  if (globalThis.Host && typeof Host.makeError === "function") {
    throw Host.makeError(code || "UNKNOWN", message || "", context || {});
  }
  throw new Error(`LP_PLUGIN_ERROR:${JSON.stringify({ code: String(code || "UNKNOWN"), message: String(message || ""), context: context || {} })}`);
}

function _yy_parseCode(value, fallback) {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function _yy_isValidRoomId(value) {
  return /^\d{3,}$/.test(String(value || ""));
}

function _yy_firstURL(text) {
  const m = String(text || "").match(/https?:\/\/[^\s|]+/);
  return m ? String(m[0]) : "";
}

function _yy_buildRoomListURL(id, parentId) {
  if (String(id) === "index") {
    return `https://yyapp-idx.yy.com/mobyy/nav/${encodeURIComponent(String(id))}/${encodeURIComponent(String(parentId || ""))}`;
  }
  return `https://rubiks-idx.yy.com/nav/${encodeURIComponent(String(id))}/${encodeURIComponent(String(parentId || ""))}`;
}

// =============================================================================
// TARS 协议工具:Uint8Array + DataView 实现 YY 二进制协议族(原 YYBinaryProtocol.swift)
// =============================================================================

const __yy_tars = (function () {

  // ---- 字节工具 ----

  function concat() {
    let total = 0;
    for (let i = 0; i < arguments.length; i++) total += arguments[i].length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < arguments.length; i++) {
      out.set(arguments[i], offset);
      offset += arguments[i].length;
    }
    return out;
  }

  function utf8Encode(str) {
    const s = String(str || "");
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      let code = s.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
        // surrogate pair
        const low = s.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + (((code & 0x3ff) << 10) | (low & 0x3ff));
          bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
          i += 1;
          continue;
        }
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return new Uint8Array(bytes);
  }

  function utf8Decode(uint8) {
    let s = "";
    let i = 0;
    while (i < uint8.length) {
      const b = uint8[i++];
      if (b < 0x80) {
        s += String.fromCharCode(b);
      } else if (b < 0xc0) {
        // continuation byte without leading -> stop or skip
        s += String.fromCharCode(b);
      } else if (b < 0xe0 && i < uint8.length) {
        const b2 = uint8[i++] & 0x3f;
        s += String.fromCharCode(((b & 0x1f) << 6) | b2);
      } else if (b < 0xf0 && i + 1 < uint8.length) {
        const b2 = uint8[i++] & 0x3f;
        const b3 = uint8[i++] & 0x3f;
        s += String.fromCharCode(((b & 0x0f) << 12) | (b2 << 6) | b3);
      } else if (i + 2 < uint8.length) {
        const b2 = uint8[i++] & 0x3f;
        const b3 = uint8[i++] & 0x3f;
        const b4 = uint8[i++] & 0x3f;
        let code = ((b & 0x07) << 18) | (b2 << 12) | (b3 << 6) | b4;
        code -= 0x10000;
        s += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      }
    }
    return s;
  }

  function bytesToBase64(uint8) {
    let bin = "";
    const len = uint8.length;
    for (let i = 0; i < len; i++) bin += String.fromCharCode(uint8[i]);
    return globalThis.btoa(bin);
  }

  function base64ToBytes(b64) {
    const bin = globalThis.atob(String(b64 || ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function writeU8(v) { return new Uint8Array([v & 0xff]); }
  function writeU16LE(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]); }
  function writeU32LE(v) {
    return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  }
  function writeU64LE(v) {
    // v 是 Number 或 BigInt; JS Number 精度够 53bit,用于序列号/时间戳够用
    let big = typeof v === "bigint" ? v : BigInt(Math.floor(Number(v) || 0));
    if (big < 0n) big = 0n;
    const out = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      out[i] = Number(big & 0xffn);
      big >>= 8n;
    }
    return out;
  }

  function writeBytes16(payload) {
    const data = payload || new Uint8Array(0);
    return concat(writeU16LE(data.length), data);
  }
  function writeBytes32(payload) {
    const data = payload || new Uint8Array(0);
    return concat(writeU32LE(data.length), data);
  }
  function writeASCIIString16(str) {
    const bytes = utf8Encode(str);
    return concat(writeU16LE(bytes.length), bytes);
  }

  function Reader(data) {
    this.data = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    this.offset = 0;
  }
  Reader.prototype.remaining = function () { return this.data.length - this.offset; };
  Reader.prototype.isAtEnd = function () { return this.offset >= this.data.length; };
  Reader.prototype.readU8 = function () {
    if (this.offset + 1 > this.data.length) throw new Error("readU8 OOB");
    return this.data[this.offset++];
  };
  Reader.prototype.readU16LE = function () {
    if (this.offset + 2 > this.data.length) throw new Error("readU16LE OOB");
    const v = this.data[this.offset] | (this.data[this.offset + 1] << 8);
    this.offset += 2;
    return v >>> 0;
  };
  Reader.prototype.readU32LE = function () {
    if (this.offset + 4 > this.data.length) throw new Error("readU32LE OOB");
    const v = (this.data[this.offset]
      | (this.data[this.offset + 1] << 8)
      | (this.data[this.offset + 2] << 16)
      | (this.data[this.offset + 3] << 24)) >>> 0;
    this.offset += 4;
    return v;
  };
  Reader.prototype.readU64LE = function () {
    if (this.offset + 8 > this.data.length) throw new Error("readU64LE OOB");
    let big = 0n;
    for (let i = 7; i >= 0; i--) big = (big << 8n) | BigInt(this.data[this.offset + i]);
    this.offset += 8;
    // 返回 Number(精度内)还是 BigInt? 这里用 BigInt 保留精度,需要的话 Number()
    return big;
  };
  Reader.prototype.readBytes = function (count) {
    if (count < 0 || this.offset + count > this.data.length) throw new Error("readBytes OOB count=" + count);
    const out = this.data.subarray(this.offset, this.offset + count);
    this.offset += count;
    return out;
  };
  Reader.prototype.readBytes16 = function () { return this.readBytes(this.readU16LE()); };
  Reader.prototype.readBytes32 = function () { return this.readBytes(this.readU32LE()); };
  Reader.prototype.readASCIIString16 = function () {
    const bytes = this.readBytes(this.readU16LE());
    return utf8Decode(bytes);
  };

  // ---- 外层帧 [len(u32)][uri(u32)][magic=0x00C8(u16)][payload] ----

  function buildFrame(uri, payload) {
    const data = payload || new Uint8Array(0);
    const totalLen = 10 + data.length;
    return concat(writeU32LE(totalLen), writeU32LE(uri), writeU16LE(0x00C8), data);
  }

  function parseFrame(data) {
    if (!data || data.length < 10) return null;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const totalLen = dv.getUint32(0, true);
    const uri = dv.getUint32(4, true);
    const magic = dv.getUint16(8, true);
    if (magic !== 0x00C8 || totalLen < 10 || data.length < totalLen) return null;
    return { uri: uri, payload: data.subarray(10, totalLen) };
  }

  // ---- zlib inflate (依赖 fflate.unzlibSync,加载在 plugin 入口处) ----

  function tryInflate(bytes) {
    if (!bytes || !bytes.length) return null;
    if (globalThis.fflate && typeof globalThis.fflate.unzlibSync === "function") {
      try { return globalThis.fflate.unzlibSync(bytes); } catch (e) { /* try raw deflate */ }
      try { return globalThis.fflate.inflateSync(bytes); } catch (e) { /* fallthrough */ }
    }
    return null;
  }

  // ---- YYP packet ----
  // build: [maxType u16][minType u16][extCount u32]([key u16][len u16][value bytes])*
  //        + (packV2: [u16 0][u32 0][u32 dataLen][u32 dataLen][data])
  //        + (legacy:  [u16 dataLen][data])

  function buildYYP(opts) {
    const maxType = opts.maxType >>> 0;
    const minType = opts.minType >>> 0;
    const data = opts.data || new Uint8Array(0);
    const ext = opts.ext || {};
    const usePackV2 = opts.usePackV2 !== false;

    const parts = [writeU16LE(maxType), writeU16LE(minType)];
    const extKeys = Object.keys(ext);
    parts.push(writeU32LE(extKeys.length));
    for (let i = 0; i < extKeys.length; i++) {
      const key = parseInt(extKeys[i], 10) >>> 0;
      const valueBytes = utf8Encode(ext[extKeys[i]]);
      parts.push(writeU16LE(key), writeU16LE(valueBytes.length), valueBytes);
    }
    if (usePackV2) {
      parts.push(writeU16LE(0), writeU32LE(0), writeU32LE(data.length), writeU32LE(data.length), data);
    } else {
      parts.push(writeU16LE(data.length), data);
    }
    return concat.apply(null, parts);
  }

  function parseYYP(data) {
    try {
      const r = new Reader(data);
      const maxType = r.readU16LE();
      const minType = r.readU16LE();
      const extCount = r.readU32LE();
      const ext = {};
      for (let i = 0; i < extCount; i++) {
        const key = r.readU16LE();
        const len = r.readU16LE();
        const valueBytes = r.readBytes(len);
        ext[String(key)] = utf8Decode(valueBytes);
      }
      if (r.isAtEnd()) return { maxType: maxType, minType: minType, ext: ext, data: new Uint8Array(0) };

      const legacyLen = r.readU16LE();
      let payload;
      if (legacyLen > 0) {
        payload = r.readBytes(legacyLen);
      } else {
        if (r.remaining() < 12) {
          return { maxType: maxType, minType: minType, ext: ext, data: new Uint8Array(0) };
        }
        const compressType = r.readU32LE();
        const lenA = r.readU32LE();
        const lenB = r.readU32LE();
        const remaining = r.remaining();
        let packedLen;
        if (lenB > 0 && lenB <= remaining) packedLen = lenB;
        else if (lenA > 0 && lenA <= remaining) packedLen = lenA;
        else packedLen = remaining;
        const packed = r.readBytes(packedLen);

        if (compressType === 1) {
          payload = tryInflate(packed) || packed;
        } else {
          let candidateLen;
          if (lenA > 0 && lenA <= remaining && (lenA === remaining || lenB > remaining)) candidateLen = lenA;
          else if (lenB > 0 && lenB <= remaining) candidateLen = lenB;
          else candidateLen = remaining;
          payload = packed.subarray(0, candidateLen);
        }
      }
      return { maxType: maxType, minType: minType, ext: ext, data: payload };
    } catch (e) {
      return null;
    }
  }

  // ---- AP Router ----

  function buildAPRouterFrame(opts) {
    const from = opts.from || "";
    const ruri = opts.ruri >>> 0;
    const resCode = (opts.resCode || 0) & 0xffff;
    const body = opts.body || new Uint8Array(0);
    const headers = opts.headers || new Uint8Array(0);
    const payload = concat(
      writeASCIIString16(from),
      writeU32LE(ruri),
      writeU16LE(resCode),
      writeBytes32(body),
      writeBytes32(headers)
    );
    return buildFrame(opts.outerURI >>> 0, payload);
  }

  function parseAPRouter(payload) {
    try {
      const r = new Reader(payload);
      const from = r.readASCIIString16();
      const ruri = r.readU32LE();
      const resCode = r.readU16LE();
      const body = r.readBytes32();
      const headers = r.readBytes32();
      return { from: from, ruri: ruri, resCode: resCode, body: body, headers: headers };
    } catch (e) {
      return null;
    }
  }

  function buildAPRouterHeaders(opts) {
    const realUri = opts.realUri >>> 0;
    const appid = opts.appid >>> 0;
    const uid = opts.uid >>> 0;
    const serviceName = opts.serviceName || "";
    const extentProps = opts.extentProps || {};
    const clientCtx = opts.clientCtx || "";

    const chunks = [];
    function appendChunk(field, value) {
      const chunkLen = (4 + value.length) >>> 0;
      const descriptor = ((field & 0xff) << 24) | (chunkLen & 0x00FFFFFF);
      chunks.push(writeU32LE(descriptor >>> 0), value);
    }

    appendChunk(1, writeU32LE(realUri));

    const field2 = concat(writeU32LE(appid), writeU32LE(uid), writeU32LE(0));
    appendChunk(2, field2);

    const field4 = concat(writeU32LE(0), writeU32LE(0));
    appendChunk(4, field4);

    appendChunk(5, writeU32LE(0));

    const field6 = concat(
      writeU32LE(0), writeU32LE(0), writeU16LE(0),
      writeASCIIString16(serviceName),
      writeU16LE(0), writeU32LE(0)
    );
    appendChunk(6, field6);

    const sortedKeys = Object.keys(extentProps).map(function (k) { return parseInt(k, 10) >>> 0; }).sort(function (a, b) { return a - b; });
    const field7Parts = [writeU32LE(sortedKeys.length)];
    for (let i = 0; i < sortedKeys.length; i++) {
      const key = sortedKeys[i];
      const value = extentProps[key];
      field7Parts.push(writeU32LE(key), writeBytes16(value));
    }
    appendChunk(7, concat.apply(null, field7Parts));

    appendChunk(8, writeASCIIString16(clientCtx));

    chunks.push(writeU32LE(0xFF787878));
    return concat.apply(null, chunks);
  }

  // ---- Service messages ----

  function buildUlSvcMsgByUid(opts) {
    const appid = opts.appid & 0xffff;
    const topSid = opts.topSid >>> 0;
    const uid = opts.uid >>> 0;
    const payload = opts.payload || new Uint8Array(0);
    const clientIp = (opts.clientIp || 0) >>> 0;
    const termType = (opts.termType || 0) & 0xff;
    const statType = (opts.statType || 0) & 0xff;
    const subSid = opts.subSid >>> 0;
    const ext = opts.ext || {};
    const appendH5Tail = opts.appendH5Tail !== false;

    const parts = [
      writeU16LE(appid), writeU32LE(topSid), writeU32LE(uid),
      writeBytes32(payload),
      writeU32LE(clientIp), writeU8(termType), writeU8(statType), writeU32LE(subSid),
      writeU32LE(0), writeU32LE(0)
    ];
    const extKeys = Object.keys(ext);
    parts.push(writeU32LE(extKeys.length));
    for (let i = 0; i < extKeys.length; i++) {
      const key = parseInt(extKeys[i], 10) >>> 0;
      parts.push(writeU32LE(key), writeASCIIString16(ext[extKeys[i]]));
    }
    if (appendH5Tail) {
      parts.push(writeU16LE(0), writeU32LE(0), writeU32LE(uid), writeU32LE(0), writeU32LE(0), writeU32LE(0));
    }
    return concat.apply(null, parts);
  }

  function parseDlSvcMsgByUid(data) {
    try {
      const r = new Reader(data);
      const appid = r.readU16LE();
      const uid = r.readU32LE();
      const payload = r.readBytes32();
      const suid = r.readU32LE();
      r.readU32LE();
      const seqId = r.readU32LE();
      r.readU32LE();
      return { appid: appid, uid: uid, payload: payload, suid: suid, seqId: seqId };
    } catch (e) {
      return null;
    }
  }

  function parseDlSvcMsgBySid(data) {
    try {
      const r = new Reader(data);
      const appid = r.readU16LE();
      const topSid = r.readU32LE();
      const payload = r.readBytes16();
      return { appid: appid, topSid: topSid, payload: payload };
    } catch (e) {
      return null;
    }
  }

  function parseDlUsrGroupMsg(data) {
    try {
      const r = new Reader(data);
      r.readU64LE(); // grpType
      r.readU64LE(); // grpId
      const appid = r.readU32LE();
      const msg = r.readBytes32();
      r.readU64LE(); // seqNum
      r.readU64LE(); // srvId
      const ruri = r.readU32LE();
      r.readASCIIString16(); // subSvcName
      return { appid: appid, msg: msg, ruri: ruri };
    } catch (e) {
      return null;
    }
  }

  function buildSubServiceTypes(uri, uid, appids) {
    const parts = [writeU32LE(uid >>> 0), writeU32LE(0), writeU32LE(appids.length)];
    for (let i = 0; i < appids.length; i++) parts.push(writeU32LE(appids[i] >>> 0));
    return buildFrame(uri >>> 0, concat.apply(null, parts));
  }

  // ---- Protobuf 风格(varint + length-delimited) ----

  function encodeVarint(value) {
    const out = [];
    let big = typeof value === "bigint" ? value : BigInt(Math.floor(Number(value) || 0));
    if (big < 0n) big = (1n << 64n) + big;
    while (big > 0x7Fn) {
      out.push(Number((big & 0x7Fn) | 0x80n));
      big >>= 7n;
    }
    out.push(Number(big & 0x7Fn));
    return new Uint8Array(out);
  }

  function readVarint(data, offset) {
    let result = 0n;
    let shift = 0n;
    let cursor = offset;
    while (cursor < data.length) {
      const byte = data[cursor];
      result |= BigInt(byte & 0x7F) << shift;
      cursor += 1;
      if ((byte & 0x80) === 0) return [result, cursor];
      shift += 7n;
      if (shift >= 64n) return null;
    }
    return null;
  }

  function encodeString(field, value) {
    const tag = (BigInt(field) << 3n) | 2n;
    const utf8 = utf8Encode(value);
    return concat(encodeVarint(tag), encodeVarint(utf8.length), utf8);
  }

  function encodeInt(field, value) {
    const tag = (BigInt(field) << 3n) | 0n;
    const v = BigInt(Math.floor(Number(value) || 0));
    const wire = v >= 0n ? v : ((1n << 64n) + v);
    return concat(encodeVarint(tag), encodeVarint(wire));
  }

  function encodeUInt64(field, value) {
    const tag = (BigInt(field) << 3n) | 0n;
    return concat(encodeVarint(tag), encodeVarint(value));
  }

  function encodeMessage(field, bytes) {
    const tag = (BigInt(field) << 3n) | 2n;
    return concat(encodeVarint(tag), encodeVarint(bytes.length), bytes);
  }

  function parseProtobuf(data) {
    const fields = [];
    let offset = 0;
    while (offset < data.length) {
      const tagResult = readVarint(data, offset);
      if (!tagResult) break;
      const tag = tagResult[0];
      offset = tagResult[1];
      const wireType = Number(tag & 0x7n);
      const fieldNumber = Number(tag >> 3n);

      if (wireType === 0) {
        const valueResult = readVarint(data, offset);
        if (!valueResult) return fields;
        const raw = data.subarray(offset, valueResult[1]);
        fields.push({ number: fieldNumber, wireType: 0, rawValue: raw, varintValue: valueResult[0] });
        offset = valueResult[1];
      } else if (wireType === 2) {
        const lenResult = readVarint(data, offset);
        if (!lenResult) return fields;
        offset = lenResult[1];
        const intLen = Number(lenResult[0]);
        if (intLen < 0 || offset + intLen > data.length) return fields;
        const raw = data.subarray(offset, offset + intLen);
        fields.push({ number: fieldNumber, wireType: 2, rawValue: raw, varintValue: null });
        offset += intLen;
      } else if (wireType === 5) {
        if (offset + 4 > data.length) return fields;
        fields.push({ number: fieldNumber, wireType: 5, rawValue: data.subarray(offset, offset + 4), varintValue: null });
        offset += 4;
      } else if (wireType === 1) {
        if (offset + 8 > data.length) return fields;
        fields.push({ number: fieldNumber, wireType: 1, rawValue: data.subarray(offset, offset + 8), varintValue: null });
        offset += 8;
      } else {
        return fields;
      }
    }
    return fields;
  }

  function protobufFieldMap(data) {
    const map = {};
    const fields = parseProtobuf(data);
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!map[f.number]) map[f.number] = [];
      map[f.number].push(f);
    }
    return map;
  }

  function firstStringField(data, number) {
    const map = protobufFieldMap(data);
    if (map[number] && map[number][0]) return utf8Decode(map[number][0].rawValue);
    return null;
  }

  return {
    concat: concat, utf8Encode: utf8Encode, utf8Decode: utf8Decode,
    bytesToBase64: bytesToBase64, base64ToBytes: base64ToBytes,
    writeU8: writeU8, writeU16LE: writeU16LE, writeU32LE: writeU32LE, writeU64LE: writeU64LE,
    writeBytes16: writeBytes16, writeBytes32: writeBytes32, writeASCIIString16: writeASCIIString16,
    Reader: Reader,
    buildFrame: buildFrame, parseFrame: parseFrame,
    buildYYP: buildYYP, parseYYP: parseYYP,
    buildAPRouterFrame: buildAPRouterFrame, parseAPRouter: parseAPRouter,
    buildAPRouterHeaders: buildAPRouterHeaders,
    buildUlSvcMsgByUid: buildUlSvcMsgByUid,
    parseDlSvcMsgByUid: parseDlSvcMsgByUid, parseDlSvcMsgBySid: parseDlSvcMsgBySid,
    parseDlUsrGroupMsg: parseDlUsrGroupMsg, buildSubServiceTypes: buildSubServiceTypes,
    encodeVarint: encodeVarint, encodeString: encodeString, encodeInt: encodeInt,
    encodeUInt64: encodeUInt64, encodeMessage: encodeMessage,
    parseProtobuf: parseProtobuf, protobufFieldMap: protobufFieldMap,
    firstStringField: firstStringField
  };
})();

// =============================================================================
// YY 取流业务流(原 YYWebSocketClient.swift):匿名登录 → APLogin → SubService →
// ChannelStreamsUpdate → ChannelGearLineInfo → 解出 avp_info_res 里的 URL
// =============================================================================

const __yy_ws_URI = {
  cliAPLoginAuthReq2: 779268,
  cliAPLoginAuthRes:  778500,
  cliAPLoginAuthRes2: 779524,
  anonymousLoginRes:  20078,
  loginAP:            775684,
  loginAPRes:         775940,
  appPong:            794372,
  papRouterReq:       512011,
  papRouterRes:       512267,
  pSubServiceTypes:   538456,
  dlUsrGroupMsg:      533080,
  dlSvcMsgBySid:      28760,
  ulSvcMsgByUid:      79960,
  dlSvcMsgByUid:      80216
};

const __yy_ws_AppID = {
  apService:           259,
  appidA:              15068,
  appidB:              15065,
  streamUpdateService: 15066,
  streamLineService:   15067,
  appidD:              15066,
  mediaAppidStr:       "15013"
};

function _yy_ws_uuidNoDash() {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
    return String(crypto.randomUUID()).replace(/-/g, "");
  }
  const t = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
  return t.replace(/[xy]/g, function (c) {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function _yy_ws_buildAnonymousLoginRequest(ctx) {
  const T = __yy_tars;
  const anon = T.concat(
    T.writeASCIIString16(""),
    T.writeU32LE(0),
    T.writeASCIIString16("B8-97-5A-17-AD-4D"),
    T.writeASCIIString16("B8-97-5A-17-AD-4D"),
    T.writeU32LE(0),
    T.writeASCIIString16("yymwebh5")
  );
  const payload = T.concat(
    T.writeASCIIString16(""),
    T.writeU32LE(19822),
    T.writeBytes32(anon)
  );
  return T.buildFrame(__yy_ws_URI.cliAPLoginAuthReq2, payload);
}

function _yy_ws_buildPLoginAPRequest(ctx, appid) {
  const T = __yy_tars;
  const auth = T.concat(
    T.writeASCIIString16(ctx.yyPassport),
    T.writeASCIIString16(ctx.yyPassword),
    T.writeU32LE(0), T.writeU32LE(0), T.writeU32LE(0),
    T.writeASCIIString16("yytianlaitv"),
    T.writeASCIIString16("B8-97-5A-17-AD-4D"),
    T.writeASCIIString16(""),
    T.writeU32LE(0), T.writeU32LE(0), T.writeU32LE(0), T.writeU32LE(0),
    T.writeASCIIString16(ctx.wsUUID)
  );
  const payload = T.concat(
    T.writeBytes32(auth),
    T.writeU32LE(appid),
    T.writeU32LE(ctx.yyUID),
    T.writeU32LE(0),
    T.writeU8(0),
    T.writeBytes16(new Uint8Array(0)),
    T.writeBytes16(ctx.yyCookie || new Uint8Array(0)),
    T.writeASCIIString16(`${appid}:0`)
  );
  return T.buildFrame(__yy_ws_URI.loginAP, payload);
}

function _yy_ws_buildHead(ctx, sequence) {
  const T = __yy_tars;
  return T.concat(
    T.encodeUInt64(1, sequence),
    T.encodeString(2, __yy_ws_AppID.mediaAppidStr),
    T.encodeString(3, "121"),
    T.encodeString(4, ctx.roomId),
    T.encodeString(5, ctx.roomId),
    T.encodeUInt64(6, BigInt(ctx.yyUID)),
    T.encodeInt(7, 108),
    T.encodeString(8, "5.23.0-beta.2"),
    T.encodeInt(9, 1),
    T.encodeString(10, "yylive_web"),
    T.encodeString(11, "5.23.0-beta.2"),
    T.encodeString(12, "0"),
    T.encodeString(13, "5.23.0-beta.2")
  );
}

function _yy_ws_buildClientAttribute() {
  const T = __yy_tars;
  return T.concat(
    T.encodeString(1, "web"),
    T.encodeString(2, "web1"),
    T.encodeString(3, ""),
    T.encodeString(4, ""),
    T.encodeString(5, "chrome"),
    T.encodeString(6, "145.0.0.0"),
    T.encodeString(7, ""),
    T.encodeString(8, ""),
    T.encodeString(9, ""),
    T.encodeString(10, ""),
    T.encodeString(11, "1920"),
    T.encodeString(12, "1080"),
    T.encodeString(13, ""),
    T.encodeInt(14, 8),
    T.encodeInt(15, 1)
  );
}

function _yy_ws_buildAvpParameter(lineSeq, gear) {
  const T = __yy_tars;
  return T.concat(
    T.encodeInt(1, 1),
    T.encodeInt(4, 8),
    T.encodeInt(5, 0),
    T.encodeInt(6, 0),
    T.encodeInt(7, Math.floor(Date.now() / 1000)),
    T.encodeInt(11, lineSeq | 0),
    T.encodeInt(12, gear | 0),
    T.encodeInt(14, 1),
    T.encodeInt(16, 0)
  );
}

function _yy_ws_nextTrace(ctx) {
  ctx.traceCounter = ((ctx.traceCounter || 0) + 1) & 0xffffffff;
  return `F${ctx.yyUID}_yymwebh5_${ctx.tracePrefix}_${ctx.traceCounter}`;
}

function _yy_ws_sendServiceAppData(ctx, opts) {
  const T = __yy_tars;
  const trace = _yy_ws_nextTrace(ctx);
  const yyp = T.buildYYP({ maxType: opts.maxType, minType: opts.minType, data: opts.protobuf });
  const ul = T.buildUlSvcMsgByUid({
    appid: opts.appid,
    topSid: ctx.roomSid,
    uid: ctx.yyUID,
    payload: yyp,
    statType: opts.appid & 0xff,
    subSid: ctx.roomSid,
    ext: {},
    appendH5Tail: true
  });
  const headers = T.buildAPRouterHeaders({
    realUri: __yy_ws_URI.ulSvcMsgByUid,
    appid: opts.routerAppid || __yy_ws_AppID.apService,
    uid: ctx.yyUID,
    serviceName: "",
    extentProps: { 103: T.utf8Encode(trace) },
    clientCtx: ""
  });
  const frame = T.buildAPRouterFrame({
    outerURI: __yy_ws_URI.papRouterReq,
    ruri: __yy_ws_URI.ulSvcMsgByUid,
    body: ul,
    headers: headers
  });
  ctx.send(frame);
}

function _yy_ws_sendSubServiceTypes(ctx) {
  const T = __yy_tars;
  const appids = [
    __yy_ws_AppID.appidA,
    __yy_ws_AppID.appidB,
    __yy_ws_AppID.streamLineService,
    __yy_ws_AppID.appidD
  ];
  const frame = T.buildSubServiceTypes(__yy_ws_URI.pSubServiceTypes, ctx.yyUID, appids);
  ctx.send(frame);
}

function _yy_ws_sendChannelStreamsUpdateRequest(ctx) {
  const T = __yy_tars;
  const seq = BigInt(Date.now());
  if (seq > ctx.seqCounter) ctx.seqCounter = seq;
  const request = T.concat(
    T.encodeUInt64(8, seq),
    T.encodeMessage(9, _yy_ws_buildClientAttribute()),
    T.encodeMessage(100, _yy_ws_buildHead(ctx, seq))
  );
  _yy_ws_sendServiceAppData(ctx, {
    appid: __yy_ws_AppID.streamUpdateService,
    maxType: 9701, minType: 5,
    protobuf: request
  });
}

function _yy_ws_encodeGearStreamKeyInfo(info) {
  const T = __yy_tars;
  const parts = [T.encodeString(1, info.streamKey)];
  if (info.rStreamKey) parts.push(T.encodeString(2, info.rStreamKey));
  parts.push(T.encodeUInt64(4, info.ver));
  if (info.rVer !== undefined && info.rVer !== null) parts.push(T.encodeUInt64(5, info.rVer));
  if (info.stage) parts.push(T.encodeString(6, info.stage));
  if (info.rStage) parts.push(T.encodeString(7, info.rStage));
  if (info.mixToken) parts.push(T.encodeString(8, info.mixToken));
  if (info.rMixToken) parts.push(T.encodeString(9, info.rMixToken));
  return T.concat.apply(null, parts);
}

function _yy_ws_sendChannelGearLineInfoRequest(ctx, primary, lineCandidates, lineSeq, gear) {
  const T = __yy_tars;
  ctx.seqCounter += 1n;
  const seq = ctx.seqCounter;
  const parts = [
    T.encodeMessage(1, _yy_ws_buildAvpParameter(lineSeq, gear)),
    T.encodeMessage(2, _yy_ws_encodeGearStreamKeyInfo(primary))
  ];
  for (let i = 0; i < lineCandidates.length; i++) {
    parts.push(T.encodeMessage(3, _yy_ws_encodeGearStreamKeyInfo(lineCandidates[i])));
  }
  parts.push(T.encodeMessage(100, _yy_ws_buildHead(ctx, seq)));
  _yy_ws_sendServiceAppData(ctx, {
    appid: __yy_ws_AppID.streamLineService,
    maxType: 9701, minType: 7,
    protobuf: T.concat.apply(null, parts),
    routerAppid: __yy_ws_AppID.apService
  });
}

function _yy_ws_parseJSONField(rawBytes) {
  if (!rawBytes || !rawBytes.length) return null;
  try {
    const text = __yy_tars.utf8Decode(rawBytes);
    if (!text) return null;
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" ? obj : null;
  } catch (e) { return null; }
}

function _yy_ws_strValue(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "bigint") return String(v);
  return "";
}

function _yy_ws_handleStreamsUpdateResponse(ctx, data) {
  const T = __yy_tars;
  const root = T.protobufFieldMap(data);
  if (root[1] && root[1][0] && root[1][0].varintValue && root[1][0].varintValue !== 0n) {
    const msg = T.firstStringField(data, 9) || "";
    return ctx.fail(new Error(`YY ChannelStreamsUpdateResponse result=${root[1][0].varintValue} msg=${msg}`));
  }

  const channelInfo = root[8] && root[8][0] && root[8][0].rawValue;
  if (!channelInfo) return ctx.fail(new Error("YY ChannelStreamsUpdateResponse missing channel_stream_info"));

  const channelMap = T.protobufFieldMap(channelInfo);
  if (channelMap[1] && channelMap[1][0] && channelMap[1][0].varintValue !== null) {
    ctx.streamInfo.current_version = String(channelMap[1][0].varintValue);
  }
  const streams = channelMap[2] || [];
  if (!streams.length) return ctx.fail(new Error("YY ChannelStreamsUpdateResponse streams is empty"));

  const candidates = [];
  for (let i = 0; i < streams.length; i++) {
    const sm = T.protobufFieldMap(streams[i].rawValue);
    let streamKey = "";
    if (sm[26] && sm[26][0]) streamKey = T.utf8Decode(sm[26][0].rawValue).trim();
    if (!streamKey) continue;
    const ver = sm[15] && sm[15][0] && sm[15][0].varintValue;
    if (ver === undefined || ver === null) continue;

    let lineSeq = 0;
    if (sm[28] && sm[28][0]) {
      const ll = T.protobufFieldMap(sm[28][0].rawValue);
      if (ll[1] && ll[1][0]) {
        const li = T.protobufFieldMap(ll[1][0].rawValue);
        if (li[1] && li[1][0] && li[1][0].varintValue !== null) {
          lineSeq = Number(li[1][0].varintValue);
        }
      }
    }

    let gear = 1;
    let stage = "";
    let mixToken = "";
    const json8 = _yy_ws_parseJSONField(sm[8] && sm[8][0] && sm[8][0].rawValue);
    if (json8) {
      if (json8.gear_info && (json8.gear_info.gear !== undefined && json8.gear_info.gear !== null)) {
        const g = Number(json8.gear_info.gear);
        if (Number.isFinite(g)) gear = g;
      }
      if (json8.attr) {
        stage = _yy_ws_strValue(json8.attr.stage);
        mixToken = _yy_ws_strValue(json8.attr.mixToken) || _yy_ws_strValue(json8.attr.mix_token);
      }
      if (!stage) stage = _yy_ws_strValue(json8.stage);
      if (!mixToken) mixToken = _yy_ws_strValue(json8.mixToken) || _yy_ws_strValue(json8.mix_token);
    }
    if ((!stage || !mixToken) && sm[10] && sm[10][0]) {
      const json10 = _yy_ws_parseJSONField(sm[10][0].rawValue);
      if (json10) {
        if (!stage) stage = _yy_ws_strValue(json10.stage);
        if (!mixToken) mixToken = _yy_ws_strValue(json10.mixToken) || _yy_ws_strValue(json10.mix_token);
      }
    }

    const isVideo = streamKey.indexOf("_xv_") >= 0;
    const isAudio = streamKey.indexOf("_xa_") >= 0;
    let score = 0;
    if (isVideo) score += 1000;
    if (isAudio) score -= 200;
    if (streamKey.endsWith("_0_0_0")) score += 50;
    score += Math.max(0, Math.min(gear, 20)) * 10;
    if (lineSeq > 0) score += 5;

    candidates.push({
      index: i, streamKey: streamKey, ver: ver, lineSeq: lineSeq, gear: gear,
      stage: stage, mixToken: mixToken,
      isVideo: isVideo, isAudio: isAudio, score: score
    });
  }

  const videos = candidates.filter(function (c) { return c.isVideo; });
  const picked = _yy_ws_selectRequestedCandidate(videos, ctx.requestedLineSeq, ctx.requestedGear)
    || _yy_ws_bestVideoCandidate(videos);
  if (!picked) return ctx.fail(new Error(`YY ChannelStreamsUpdateResponse missing valid stream_key/ver in ${streams.length} streams`));

  ctx.streamInfo.stream_key = picked.streamKey;
  ctx.streamInfo.ver = String(picked.ver);
  ctx.streamInfo.line_seq = String(picked.lineSeq);
  ctx.streamInfo.gear = String(picked.gear);

  const pairedAudio = _yy_ws_findPairedAudio(picked, candidates);
  const primary = _yy_ws_makeGearStreamKeyInfo(picked, pairedAudio);
  const seen = {};
  const lineCandidates = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.isVideo || c.gear !== picked.gear) continue;
    const audio = _yy_ws_findPairedAudio(c, candidates);
    const info = _yy_ws_makeGearStreamKeyInfo(c, audio);
    if (!seen[info.streamKey]) {
      seen[info.streamKey] = true;
      lineCandidates.push(info);
    }
  }
  if (!lineCandidates.length) lineCandidates.push(primary);

  ctx.state = "waitingGearLine";
  _yy_ws_sendChannelGearLineInfoRequest(ctx, primary, lineCandidates, picked.lineSeq, picked.gear);
}

function _yy_ws_bestVideoCandidate(videos) {
  if (!videos.length) return null;
  return videos.slice().sort(function (a, b) {
    if (a.score !== b.score) return b.score - a.score;
    if (a.gear !== b.gear) return b.gear - a.gear;
    return a.index - b.index;
  })[0];
}

function _yy_ws_selectRequestedCandidate(videos, requestedLineSeq, requestedGear) {
  if (!videos.length) return null;
  if (requestedLineSeq === undefined && requestedGear === undefined) return null;

  if (requestedLineSeq !== undefined && requestedGear !== undefined) {
    const exact = videos.filter(function (c) { return c.lineSeq === requestedLineSeq && c.gear === requestedGear; });
    const picked = _yy_ws_bestVideoCandidate(exact);
    if (picked) return picked;
  }
  if (requestedGear !== undefined) {
    const exactGear = videos.filter(function (c) { return c.gear === requestedGear; });
    const picked = _yy_ws_bestVideoCandidate(exactGear);
    if (picked) return picked;
    const nearest = videos.slice().sort(function (a, b) {
      const la = Math.abs(a.gear - requestedGear);
      const lb = Math.abs(b.gear - requestedGear);
      if (la !== lb) return la - lb;
      if (a.score !== b.score) return b.score - a.score;
      return a.index - b.index;
    })[0];
    if (nearest) return nearest;
  }
  if (requestedLineSeq !== undefined) {
    const exact = videos.filter(function (c) { return c.lineSeq === requestedLineSeq; });
    return _yy_ws_bestVideoCandidate(exact);
  }
  return null;
}

function _yy_ws_streamTail(streamKey) {
  const idxV = streamKey.indexOf("_xv_");
  if (idxV >= 0) return streamKey.substring(idxV + 4);
  const idxA = streamKey.indexOf("_xa_");
  if (idxA >= 0) return streamKey.substring(idxA + 4);
  return streamKey;
}

function _yy_ws_findPairedAudio(video, all) {
  const directKey = video.streamKey.replace("_xv_", "_xa_");
  const direct = all.filter(function (c) { return c.isAudio && c.streamKey === directKey; })[0];
  if (direct) return direct;
  const targetTail = _yy_ws_streamTail(video.streamKey);
  return all.filter(function (c) { return c.isAudio && _yy_ws_streamTail(c.streamKey) === targetTail; })[0] || null;
}

function _yy_ws_makeGearStreamKeyInfo(video, audio) {
  return {
    streamKey: video.streamKey,
    ver: video.ver,
    stage: video.stage,
    mixToken: video.mixToken,
    rStreamKey: audio ? audio.streamKey : null,
    rVer: audio ? audio.ver : null,
    rStage: audio ? audio.stage : null,
    rMixToken: audio ? audio.mixToken : null
  };
}

function _yy_ws_extractURLFromAvpInfoRes(avpInfoRes) {
  const T = __yy_tars;
  const avpMap = T.protobufFieldMap(avpInfoRes);
  const entries = avpMap[1];
  if (!entries || !entries.length) return null;
  let foundURL = null;
  let foundLineSeq = null;
  for (let i = 0; i < entries.length; i++) {
    const entry = T.protobufFieldMap(entries[i].rawValue);
    if (!entry[2] || !entry[2][0]) continue;
    const lineAddr = T.protobufFieldMap(entry[2][0].rawValue);
    if (lineAddr[1] && lineAddr[1][0] && lineAddr[1][0].varintValue !== null) {
      foundLineSeq = lineAddr[1][0].varintValue;
    }
    if (!lineAddr[3] || !lineAddr[3][0]) continue;
    const cdn = T.protobufFieldMap(lineAddr[3][0].rawValue);
    if (cdn[4] && cdn[4][0]) {
      const url = T.utf8Decode(cdn[4][0].rawValue);
      if (url && url.indexOf("://") >= 0) {
        foundURL = url;
        break;
      }
    }
  }
  if (!foundURL) return null;
  return { url: foundURL, lineSeq: foundLineSeq };
}

function _yy_ws_extractURLByRecursiveScan(data, depth) {
  const T = __yy_tars;
  const d = depth || 0;
  if (d > 5 || !data || !data.length) return null;
  const re = /https?:\/\/[^\s"']+/;
  const text = T.utf8Decode(data);
  if (text) {
    const m = text.match(re);
    if (m && (m[0].indexOf("yy.com/live/") >= 0 || m[0].indexOf("flv") >= 0)) return m[0];
  }
  const fields = T.parseProtobuf(data);
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].wireType !== 2) continue;
    const f = fields[i];
    const t = T.utf8Decode(f.rawValue);
    if (t) {
      const m = t.match(re);
      if (m && (m[0].indexOf("yy.com/live/") >= 0 || m[0].indexOf("flv") >= 0)) return m[0];
    }
    const nested = _yy_ws_extractURLByRecursiveScan(f.rawValue, d + 1);
    if (nested) return nested;
  }
  return null;
}

function _yy_ws_handleGearLineResponse(ctx, data) {
  const T = __yy_tars;
  let payload = data;
  let root = T.protobufFieldMap(payload);
  if (Object.keys(root).length === 0) {
    const inflated = (globalThis.fflate && typeof globalThis.fflate.unzlibSync === "function")
      ? (function () { try { return globalThis.fflate.unzlibSync(payload); } catch (e) { return null; } })()
      : null;
    if (inflated && inflated.length) {
      payload = inflated;
      root = T.protobufFieldMap(payload);
    }
  }
  const candidates = [];
  if (root[3] && root[3][0]) candidates.push(root[3][0].rawValue);
  if (root[2] && root[2][0]) candidates.push(root[2][0].rawValue);
  if (root[4] && root[4][0]) candidates.push(root[4][0].rawValue);
  Object.keys(root).forEach(function (k) {
    const f = root[k] && root[k][0];
    if (!f) return;
    let dup = false;
    for (let i = 0; i < candidates.length; i++) if (candidates[i] === f.rawValue) { dup = true; break; }
    if (!dup) candidates.push(f.rawValue);
  });

  let foundURL = null;
  let foundLineSeq = null;
  for (let i = 0; i < candidates.length; i++) {
    const parsed = _yy_ws_extractURLFromAvpInfoRes(candidates[i]);
    if (parsed) { foundURL = parsed.url; foundLineSeq = parsed.lineSeq; break; }
  }
  if (!foundURL) {
    foundURL = _yy_ws_extractURLByRecursiveScan(payload);
  }
  if (!foundURL) {
    return ctx.fail(new Error("YY no valid cdn url found in 9701/8 (root fields=" + Object.keys(root).join(",") + ")"));
  }

  ctx.streamInfo.url = foundURL;
  if (foundLineSeq !== null && foundLineSeq !== undefined) {
    ctx.streamInfo.line_seq = String(foundLineSeq);
  }
  ctx.state = "completed";
  ctx.succeed(Object.assign({}, ctx.streamInfo));
}

function _yy_ws_handleDlSvcMsgByUid(ctx, payload) {
  const T = __yy_tars;
  const dl = T.parseDlSvcMsgByUid(payload);
  if (!dl) return;
  const yyp = T.parseYYP(dl.payload);
  if (!yyp) return;
  if (dl.appid === __yy_ws_AppID.streamUpdateService && yyp.maxType === 9701 && yyp.minType === 6) {
    return _yy_ws_handleStreamsUpdateResponse(ctx, yyp.data);
  }
  if (dl.appid === __yy_ws_AppID.streamLineService && yyp.maxType === 9701 && yyp.minType === 8) {
    return _yy_ws_handleGearLineResponse(ctx, yyp.data);
  }
}

function _yy_ws_handleDlSvcMsgBySid(ctx, payload) {
  const T = __yy_tars;
  const dl = T.parseDlSvcMsgBySid(payload);
  if (!dl) return;
  const yyp = T.parseYYP(dl.payload);
  if (!yyp) return;
  if (dl.appid === __yy_ws_AppID.streamLineService && yyp.maxType === 9701 && yyp.minType === 8) {
    return _yy_ws_handleGearLineResponse(ctx, yyp.data);
  }
  if (dl.appid === __yy_ws_AppID.streamUpdateService && yyp.maxType === 9701 && yyp.minType === 6) {
    return _yy_ws_handleStreamsUpdateResponse(ctx, yyp.data);
  }
}

function _yy_ws_handleRouterMessage(ctx, frameURI, payload) {
  const T = __yy_tars;
  const router = T.parseAPRouter(payload);
  if (!router) return;
  if (router.ruri === __yy_ws_URI.dlSvcMsgByUid) return _yy_ws_handleDlSvcMsgByUid(ctx, router.body);
  if (router.ruri === __yy_ws_URI.dlSvcMsgBySid) return _yy_ws_handleDlSvcMsgBySid(ctx, router.body);
  if (router.ruri === __yy_ws_URI.dlUsrGroupMsg) {
    const grp = T.parseDlUsrGroupMsg(router.body);
    if (!grp) return;
    if (grp.ruri === __yy_ws_URI.dlSvcMsgByUid) return _yy_ws_handleDlSvcMsgByUid(ctx, grp.msg);
    if (grp.ruri === __yy_ws_URI.dlSvcMsgBySid) return _yy_ws_handleDlSvcMsgBySid(ctx, grp.msg);
  }
}

function _yy_ws_handleLoginAuthResponse(ctx, payload) {
  const T = __yy_tars;
  try {
    const r = new T.Reader(payload);
    r.readASCIIString16();
    r.readU32LE();
    const ruri = r.readU32LE();
    const inner = r.readBytes32();
    if (ruri !== __yy_ws_URI.anonymousLoginRes) return;

    const a = new T.Reader(inner);
    a.readASCIIString16();
    const resCode = a.readU32LE();
    if (resCode !== 0 && resCode !== 200) {
      return ctx.fail(new Error(`YY anonymous login failed: resCode=${resCode}`));
    }
    ctx.yyUID = a.readU32LE();
    a.readU32LE(); // yyid
    ctx.yyPassport = a.readASCIIString16();
    ctx.yyPassword = a.readASCIIString16();
    ctx.yyCookie = a.readBytes16();
    a.readBytes16(); // ticket

    ctx.state = "waitingAPLogin";
    ctx.send(_yy_ws_buildPLoginAPRequest(ctx, __yy_ws_AppID.apService));
  } catch (e) {
    ctx.fail(new Error("YY parse anonymous login response failed: " + (e && e.message ? e.message : String(e))));
  }
}

function _yy_ws_handleAPLoginResponse(ctx, payload) {
  const T = __yy_tars;
  try {
    const r = new T.Reader(payload);
    r.readU32LE();
    const resCode = r.readU32LE();
    r.readASCIIString16(); // context
    r.readU32LE();
    r.readU16LE();
    r.readU32LE();
    r.readU32LE();
    if (resCode !== 0 && resCode !== 200) {
      return ctx.fail(new Error(`YY AP login failed: resCode=${resCode}`));
    }
    _yy_ws_sendSubServiceTypes(ctx);
    ctx.state = "waitingStreams";
    // 直接同步发 ChannelStreamsUpdateRequest;YY 服务端按到达顺序处理,
    // 不再依赖 setTimeout 给固定延迟(JSContext 没有 setTimeout)。
    _yy_ws_sendChannelStreamsUpdateRequest(ctx);
  } catch (e) {
    ctx.fail(new Error("YY parse AP login response failed: " + (e && e.message ? e.message : String(e))));
  }
}

function _yy_ws_handleBinaryMessage(ctx, data) {
  const T = __yy_tars;
  const frame = T.parseFrame(data);
  if (!frame) return;
  switch (frame.uri) {
    case __yy_ws_URI.cliAPLoginAuthRes:
    case __yy_ws_URI.cliAPLoginAuthRes2:
      return _yy_ws_handleLoginAuthResponse(ctx, frame.payload);
    case __yy_ws_URI.loginAPRes:
      return _yy_ws_handleAPLoginResponse(ctx, frame.payload);
    case __yy_ws_URI.appPong:
      return;
    case __yy_ws_URI.papRouterReq:
    case __yy_ws_URI.papRouterRes:
      return _yy_ws_handleRouterMessage(ctx, frame.uri, frame.payload);
    default:
      return;
  }
}

async function _yy_ensureFflate() {
  if (globalThis.fflate && typeof globalThis.fflate.unzlibSync === "function") return;
  if (globalThis.Host && Host.runtime && typeof Host.runtime.loadBuiltinScript === "function") {
    try { Host.runtime.loadBuiltinScript("fflate_0.8.2_umd.js"); } catch (e) { /* ignore */ }
  }
}

async function _yy_get_stream_info_via_ws(roomId, requestedLineSeq, requestedGear) {
  await _yy_ensureFflate();

  const wsUUID = _yy_ws_uuidNoDash();
  const url = `wss://h5-sinchl.yy.com/websocket?appid=yymwebh5&version=3.2.10&uuid=${wsUUID}&sign=a8d7eef2`;
  const session = await Host.ws.open({
    url: url,
    headers: {
      "User-Agent": __lp_yy_playbackUserAgent,
      "Origin": "https://www.yy.com"
    },
    timeoutMs: 30000
  });

  return await new Promise(function (resolve, reject) {
    let settled = false;
    const ctx = {
      roomId: String(roomId),
      roomSid: parseInt(String(roomId), 10) >>> 0,
      requestedLineSeq: requestedLineSeq,
      requestedGear: requestedGear,
      wsUUID: wsUUID,
      yyUID: 0,
      yyPassport: "",
      yyPassword: "",
      yyCookie: new Uint8Array(0),
      seqCounter: BigInt(Date.now()),
      tracePrefix: Math.floor(Math.random() * 90000) + 10000,
      traceCounter: Math.floor(Math.random() * 50) + 30,
      state: "connecting",
      streamInfo: {},
      send: function (data) {
        const b64 = __yy_tars.bytesToBase64(data);
        session.send({ type: "binary", bytesBase64: b64 }).catch(function () {});
      },
      succeed: function (info) {
        if (settled) return;
        settled = true;
        session.close({ code: 1000, reason: "done" }).catch(function () {});
        resolve(info);
      },
      fail: function (err) {
        if (settled) return;
        settled = true;
        session.close({ code: 1011, reason: "error" }).catch(function () {});
        reject(err);
      }
    };

    // 协议级超时:依靠 Host.ws.open 的 timeoutMs(连接超时)与 YY 服务端空闲断连兜底。
    // JSContext 无 setTimeout,改用基于响应的同步推进。

    session.onMessage(function (event) {
      if (settled) return;
      const t = event && event.type;
      if (t === "open") {
        ctx.state = "waitingLogin";
        ctx.send(_yy_ws_buildAnonymousLoginRequest(ctx));
        return;
      }
      if (t === "binary") {
        try {
          const bytes = __yy_tars.base64ToBytes(event.bytesBase64);
          _yy_ws_handleBinaryMessage(ctx, bytes);
        } catch (e) {
          ctx.fail(e instanceof Error ? e : new Error(String(e)));
        }
        return;
      }
      if (t === "closed") {
        if (ctx.state !== "completed" && !settled) {
          ctx.fail(new Error("YY WebSocket disconnected: " + (event.reason || "")));
        }
        return;
      }
      if (t === "error") {
        ctx.fail(new Error("YY WebSocket error: " + (event.message || "unknown")));
        return;
      }
      // ignore "text" / others
    });
  });
}

// 老的 HTTP 取流路径已经废弃,但保留 quality-details 解析给 refreshPlayback 用。
function _yy_parseQualityDetails(jsonObject, defaultURL, roomId) {
  const playInfo = jsonObject && jsonObject.play_info;
  const gearInfo = playInfo && playInfo.gear_info;
  if (!gearInfo) {
    _yy_throw("INVALID_RESPONSE", "missing gear_info", { roomId: String(roomId || "") });
  }
  const result = [];
  const rates = (gearInfo.rates || []).filter(function (rate) { return Number.isFinite(rate); });
  for (const rate of rates) {
    let title = "";
    if (rate === gearInfo.gear_def) title = "高清";
    else if (rate === 4) title = "高清";
    else if (rate === 3) title = "标清";
    else if (rate === 2) title = "流畅";
    else if (rate === 1) title = "超清";
    else title = "默认";
    result.push({
      roomId: String(roomId || ""),
      title: title,
      qn: rate,
      url: String(defaultURL),
      liveCodeType: "flv",
      liveType: "6",
      userAgent: __lp_yy_playbackUserAgent,
      headers: __lp_yy_playbackHeaders,
      requestContext: { gear: String(rate), qn: String(rate) },
      playbackHints: {
        streamFormat: "flv",
        selectionBehavior: "refreshOnSelect"
      }
    });
  }
  return result;
}

function _yy_toRoomModel(item) {
  const sid = String(item && item.sid ? item.sid : "");
  const uid = item && item.uid ? String(item.uid) : sid;
  return {
    userName: String((item && item.name) || ""),
    roomTitle: String((item && item.desc) || ""),
    roomCover: String((item && item.img) || ""),
    userHeadImg: String((item && item.avatar) || ""),
    liveType: "6",
    liveState: "1",
    userId: uid,
    roomId: sid,
    liveWatchedCount: String((item && item.users) || 0)
  };
}

function _yy_searchToRoomModel(doc) {
  const roomId = String((doc && doc.sid) || "");
  return {
    userName: String((doc && (doc.name || doc.stageName)) || ""),
    roomTitle: String((doc && (doc.stageName || doc.name)) || ""),
    roomCover: String((doc && doc.headurl) || ""),
    userHeadImg: String((doc && doc.headurl) || ""),
    liveType: "6",
    liveState: String((doc && doc.liveOn) || "3"),
    userId: String((doc && doc.uid) || roomId),
    roomId,
    liveWatchedCount: "0"
  };
}

function _yy_resolveShare(shareCode) {
  const trimmed = String(shareCode || "").trim();
  if (!trimmed) _yy_throw("INVALID_ARGS", "shareCode is empty", { field: "shareCode" });

  const urlText = _yy_firstURL(trimmed);
  if (urlText) {
    try {
      const u = new URL(urlText);
      for (const key of __lp_yy_sidQueryKeys) {
        const value = u.searchParams.get(key);
        if (value && _yy_isValidRoomId(value)) {
          return value;
        }
      }
      const pathIds = String(u.pathname || "")
        .split("/")
        .filter(function (token) { return _yy_isValidRoomId(token); });
      if (pathIds.length > 0) {
        return pathIds[pathIds.length - 1];
      }
    } catch (e) {
    }
  }
  const tokens = trimmed.split(/[\s|]+/);
  for (const token of tokens) {
    if (_yy_isValidRoomId(token)) return token;
  }
  if (_yy_isValidRoomId(trimmed)) return trimmed;
  _yy_throw("NOT_FOUND", "cannot resolve roomId from shareCode", { shareCode: String(shareCode || "") });
}

function _yy_makeUUIDNoDash() {
  return _yy_ws_uuidNoDash();
}

const __yy_sharedGlobalKey = "__lp_plugin_yy_1_0_2_shared";

function _yy_danmakuDriver() {
  const driver = globalThis.__yyDanmakuDriver;
  if (!driver) {
    _yy_throw("UNSUPPORTED", "yy danmaku driver is unavailable", {});
  }
  return driver;
}

globalThis[__yy_sharedGlobalKey] = {
  throwError: _yy_throw,
  makeUUIDNoDash: _yy_makeUUIDNoDash,
  playbackUserAgent: __lp_yy_playbackUserAgent
};

globalThis.LiveParsePlugin = {
  apiVersion: 1,

  async getCategories() {
    const resp = await Host.http.request({
      url: "https://rubiks-idx.yy.com/navs",
      method: "GET",
      headers: __lp_yy_defaultHeaders,
      timeout: 20
    });

    const response = JSON.parse(resp.bodyText || "{}");
    if (_yy_parseCode(response.code, -1) !== 0) {
      _yy_throw("UPSTREAM", `YY category error: ${response.code} - ${response.message || ""}`, {
        code: String(response.code || ""),
        message: String(response.message || "")
      });
    }

    const lists = response.data || [];
    const result = [];
    for (const item of lists) {
      if (String(item.name || "") === "附近") continue;
      const subList = [];
      const navs = item.navs || [];
      for (const nav of navs) {
        subList.push({
          id: String(nav.id || ""),
          parentId: String(item.id || ""),
          title: String(nav.name || ""),
          icon: "",
          biz: String(nav.biz || "")
        });
      }
      if (subList.length === 0) {
        subList.push({
          id: "0",
          parentId: String(item.id || ""),
          title: String(item.name || ""),
          icon: "",
          biz: "idx"
        });
      }
      result.push({
        id: String(item.id || ""),
        title: String(item.name || ""),
        icon: String(item.pic || ""),
        biz: String(item.biz || ""),
        subList
      });
    }
    return result;
  },

  async getRooms(payload) {
    const category = payload && payload.category ? payload.category : {};
    const id = String((payload && payload.parentBiz) || category.parentBiz || (payload && payload.id) || "");
    const parentId = String(category.biz || (payload && payload.parentId) || "");
    if (!id) _yy_throw("INVALID_ARGS", "id is required", { field: "id" });

    const url = _yy_buildRoomListURL(id, parentId);
    const resp = await Host.http.request({
      url,
      method: "GET",
      headers: __lp_yy_defaultHeaders,
      timeout: 20
    });

    const response = JSON.parse(resp.bodyText || "{}");
    if (response.code !== undefined && _yy_parseCode(response.code, -1) !== 0) {
      _yy_throw("UPSTREAM", `YY room list error: ${response.code} - ${response.message || ""}`, {
        code: String(response.code || ""),
        message: String(response.message || "")
      });
    }

    const sections = response.data || [];
    const rooms = [];
    for (const section of sections) {
      const items = section.data || [];
      for (const item of items) {
        const sid = item && item.sid;
        if (!sid) continue;
        const name = String((item && item.name) || "");
        if (name.includes("预告") || name.includes("活动")) continue;
        rooms.push(_yy_toRoomModel(item));
      }
    }
    return rooms;
  },

  async getPlayback(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _yy_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });

    try {
      const requestedQn = Number((payload && payload.qn) || (payload && payload.gear) || 0);
      const requestedGear = Number.isFinite(requestedQn) && requestedQn > 0 ? requestedQn : undefined;

      let requestedLineSeq;
      const rawLineSeq = payload && payload.lineSeq !== undefined ? payload.lineSeq : (payload && payload.line_seq !== undefined ? payload.line_seq : undefined);
      if (rawLineSeq !== undefined && rawLineSeq !== null && String(rawLineSeq).trim() !== "") {
        const parsedLineSeq = Number(rawLineSeq);
        requestedLineSeq = Number.isFinite(parsedLineSeq) ? parsedLineSeq : undefined;
      }

      const streamInfo = await _yy_get_stream_info_via_ws(roomId, requestedLineSeq, requestedGear);
      const url = String(streamInfo.url || "");
      if (!url) _yy_throw("NOT_FOUND", "No play URL found", { roomId, streamInfo });

      const streamKey = String(streamInfo.stream_key || "");
      const lineSeqRaw = streamInfo.line_seq !== undefined ? String(streamInfo.line_seq) : "-1";
      const streamGear = Number(streamInfo.gear) || 0;
      const qn = streamGear > 0 ? streamGear : (requestedGear || 4);

      let title = "默认";
      if (streamKey.indexOf("_0_10_0") >= 0) title = "高清";
      else if (streamKey.indexOf("_0_11_0") >= 0) title = "流畅";

      return [{
        cdn: streamKey || "默认",
        displayName: streamKey || lineSeqRaw,
        requestContext: { lineSeq: lineSeqRaw },
        qualitys: [{
          roomId: String(roomId),
          title: title,
          qn: qn,
          url: url,
          liveCodeType: "flv",
          liveType: "6",
          userAgent: __lp_yy_playbackUserAgent,
          headers: __lp_yy_playbackHeaders,
          requestContext: { gear: String(qn), qn: String(qn), lineSeq: lineSeqRaw },
          playbackHints: {
            streamFormat: "flv",
            selectionBehavior: "refreshOnSelect"
          }
        }]
      }];
    } catch (error) {
      _yy_throw(
        "UPSTREAM",
        `YY playback request failed: ${error && error.message ? error.message : error}`,
        { roomId, payload: payload || {} }
      );
    }
  },

  async refreshPlayback(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _yy_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });

    const cdn = (payload && payload.cdn) || {};
    const quality = (payload && payload.quality) || {};
    const cdnContext = cdn.requestContext || {};
    const qualityContext = quality.requestContext || {};
    const lineSeq = cdnContext.lineSeq !== undefined ? cdnContext.lineSeq
      : (qualityContext.lineSeq !== undefined ? qualityContext.lineSeq : cdn.cdn);
    const gear = qualityContext.gear !== undefined ? qualityContext.gear
      : (qualityContext.qn !== undefined ? qualityContext.qn : quality.qn);

    const refreshed = await this.getPlayback({ roomId, lineSeq, gear, qn: gear });
    const refreshedQuality = refreshed && refreshed[0] && refreshed[0].qualitys && refreshed[0].qualitys[0];
    if (!refreshedQuality) _yy_throw("NOT_FOUND", "refreshed playback is empty", { roomId });

    return Object.assign({}, quality, refreshedQuality, {
      requestContext: Object.assign({}, qualityContext, refreshedQuality.requestContext || {})
    });
  },

  async getRoomDetail(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _yy_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });

    const url = `https://www.yy.com/api/liveInfoDetail/${encodeURIComponent(String(roomId))}/${encodeURIComponent(String(roomId))}/0`;
    const resp = await Host.http.request({
      url,
      method: "GET",
      timeout: 20
    });

    const response = JSON.parse(resp.bodyText || "{}");
    if (_yy_parseCode(response.resultCode, -1) !== 0 || !response.data) {
      _yy_throw("NOT_FOUND", `YY room detail not found: ${roomId}`, { roomId: String(roomId || "") });
    }

    const info = response.data;
    return {
      userName: String(info.name || ""),
      roomTitle: String(info.desc || ""),
      roomCover: String(info.thumb2 || info.gameThumb || ""),
      userHeadImg: String(info.avatar || ""),
      liveType: "6",
      liveState: "1",
      userId: String(info.uid || "0"),
      roomId: String(info.sid || roomId),
      liveWatchedCount: String(info.users || 0)
    };
  },

  async getLiveState(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _yy_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });
    const latest = await this.getRoomDetail(payload || {});
    return {
      liveState: String((latest && latest.liveState) || "3")
    };
  },

  async search(payload) {
    const keyword = String(payload && payload.keyword ? payload.keyword : "");
    const page = payload && payload.page ? Number(payload.page) : 1;
    if (!keyword) _yy_throw("INVALID_ARGS", "keyword is required", { field: "keyword" });

    const qs = [
      `q=${encodeURIComponent(String(keyword))}`,
      "t=1",
      `n=${encodeURIComponent(String(page))}`
    ].join("&");

    const resp = await Host.http.request({
      url: `https://www.yy.com/apiSearch/doSearch.json?${qs}`,
      method: "GET",
      timeout: 20
    });

    const response = JSON.parse(resp.bodyText || "{}");
    if (!response.success) {
      _yy_throw("UPSTREAM", `YY search error: ${response.message || ""}`, { message: String(response.message || "") });
    }

    const docs = (((response || {}).data || {}).searchResult || {}).response;
    const roomDocs = docs && docs["1"] && docs["1"].docs ? docs["1"].docs : [];
    return roomDocs
      .filter(function (doc) { return !!(doc && doc.sid); })
      .map(function (doc) { return _yy_searchToRoomModel(doc); });
  },

  async resolveShare(payload) {
    const shareCode = String(payload && payload.shareCode ? payload.shareCode : "");
    if (!shareCode) _yy_throw("INVALID_ARGS", "shareCode is required", { field: "shareCode" });
    const roomId = _yy_resolveShare(shareCode);
    return await this.getRoomDetail({ roomId, userId: null });
  },

  async getDanmaku(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _yy_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });
    return await _yy_danmakuDriver().getDanmakuPlan(roomId);
  },

  async createDanmakuSession(payload) {
    return await _yy_danmakuDriver().createDanmakuSession(payload);
  },

  async onDanmakuOpen(payload) {
    return await _yy_danmakuDriver().onDanmakuOpen(payload);
  },

  async onDanmakuFrame(payload) {
    return await _yy_danmakuDriver().onDanmakuFrame(payload);
  },

  async onDanmakuTick(payload) {
    return await _yy_danmakuDriver().onDanmakuTick(payload);
  },

  async destroyDanmakuSession(payload) {
    return await _yy_danmakuDriver().destroyDanmakuSession(payload);
  }
};
