(function () {
const __bigo_danmakuSessions = {};
const __bigo_sharedGlobalKey = "__lp_plugin_bigo_1_0_3_shared";
const __bigo_wsURL = "wss://wss.bigolive.tv/live/official/web";
const __bigo_defaultHeartbeatMs = 10000;
const __bigo_events = {
  ChallengeKey: "256",
  Challenge: "79108",
  Login: "512279",
  LoginRes: "512535",
  Ping: "791",
  EnterRoom: "1304",
  EnterRoomRes: "1560",
  PullChatRoomUser: "10776",
  NormalText: "2584"
};

function _bigo_shared() {
  const shared = globalThis[__bigo_sharedGlobalKey];
  if (!shared) {
    throw new Error("LP_PLUGIN_ERROR:{\"code\":\"UNSUPPORTED\",\"message\":\"bigo shared helpers are unavailable\",\"context\":{}}");
  }
  return shared;
}

function _bigo_throw(code, message, context) {
  const shared = globalThis[__bigo_sharedGlobalKey];
  if (shared && typeof shared.throwError === "function") {
    return shared.throwError(code, message, context || {});
  }
  throw new Error(`LP_PLUGIN_ERROR:${JSON.stringify({ code: String(code || "UNKNOWN"), message: String(message || ""), context: context || {} })}`);
}

function _bigo_str(value) {
  return value === undefined || value === null ? "" : String(value);
}

function _bigo_int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function _bigo_parseJSON(text, fallback) {
  try {
    return JSON.parse(_bigo_str(text));
  } catch (_) {
    return fallback;
  }
}

function _bigo_toUri(value) {
  const parts = _bigo_str(value).split("|");
  const high = _bigo_int(parts[0], 0);
  const low = _bigo_int(parts[1], 0);
  return String((high << 8) | low);
}

function _bigo_textWrite(text) {
  return {
    kind: "text",
    text: _bigo_str(text)
  };
}

function _bigo_wsPacket(prefix, payload) {
  return _bigo_textWrite(_bigo_str(prefix) + JSON.stringify(payload || {}));
}

function _bigo_timer(intervalMs) {
  return {
    mode: "heartbeat",
    intervalMs: Math.max(1000, Number(intervalMs) || __bigo_defaultHeartbeatMs)
  };
}

function _bigo_timerOff() {
  return { mode: "off" };
}

function _bigo_session(connectionId) {
  const key = _bigo_str(connectionId);
  const session = __bigo_danmakuSessions[key];
  if (!session) {
    _bigo_throw("INVALID_STATE", "danmaku session not found", { connectionId: key });
  }
  return session;
}

function _bigo_parseFrame(text) {
  const raw = _bigo_str(text);
  const idx = raw.indexOf("{");
  if (idx < 0) return { code: raw.trim(), data: null };
  return {
    code: raw.slice(0, idx).trim(),
    data: _bigo_parseJSON(raw.slice(idx), null)
  };
}

function _bigo_safeHex(num) {
  const text = (num >>> 0).toString(16);
  return "00000000".slice(text.length) + text;
}

function _bigo_add32(a, b) {
  return (a + b) & 0xffffffff;
}

function _bigo_rol(num, cnt) {
  return (num << cnt) | (num >>> (32 - cnt));
}

function _bigo_md5cmn(q, a, b, x, s, t) {
  return _bigo_add32(_bigo_rol(_bigo_add32(_bigo_add32(a, q), _bigo_add32(x, t)), s), b);
}

function _bigo_md5ff(a, b, c, d, x, s, t) {
  return _bigo_md5cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function _bigo_md5gg(a, b, c, d, x, s, t) {
  return _bigo_md5cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function _bigo_md5hh(a, b, c, d, x, s, t) {
  return _bigo_md5cmn(b ^ c ^ d, a, b, x, s, t);
}

function _bigo_md5ii(a, b, c, d, x, s, t) {
  return _bigo_md5cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function _bigo_utf8Bytes(input) {
  const text = _bigo_str(input);
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function _bigo_md5(input) {
  const bytes = _bigo_utf8Bytes(input);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let i = 0; i < 8; i += 1) bytes.push(Math.floor(bitLen / Math.pow(2, 8 * i)) & 0xff);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let i = 0; i < bytes.length; i += 64) {
    const x = [];
    for (let j = 0; j < 16; j += 1) {
      const k = i + j * 4;
      x[j] = bytes[k] | (bytes[k + 1] << 8) | (bytes[k + 2] << 16) | (bytes[k + 3] << 24);
    }
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    a = _bigo_md5ff(a, b, c, d, x[0], 7, -680876936);
    d = _bigo_md5ff(d, a, b, c, x[1], 12, -389564586);
    c = _bigo_md5ff(c, d, a, b, x[2], 17, 606105819);
    b = _bigo_md5ff(b, c, d, a, x[3], 22, -1044525330);
    a = _bigo_md5ff(a, b, c, d, x[4], 7, -176418897);
    d = _bigo_md5ff(d, a, b, c, x[5], 12, 1200080426);
    c = _bigo_md5ff(c, d, a, b, x[6], 17, -1473231341);
    b = _bigo_md5ff(b, c, d, a, x[7], 22, -45705983);
    a = _bigo_md5ff(a, b, c, d, x[8], 7, 1770035416);
    d = _bigo_md5ff(d, a, b, c, x[9], 12, -1958414417);
    c = _bigo_md5ff(c, d, a, b, x[10], 17, -42063);
    b = _bigo_md5ff(b, c, d, a, x[11], 22, -1990404162);
    a = _bigo_md5ff(a, b, c, d, x[12], 7, 1804603682);
    d = _bigo_md5ff(d, a, b, c, x[13], 12, -40341101);
    c = _bigo_md5ff(c, d, a, b, x[14], 17, -1502002290);
    b = _bigo_md5ff(b, c, d, a, x[15], 22, 1236535329);

    a = _bigo_md5gg(a, b, c, d, x[1], 5, -165796510);
    d = _bigo_md5gg(d, a, b, c, x[6], 9, -1069501632);
    c = _bigo_md5gg(c, d, a, b, x[11], 14, 643717713);
    b = _bigo_md5gg(b, c, d, a, x[0], 20, -373897302);
    a = _bigo_md5gg(a, b, c, d, x[5], 5, -701558691);
    d = _bigo_md5gg(d, a, b, c, x[10], 9, 38016083);
    c = _bigo_md5gg(c, d, a, b, x[15], 14, -660478335);
    b = _bigo_md5gg(b, c, d, a, x[4], 20, -405537848);
    a = _bigo_md5gg(a, b, c, d, x[9], 5, 568446438);
    d = _bigo_md5gg(d, a, b, c, x[14], 9, -1019803690);
    c = _bigo_md5gg(c, d, a, b, x[3], 14, -187363961);
    b = _bigo_md5gg(b, c, d, a, x[8], 20, 1163531501);
    a = _bigo_md5gg(a, b, c, d, x[13], 5, -1444681467);
    d = _bigo_md5gg(d, a, b, c, x[2], 9, -51403784);
    c = _bigo_md5gg(c, d, a, b, x[7], 14, 1735328473);
    b = _bigo_md5gg(b, c, d, a, x[12], 20, -1926607734);

    a = _bigo_md5hh(a, b, c, d, x[5], 4, -378558);
    d = _bigo_md5hh(d, a, b, c, x[8], 11, -2022574463);
    c = _bigo_md5hh(c, d, a, b, x[11], 16, 1839030562);
    b = _bigo_md5hh(b, c, d, a, x[14], 23, -35309556);
    a = _bigo_md5hh(a, b, c, d, x[1], 4, -1530992060);
    d = _bigo_md5hh(d, a, b, c, x[4], 11, 1272893353);
    c = _bigo_md5hh(c, d, a, b, x[7], 16, -155497632);
    b = _bigo_md5hh(b, c, d, a, x[10], 23, -1094730640);
    a = _bigo_md5hh(a, b, c, d, x[13], 4, 681279174);
    d = _bigo_md5hh(d, a, b, c, x[0], 11, -358537222);
    c = _bigo_md5hh(c, d, a, b, x[3], 16, -722521979);
    b = _bigo_md5hh(b, c, d, a, x[6], 23, 76029189);
    a = _bigo_md5hh(a, b, c, d, x[9], 4, -640364487);
    d = _bigo_md5hh(d, a, b, c, x[12], 11, -421815835);
    c = _bigo_md5hh(c, d, a, b, x[15], 16, 530742520);
    b = _bigo_md5hh(b, c, d, a, x[2], 23, -995338651);

    a = _bigo_md5ii(a, b, c, d, x[0], 6, -198630844);
    d = _bigo_md5ii(d, a, b, c, x[7], 10, 1126891415);
    c = _bigo_md5ii(c, d, a, b, x[14], 15, -1416354905);
    b = _bigo_md5ii(b, c, d, a, x[5], 21, -57434055);
    a = _bigo_md5ii(a, b, c, d, x[12], 6, 1700485571);
    d = _bigo_md5ii(d, a, b, c, x[3], 10, -1894986606);
    c = _bigo_md5ii(c, d, a, b, x[10], 15, -1051523);
    b = _bigo_md5ii(b, c, d, a, x[1], 21, -2054922799);
    a = _bigo_md5ii(a, b, c, d, x[8], 6, 1873313359);
    d = _bigo_md5ii(d, a, b, c, x[15], 10, -30611744);
    c = _bigo_md5ii(c, d, a, b, x[6], 15, -1560198380);
    b = _bigo_md5ii(b, c, d, a, x[13], 21, 1309151649);
    a = _bigo_md5ii(a, b, c, d, x[4], 6, -145523070);
    d = _bigo_md5ii(d, a, b, c, x[11], 10, -1120210379);
    c = _bigo_md5ii(c, d, a, b, x[2], 15, 718787259);
    b = _bigo_md5ii(b, c, d, a, x[9], 21, -343485551);

    a = _bigo_add32(a, olda);
    b = _bigo_add32(b, oldb);
    c = _bigo_add32(c, oldc);
    d = _bigo_add32(d, oldd);
  }

  function wordHex(word) {
    let out = "";
    for (let i = 0; i < 4; i += 1) out += _bigo_safeHex((word >>> (i * 8)) & 0xff).slice(-2);
    return out;
  }
  return wordHex(a) + wordHex(b) + wordHex(c) + wordHex(d);
}

function _bigo_challengeKey(challenge) {
  const payload = {
    appId: "60",
    osType: "4",
    clientVersion: "5",
    timeStamp: Math.floor((new Date()).getTime() / 1000).toString(),
    nonce: "1",
    reservedForSecurity: "1",
    appSign: "1",
    redundancy: "1",
    sign: ""
  };
  const signBase = [
    payload.appId,
    payload.osType,
    payload.clientVersion,
    payload.timeStamp,
    payload.nonce,
    payload.reservedForSecurity,
    payload.appSign,
    payload.redundancy,
    _bigo_str(challenge).slice(-8)
  ].join("#");
  payload.sign = _bigo_md5(signBase);
  return payload;
}

function _bigo_loginPayload(session) {
  return {
    uid: session.wsUserId,
    cookie: _bigo_str(session.uidToken).replace("###VER2", ""),
    secret: "0",
    userName: session.wsUserName || "0",
    deviceId: session.deviceId,
    userFlag: "0",
    status: "0",
    password: "0",
    sdkVersion: "0",
    displayType: "0",
    pbVersion: "0",
    lang: "cn",
    loginLevel: "0",
    clientVersionCode: "0",
    clientType: "7",
    clientOsVer: "0",
    netConf: {
      clientIp: session.clientIp || "0",
      proxySwitch: "0",
      proxyTimestamp: "0",
      mcc: "0",
      mnc: "0",
      countryCode: "CN"
    }
  };
}

function _bigo_enterRoomPayload(session) {
  return {
    secretKey: session.password || "0",
    seqId: String((new Date()).getTime()),
    roomId: session.roomId,
    reserver: "1",
    clientVersion: "0",
    clientType: "7",
    version: "15",
    deviceid: session.deviceId,
    other: []
  };
}

function _bigo_pullUsersPayload(session) {
  return {
    uid: session.uid,
    seqId: String((new Date()).getTime()),
    roomid: session.roomId,
    contribution: "0",
    enterTimestamp: "0",
    number: "0",
    ident: "0",
    userGrade: "0",
    version: "0",
    lastUserBeanGrade: "0",
    lastUserId: "0",
    others: []
  };
}

function _bigo_pingPayload() {
  return {
    status: "0",
    seqid: String((new Date()).getTime()),
    flag: "0",
    roomId: "0",
    ownerStatus: "0",
    micUid: "0"
  };
}

const __bigo_base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function _bigo_base64Bytes(input) {
  const clean = _bigo_str(input).replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean.charAt(i);
    if (ch === "=") break;
    const val = __bigo_base64Chars.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function _bigo_utf8Decode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length;) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
    } else if (b1 >= 0xc0 && b1 < 0xe0 && i < bytes.length) {
      const b2 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if (b1 >= 0xe0 && b1 < 0xf0 && i + 1 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else if (b1 >= 0xf0 && b1 < 0xf8 && i + 2 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      let code = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += "�";
    }
  }
  return out;
}

function _bigo_decodeContent(content) {
  const decoded = _bigo_utf8Decode(_bigo_base64Bytes(content)).trim();
  return _bigo_parseJSON(decoded, null);
}

function _bigo_firstText(values) {
  for (let i = 0; i < (values || []).length; i += 1) {
    const value = _bigo_str(values[i]);
    if (value.trim()) return value;
  }
  return "";
}

function _bigo_parseColor(value) {
  const raw = _bigo_str(value).trim();
  if (!raw) return 0xffffff;
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return parseInt(raw.slice(1), 16) >>> 0;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return parseInt(raw, 16) >>> 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n >>> 0 : 0xffffff;
}

function _bigo_extractChatMessage(session, data) {
  if (!data || typeof data !== "object") return null;
  const roomId = _bigo_str(data.room_id || data.roomId || data.gid);
  if (roomId && session.roomId && roomId !== session.roomId) return null;
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
  const decoded = _bigo_decodeContent(payload.content);
  if (!decoded || typeof decoded !== "object") return null;
  const text = _bigo_firstText([decoded.m, decoded.msg, decoded.text, decoded.content]);
  if (!text.trim()) return null;
  const nickname = _bigo_firstText([
    decoded.n,
    decoded.nick,
    decoded.nickname,
    decoded.name,
    payload.nick_name,
    payload.nickname,
    payload.name,
    payload.uid,
    data.from_uid
  ]);
  return {
    nickname: nickname,
    text: text,
    color: _bigo_parseColor(decoded.c || decoded.color || payload.color)
  };
}

const __bigoDanmakuDriver = {
  async getDanmakuPlan(payload) {
    const shared = _bigo_shared();
    const runtimePayload = payload && typeof payload === "object" ? payload : { roomId: payload };
    const bigoId = typeof shared.extractBigoId === "function"
      ? shared.extractBigoId(runtimePayload.roomId || runtimePayload.userId || runtimePayload.id || runtimePayload.url || runtimePayload.shareCode)
      : _bigo_str(runtimePayload.roomId || runtimePayload.userId || runtimePayload.id).trim();
    if (!bigoId) _bigo_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });

    const roomInfo = await shared.fetchInternalStudioInfo(bigoId);
    const actualRoomId = _bigo_str(roomInfo && roomInfo.roomId);
    const uid = _bigo_str(roomInfo && roomInfo.uid);
    if (String(roomInfo && roomInfo.alive) !== "1" || !actualRoomId || !uid) {
      _bigo_throw("OFFLINE", "BIGO room is offline or danmaku room id is unavailable", { bigoId: bigoId, roomId: actualRoomId });
    }

    const wsConfig = await shared.fetchWebSocketLink("");
    const wsUserId = _bigo_str(wsConfig && wsConfig.userId);
    const uidToken = _bigo_str(wsConfig && wsConfig.uidToken);
    const deviceId = _bigo_str(wsConfig && wsConfig.deviceId);
    if (!wsUserId || !uidToken || !deviceId) {
      _bigo_throw("INVALID_RESPONSE", "BIGO websocket credentials are invalid", { bigoId: bigoId });
    }

    const siteBase = _bigo_str(shared.siteBase || "https://www.bigo.tv");
    const wsURL = _bigo_str(shared.wsURL || __bigo_wsURL);
    return {
      args: {
        bigoId: bigoId,
        roomId: actualRoomId,
        uid: uid,
        sid: _bigo_str(roomInfo && roomInfo.sid),
        wsUserId: wsUserId,
        wsUserName: _bigo_str(wsConfig && wsConfig.userName) || "0",
        uidToken: uidToken,
        deviceId: deviceId,
        clientIp: _bigo_str(wsConfig && wsConfig.clientIp),
        password: _bigo_str(runtimePayload.password || "0"),
        url: wsURL,
        heartbeat_interval_ms: String(__bigo_defaultHeartbeatMs)
      },
      headers: {
        Origin: siteBase,
        Referer: siteBase + "/" + encodeURIComponent(bigoId),
        "User-Agent": _bigo_str(shared.userAgent || ""),
        "Accept-Language": "en-US,en;q=0.9"
      },
      transport: {
        kind: "websocket",
        url: wsURL,
        frameType: "text"
      },
      runtime: {
        driver: "plugin_js_v1",
        protocolId: "bigo_official_ws_text",
        protocolVersion: "1"
      }
    };
  },

  async createDanmakuSession(payload) {
    const connectionId = _bigo_str(payload && payload.connectionId);
    if (!connectionId) _bigo_throw("INVALID_ARGS", "connectionId is required", { field: "connectionId" });
    const args = payload && payload.args ? payload.args : {};
    const roomId = _bigo_str(args.roomId);
    const uid = _bigo_str(args.uid);
    const wsUserId = _bigo_str(args.wsUserId);
    const uidToken = _bigo_str(args.uidToken);
    const deviceId = _bigo_str(args.deviceId);
    if (!roomId) _bigo_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });
    if (!uid) _bigo_throw("INVALID_ARGS", "uid is required", { field: "uid" });
    if (!wsUserId || !uidToken || !deviceId) _bigo_throw("INVALID_ARGS", "websocket credentials are required", { field: "args" });

    __bigo_danmakuSessions[connectionId] = {
      connectionId: connectionId,
      bigoId: _bigo_str(args.bigoId),
      roomId: roomId,
      uid: uid,
      wsUserId: wsUserId,
      wsUserName: _bigo_str(args.wsUserName || "0"),
      uidToken: uidToken,
      deviceId: deviceId,
      clientIp: _bigo_str(args.clientIp),
      password: _bigo_str(args.password || "0"),
      heartbeatIntervalMs: Math.max(1000, Number(args.heartbeat_interval_ms) || __bigo_defaultHeartbeatMs)
    };

    return { ok: true, timer: _bigo_timerOff() };
  },

  async onDanmakuOpen(payload) {
    _bigo_session(payload && payload.connectionId);
    return {
      writes: [],
      timer: _bigo_timerOff()
    };
  },

  async onDanmakuFrame(payload) {
    const session = _bigo_session(payload && payload.connectionId);
    const parsed = _bigo_parseFrame(payload && payload.text);
    const writes = [];
    const messages = [];

    if (parsed.code === __bigo_events.ChallengeKey && parsed.data && parsed.data.challenge) {
      writes.push(_bigo_wsPacket(__bigo_events.Challenge, _bigo_challengeKey(parsed.data.challenge)));
      writes.push(_bigo_wsPacket(__bigo_events.Login, _bigo_loginPayload(session)));
    } else if (parsed.code === __bigo_events.LoginRes && parsed.data && _bigo_str(parsed.data.res) === "200") {
      writes.push(_bigo_wsPacket(__bigo_events.EnterRoom, _bigo_enterRoomPayload(session)));
    } else if (parsed.code === __bigo_events.EnterRoomRes && parsed.data && _bigo_str(parsed.data.resCode) === "200") {
      writes.push(_bigo_wsPacket(__bigo_events.PullChatRoomUser, _bigo_pullUsersPayload(session)));
    } else if (parsed.code === __bigo_events.NormalText) {
      const message = _bigo_extractChatMessage(session, parsed.data);
      if (message) messages.push(message);
    }

    return {
      messages: messages,
      writes: writes,
      timer: _bigo_timer(session.heartbeatIntervalMs)
    };
  },

  async onDanmakuTick(payload) {
    const session = _bigo_session(payload && payload.connectionId);
    return {
      writes: [_bigo_wsPacket(__bigo_events.Ping, _bigo_pingPayload())],
      timer: _bigo_timer(session.heartbeatIntervalMs)
    };
  },

  async destroyDanmakuSession(payload) {
    const connectionId = _bigo_str(payload && payload.connectionId);
    if (connectionId) delete __bigo_danmakuSessions[connectionId];
    return { ok: true };
  }
};

globalThis.__bigoDanmakuDriver = __bigoDanmakuDriver;
})();
