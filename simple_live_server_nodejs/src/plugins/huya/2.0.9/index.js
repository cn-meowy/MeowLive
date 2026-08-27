function _lp_tryDecodePercent(s) {
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

function _huya_throw(code, message, context) {
  if (globalThis.Host && typeof Host.raise === "function") {
    Host.raise(code, message, context || {});
  }
  if (globalThis.Host && typeof Host.makeError === "function") {
    throw Host.makeError(code || "UNKNOWN", message || "", context || {});
  }
  throw new Error(`LP_PLUGIN_ERROR:${JSON.stringify({ code: String(code || "UNKNOWN"), message: String(message || ""), context: context || {} })}`);
}

function _lp_urlQueryAllowedEncode(s) {
  // 近似 iOS 的 urlQueryAllowed：尽量保留 + / =
  return encodeURIComponent(s)
    .replace(/%2B/gi, "+")
    .replace(/%2F/gi, "/")
    .replace(/%3D/gi, "=");
}

function _lp_parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  const parts = String(qs).split("&");
  for (const p of parts) {
    if (!p) continue;
    const idx = p.indexOf("=");
    const k = idx >= 0 ? p.slice(0, idx) : p;
    const v = idx >= 0 ? p.slice(idx + 1) : "";
    out[k] = _lp_tryDecodePercent(v);
  }
  return out;
}

const _huya_wup_base64_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function _huya_bytesToBase64(bytes) {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++] & 0xff;
    const hasB1 = i < bytes.length;
    const b1 = hasB1 ? (bytes[i++] & 0xff) : 0;
    const hasB2 = i < bytes.length;
    const b2 = hasB2 ? (bytes[i++] & 0xff) : 0;

    out += _huya_wup_base64_chars[b0 >> 2];
    out += _huya_wup_base64_chars[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += hasB1 ? _huya_wup_base64_chars[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += hasB2 ? _huya_wup_base64_chars[b2 & 0x3f] : "=";
  }
  return out;
}

function _huya_base64ToBytes(base64) {
  const text = String(base64 || "").replace(/[\r\n\s]/g, "");
  if (!text) return [];

  const map = {};
  for (let i = 0; i < _huya_wup_base64_chars.length; i++) {
    map[_huya_wup_base64_chars[i]] = i;
  }

  const out = [];
  let i = 0;
  while (i < text.length) {
    const c0 = text[i++];
    const c1 = text[i++];
    const c2 = text[i++];
    const c3 = text[i++];

    if (c0 === undefined || c1 === undefined) break;
    const e0 = map[c0];
    const e1 = map[c1];
    if (e0 === undefined || e1 === undefined) break;

    const e2 = c2 === "=" || c2 === undefined ? 0 : map[c2];
    const e3 = c3 === "=" || c3 === undefined ? 0 : map[c3];
    if ((c2 !== "=" && c2 !== undefined && e2 === undefined) || (c3 !== "=" && c3 !== undefined && e3 === undefined)) {
      break;
    }

    const b0 = (e0 << 2) | (e1 >> 4);
    out.push(b0 & 0xff);

    if (c2 !== "=" && c2 !== undefined) {
      const b1 = ((e1 & 0x0f) << 4) | (e2 >> 2);
      out.push(b1 & 0xff);
    }
    if (c3 !== "=" && c3 !== undefined) {
      const b2 = ((e2 & 0x03) << 6) | e3;
      out.push(b2 & 0xff);
    }
  }
  return out;
}

function _HUYA_UserIdEx() {
  this.lUid = 0;
  this.sGuid = "";
  this.sToken = "";
  this.sHuYaUA = "";
  this.sCookie = "";
  this.iTokenType = 0;
  this.sDeviceInfo = "";
  this.sQIMEI = "";
}
_HUYA_UserIdEx.prototype._clone = function () { return new _HUYA_UserIdEx(); };
_HUYA_UserIdEx.prototype._write = function (os, tag, value) { os.writeStruct(tag, value); };
_HUYA_UserIdEx.prototype._read = function (is, tag, def) { return is.readStruct(tag, true, def); };
_HUYA_UserIdEx.prototype.writeTo = function (os) {
  os.writeInt64(0, this.lUid);
  os.writeString(1, this.sGuid);
  os.writeString(2, this.sToken);
  os.writeString(3, this.sHuYaUA);
  os.writeString(4, this.sCookie);
  os.writeInt32(5, this.iTokenType);
  os.writeString(6, this.sDeviceInfo);
  os.writeString(7, this.sQIMEI);
};
_HUYA_UserIdEx.prototype.readFrom = function (is) {
  this.lUid = is.readInt64(0, false, this.lUid);
  this.sGuid = is.readString(1, false, this.sGuid);
  this.sToken = is.readString(2, false, this.sToken);
  this.sHuYaUA = is.readString(3, false, this.sHuYaUA);
  this.sCookie = is.readString(4, false, this.sCookie);
  this.iTokenType = is.readInt32(5, false, this.iTokenType);
  this.sDeviceInfo = is.readString(6, false, this.sDeviceInfo);
  this.sQIMEI = is.readString(7, false, this.sQIMEI);
};

function _HUYA_GetCdnTokenExReq() {
  this.sFlvUrl = "";
  this.sStreamName = "";
  this.iLoopTime = 0;
  this.tId = new _HUYA_UserIdEx();
  this.iAppId = 66;
}
_HUYA_GetCdnTokenExReq.prototype._clone = function () { return new _HUYA_GetCdnTokenExReq(); };
_HUYA_GetCdnTokenExReq.prototype._write = function (os, tag, value) { os.writeStruct(tag, value); };
_HUYA_GetCdnTokenExReq.prototype._read = function (is, tag, def) { return is.readStruct(tag, true, def); };
_HUYA_GetCdnTokenExReq.prototype.writeTo = function (os) {
  os.writeString(0, this.sFlvUrl);
  os.writeString(1, this.sStreamName);
  os.writeInt32(2, this.iLoopTime);
  os.writeStruct(3, this.tId);
  os.writeInt32(4, this.iAppId);
};
_HUYA_GetCdnTokenExReq.prototype.readFrom = function (is) {
  this.sFlvUrl = is.readString(0, false, this.sFlvUrl);
  this.sStreamName = is.readString(1, false, this.sStreamName);
  this.iLoopTime = is.readInt32(2, false, this.iLoopTime);
  this.tId = is.readStruct(3, false, this.tId);
  this.iAppId = is.readInt32(4, false, this.iAppId);
};

function _HUYA_GetCdnTokenExResp() {
  this.sFlvToken = "";
  this.iExpireTime = 0;
}
_HUYA_GetCdnTokenExResp.prototype._clone = function () { return new _HUYA_GetCdnTokenExResp(); };
_HUYA_GetCdnTokenExResp.prototype._write = function (os, tag, value) { os.writeStruct(tag, value); };
_HUYA_GetCdnTokenExResp.prototype._read = function (is, tag, def) { return is.readStruct(tag, true, def); };
_HUYA_GetCdnTokenExResp.prototype.writeTo = function (os) {
  os.writeString(0, this.sFlvToken);
  os.writeInt32(1, this.iExpireTime);
};
_HUYA_GetCdnTokenExResp.prototype.readFrom = function (is) {
  this.sFlvToken = is.readString(0, false, this.sFlvToken);
  this.iExpireTime = is.readInt32(1, false, this.iExpireTime);
};

const _huya_tokenCache = {};

async function _huya_getCdnTokenInfoEx(streamName, flvUrl, cacheScope) {
  const name = String(streamName || "");
  if (!name) return "";

  if (typeof Taf === "undefined" || typeof HUYA === "undefined") {
    _huya_throw("INVALID_RESPONSE", "huya.js runtime not available", { streamName: name });
  }

  const now = Date.now();
  const routeURL = String(flvUrl || "");
  const scope = String(cacheScope || "default");
  const cacheKey = `${scope}|${name}|${routeURL}`;
  const cached = _huya_tokenCache[cacheKey];
  if (cached && cached.token && cached.expiresAt > now) {
    return cached.token;
  }

  const req = new _HUYA_GetCdnTokenExReq();
  req.sFlvUrl = routeURL;
  req.sStreamName = name;
  req.iLoopTime = 0;
  req.iAppId = 66;
  req.tId.lUid = 0;
  req.tId.sGuid = "";
  req.tId.sToken = "";
  req.tId.sHuYaUA = "pc_exe&7000000&official";
  req.tId.sCookie = "";
  req.tId.iTokenType = 0;
  req.tId.sDeviceInfo = "";
  req.tId.sQIMEI = "";

  const wup = new Taf.Wup();
  wup.setVersion(3);
  wup.setServant("liveui");
  wup.setFunc("getCdnTokenInfoEx");
  wup.setRequestId(0);
  wup.writeStruct("tReq", req);

  const encoded = wup.encode();
  const encodedBytes = Array.from(new Uint8Array(encoded.getBuffer()));
  const requestBodyBase64 = _huya_bytesToBase64(encodedBytes);

  const response = await Host.http.request({
    url: "http://wup.huya.com",
    method: "POST",
    headers: {
      "Origin": "https://m.huya.com/",
      "Referer": "https://m.huya.com/",
      "User-Agent": "HYSDK(Windows,30000002)_APP(pc_exe&7030003&official)_SDK(trans&2.29.0.5493)",
      "Content-Type": "application/x-wup"
    },
    bodyBase64: requestBodyBase64,
    timeout: 20
  });

  const responseBase64 = String((response && response.bodyBase64) || "");
  if (!responseBase64) {
    _huya_throw("INVALID_RESPONSE", "empty wup response", { streamName: name });
  }

  const responseBytes = _huya_base64ToBytes(responseBase64);
  if (responseBytes.length === 0) {
    _huya_throw("INVALID_RESPONSE", "invalid wup response bytes", { streamName: name });
  }

  const respWup = new Taf.Wup();
  respWup.decode(new Uint8Array(responseBytes).buffer);
  const code = Number(respWup.readInt32("", 0));
  if (code !== 0) {
    _huya_throw("UPSTREAM", `getCdnTokenInfoEx code=${code}`, { streamName: name, code: String(code) });
  }

  const rsp = respWup.readStruct("tRsp", new _HUYA_GetCdnTokenExResp());
  const token = String((rsp && rsp.sFlvToken) || "");
  if (!token) {
    _huya_throw("INVALID_RESPONSE", "empty sFlvToken", { streamName: name });
  }

  const expire = Number((rsp && rsp.iExpireTime) || 0);
  const safeTTL = expire > 0 ? Math.max(15, Math.min(60, expire - 5)) : 30;
  _huya_tokenCache[cacheKey] = {
    token,
    expiresAt: now + safeTTL * 1000
  };
  return token;
}

async function _huya_getCategorySubList(bussType) {
  const resp = await Host.http.request({
    url: `https://live.cdn.huya.com/liveconfig/game/bussLive?bussType=${encodeURIComponent(String(bussType))}`,
    method: "GET",
    timeout: 20
  });
  const obj = JSON.parse(resp.bodyText || "{}");
  const list = (obj && obj.data) || [];
  return list.map(function (item) {
    const gid = item.gid;
    return {
      id: String(gid),
      parentId: "",
      title: String(item.gameFullName || ""),
      icon: `https://huyaimg.msstatic.com/cdnimage/game/${gid}-MS.jpg`,
      biz: ""
    };
  });
}

async function _huya_getRoomList(gameId, page) {
  const qs = [
    "m=LiveList",
    "do=getLiveListByPage",
    "tagAll=0",
    `gameId=${encodeURIComponent(String(gameId))}`,
    `page=${encodeURIComponent(String(page))}`
  ].join("&");
  const url = `https://www.huya.com/cache.php?${qs}`;
  const resp = await Host.http.request({ url, method: "GET", timeout: 20 });
  const obj = JSON.parse(resp.bodyText || "{}");
  const datas = (obj && obj.data && obj.data.datas) || [];
  return datas.map(function (item) {
    return {
      userName: String(item.nick || ""),
      roomTitle: String(item.introduction || ""),
      roomCover: String(item.screenshot || ""),
      userHeadImg: String(item.avatar180 || ""),
      liveType: "1",
      liveState: "",
      userId: String(item.uid || ""),
      roomId: String(item.profileRoom || ""),
      liveWatchedCount: String(item.totalCount || "")
    };
  });
}

async function _huya_searchRooms(keyword, page) {
  const qs = [
    "m=Search",
    "do=getSearchContent",
    `q=${encodeURIComponent(String(keyword))}`,
    "uid=0",
    "v=4",
    "typ=-5",
    "livestate=0",
    "rows=20",
    `start=${encodeURIComponent(String((page - 1) * 20))}`
  ].join("&");
  const url = `https://search.cdn.huya.com/?${qs}`;
  const resp = await Host.http.request({ url, method: "GET", timeout: 20 });
  const obj = JSON.parse(resp.bodyText || "{}");
  const docs = (obj && obj.response && obj.response["3"] && obj.response["3"].docs) || [];
  return docs.map(function (item) {
    return {
      userName: String(item.game_nick || ""),
      roomTitle: String(item.game_introduction || ""),
      roomCover: String(item.game_screenshot || ""),
      userHeadImg: String(item.game_imgUrl || ""),
      liveType: "1",
      liveState: "1",
      userId: String(item.uid || ""),
      roomId: String(item.room_id || ""),
      liveWatchedCount: String(item.game_total_count || "")
    };
  });
}

function _lp_convertUnicodeEscapes(input) {
  return String(input).replace(/\\u([0-9A-Fa-f]{4})/g, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

function _lp_removeIncludeFunctionValue(input) {
  // 保持 JSON 可解析：将 function(...) { ... } 替换为 ""。
  return String(input).replace(/function\s*\([^}]*\}/g, "\"\"");
}

function _lp_extractHNFGlobalInit(html) {
  const re = /window\.HNF_GLOBAL_INIT\s*=\s*(.*?)<\/script>/s;
  const m = String(html).match(re);
  if (!m) _huya_throw("PARSE", "HNF_GLOBAL_INIT not found");

  let jsonString = m[1];
  jsonString = jsonString.replace(/\n/g, "").trim();
  jsonString = jsonString.replace(/;\s*$/, "");
  jsonString = _lp_removeIncludeFunctionValue(jsonString);
  jsonString = _lp_convertUnicodeEscapes(jsonString);
  return JSON.parse(jsonString);
}

function _lp_extractTopSid(html) {
  const m = String(html).match(/lChannelId\":(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function _lp_isNumericId(roomId) {
  const s = String(roomId || "").trim();
  if (!/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0;
}

function _lp_firstURL(text) {
  const m = String(text || "").match(/https?:\/\/[^\s|]+/);
  if (!m) return "";
  return String(m[0]).replace(/[),，。】]+$/g, "");
}

function _lp_extractRoomIdFromText(text) {
  const s = String(text || "");
  let m = s.match(/(?:huya\.com\/)(\d+)/);
  if (m && m[1]) return m[1];
  m = s.match(/(?:m\.huya\.com\/)(\d+)/);
  if (m && m[1]) return m[1];
  return "";
}

function _lp_extractRoomIdFromHtml(html) {
  const s = String(html || "");
  let m = s.match(/lProfileRoom\":(\d+)/);
  if (m && m[1]) return m[1];
  m = s.match(/\"lProfileRoom\":(\d+)/);
  if (m && m[1]) return m[1];
  m = s.match(/\"lProfileRoom\":(\d+),/);
  if (m && m[1]) return m[1];
  return "";
}

async function _huya_resolveRoomIdFromShareCode(shareCode) {
  const input = String(shareCode || "").trim();
  if (!input) _huya_throw("INVALID_ARGS", "shareCode is empty", { field: "shareCode" });

  if (_lp_isNumericId(input)) return input;

  let roomId = _lp_extractRoomIdFromText(input);
  if (_lp_isNumericId(roomId)) return roomId;

  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/91.0.4472.69";

  const guessedURL = (input.includes("huya.com") && input.indexOf("://") < 0)
    ? ("https://" + input.replace(/^\/\//, ""))
    : "";
  const url = _lp_firstURL(input) || guessedURL;
  if (url) {
    roomId = _lp_extractRoomIdFromText(url);
    if (_lp_isNumericId(roomId)) return roomId;

    const resp = await Host.http.request({
      url,
      method: "GET",
      headers: { "user-agent": ua },
      timeout: 20
    });

    roomId = _lp_extractRoomIdFromText(resp.url || "");
    if (_lp_isNumericId(roomId)) return roomId;

    roomId = _lp_extractRoomIdFromHtml(resp.bodyText || "");
    if (_lp_isNumericId(roomId)) return roomId;
  }

  _huya_throw("NOT_FOUND", "roomId not found", { shareCode: String(shareCode || "") });
}

function _lp_rotl64(t) {
  // Swift 实现：仅对低 32bit 做循环左移 8 位
  const low = (t >>> 0);
  const rotatedLow = (((low << 8) | (low >>> 24)) >>> 0);
  // 如果 t 超过 32bit，这里保持高位不变（一般 uid 不会超过 32bit）
  const high = Math.floor(t / 0x100000000) * 0x100000000;
  return high + rotatedLow;
}

function _lp_buildWupAntiCode(streamName, presenterUid, antiCode) {
  const params = _lp_parseQuery(antiCode);
  if (!params.fm) return antiCode;

  const ctype = params.ctype || "huya_pc_exe";
  const platformByCtype = {
    huya_pc_exe: 0,
    huya_adr: 2,
    huya_ios: 3,
    tv_huya_nftv: 10,
    huya_webh5: 100,
    huya_live: 100,
    tars_mp: 102,
    tars_mobile: 103,
    huya_liveshareh5: 104
  };
  const sourcePlatform = Number(params.t);
  const platformId = params.t !== undefined && params.t !== "" && Number.isFinite(sourcePlatform)
    ? sourcePlatform
    : (platformByCtype[ctype] !== undefined ? platformByCtype[ctype] : 100);
  const isWap = platformId === 103;

  let uid = Number(presenterUid || 0);
  if (!Number.isFinite(uid) || uid <= 0) {
    uid = Math.random() > 0.5
      ? Number(`1234${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`)
      : Number(`140000${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`);
  }
  const timestamp = Date.now();
  const seqId = uid + timestamp;
  const secretHash = Host.crypto.md5(`${seqId}|${ctype}|${platformId}`);
  const convertUid = _lp_rotl64(uid);
  const calcUid = isWap ? uid : convertUid;

  const fmDecoded = Host.crypto.base64Decode(params.fm);
  const secretPrefix = String(fmDecoded).split("_")[0] || "";
  const nowSeconds = Math.floor(timestamp / 1000);
  let wsTime = String(params.wsTime || "");
  const wsTimeSeconds = parseInt(wsTime, 16);
  if (!Number.isFinite(wsTimeSeconds) || wsTimeSeconds - nowSeconds < 20 * 60) {
    wsTime = (nowSeconds + 24 * 60 * 60).toString(16);
  }
  const wsSecret = Host.crypto.md5(`${secretPrefix}_${calcUid}_${streamName}_${secretHash}_${wsTime}`);

  const result = [
    `wsSecret=${wsSecret}`,
    `wsTime=${wsTime}`,
    `seqid=${seqId}`,
    `ctype=${ctype}`,
    `ver=1`,
    `fs=${params.fs || ""}`,
    `fm=${encodeURIComponent(params.fm)}`,
    `t=${platformId}`
  ];
  if (isWap) {
    const ct = Math.floor((parseInt(wsTime, 16) + Math.random()) * 1000);
    const uuid = Math.floor(((ct % 10000000000 + Math.random()) * 1000) % 0xffffffff);
    result.push(`uid=${uid}`, `uuid=${uuid}`);
  } else {
    result.push(`u=${convertUid}`);
  }
  return result.join("&");
}

function _lp_buildFlvAntiCode(streamName, presenterUid, antiCode) {
  return _lp_buildWupAntiCode(streamName, presenterUid, antiCode);
}

function _lp_routeTokenScope(protocol, stream) {
  const cdn = String((stream && stream.sCdnType) || "unknown").toUpperCase();
  return `${String(protocol || "unknown").toLowerCase()}:${cdn}`;
}

async function _lp_getPlayURL(stream, presenterUid, bitRate) {
  let antiCodeSource = "";
  try {
    antiCodeSource = await _huya_getCdnTokenInfoEx(
      stream.sStreamName,
      stream.sFlvUrl,
      _lp_routeTokenScope("flv", stream)
    );
  } catch (_) {
    antiCodeSource = String(stream.sFlvAntiCode || "");
  }
  if (!antiCodeSource) {
    return "";
  }
  const antiCode = _lp_buildFlvAntiCode(stream.sStreamName, presenterUid, antiCodeSource);
  let url = `${stream.sFlvUrl}/${stream.sStreamName}.flv?${antiCode}&codec=264`;
  if (bitRate > 0) {
    url += `&ratio=${bitRate}`;
  }
  return url;
}

const __huya_sharedGlobalKey = "__lp_plugin_huya_1_0_4_shared";
const __huya_mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/91.0.4472.69";
const __huya_danmakuWebSocketURL = "wss://cdnws.api.huya.com";

async function _huya_getDanmakuContext(roomId) {
  const id = String(roomId || "");
  if (!id) _huya_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });

  const resp = await Host.http.request({
    url: `https://m.huya.com/${id}`,
    method: "GET",
    headers: { "user-agent": __huya_mobileUA },
    timeout: 20
  });
  const html = resp.bodyText || "";

  const data = _lp_extractHNFGlobalInit(html);
  const liveInfo = data && data.roomInfo && data.roomInfo.tLiveInfo;
  const streamInfo = liveInfo && liveInfo.tLiveStreamInfo && liveInfo.tLiveStreamInfo.vStreamInfo;
  const firstStream = streamInfo && streamInfo.value ? streamInfo.value[0] : null;
  if (!liveInfo || !firstStream) {
    _huya_throw("INVALID_RESPONSE", "missing stream info", { roomId: id });
  }

  return {
    roomId: id,
    lYyid: String(liveInfo.lYyid || ""),
    lChannelId: String(firstStream.lChannelId || ""),
    lSubChannelId: String(firstStream.lSubChannelId || "")
  };
}

function _huya_danmakuDriver() {
  const driver = globalThis.__huyaDanmakuDriver;
  if (!driver) {
    _huya_throw("UNSUPPORTED", "huya danmaku driver is unavailable", {});
  }
  return driver;
}

globalThis[__huya_sharedGlobalKey] = {
  throwError: _huya_throw,
  getDanmakuContext: _huya_getDanmakuContext,
  mobileUA: __huya_mobileUA,
  danmakuWebSocketURL: __huya_danmakuWebSocketURL
};

globalThis.LiveParsePlugin = {
  apiVersion: 1,
  async resolveShare(payload) {
    const shareCode = String(payload && payload.shareCode ? payload.shareCode : "");
    if (!shareCode) _huya_throw("INVALID_ARGS", "shareCode is required", { field: "shareCode" });
    const roomId = await _huya_resolveRoomIdFromShareCode(shareCode);
    return await this.getRoomDetail({ roomId, userId: null });
  },
  async getCategories(payload) {
    const main = [
      { id: "1", title: "网游" },
      { id: "2", title: "单机" },
      { id: "8", title: "娱乐" },
      { id: "3", title: "手游" }
    ];
    const out = [];
    for (const item of main) {
      const subList = await _huya_getCategorySubList(item.id);
      out.push({ id: item.id, title: item.title, icon: "", biz: "", subList });
    }
    return out;
  },

  async getRooms(payload) {
    const id = String(payload && payload.id ? payload.id : "");
    const page = (payload && payload.page) ? Number(payload.page) : 1;
    if (!id) _huya_throw("INVALID_ARGS", "id is required", { field: "id" });
    return await _huya_getRoomList(id, page);
  },

  async search(payload) {
    const keyword = String(payload && payload.keyword ? payload.keyword : "");
    const page = (payload && payload.page) ? Number(payload.page) : 1;
    if (!keyword) _huya_throw("INVALID_ARGS", "keyword is required", { field: "keyword" });
    return await _huya_searchRooms(keyword, page);
  },

  async getRoomDetail(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _huya_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });

    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/91.0.4472.69";
    const resp = await Host.http.request({
      url: `https://m.huya.com/${roomId}`,
      method: "GET",
      headers: { "user-agent": ua },
      timeout: 20
    });
    const html = resp.bodyText || "";
    const data = _lp_extractHNFGlobalInit(html);

    const roomInfo = data && data.roomInfo;
    const eLiveStatus = roomInfo ? roomInfo.eLiveStatus : 0;

    let liveState = "0";
    let liveInfo = roomInfo ? roomInfo.tRecentLive : null;

    if (eLiveStatus === 2) {
      liveState = "1";
      liveInfo = roomInfo.tLiveInfo;
    } else if (eLiveStatus === 3) {
      if (roomInfo && roomInfo.tReplayInfo) {
        liveState = "2";
        liveInfo = roomInfo.tReplayInfo;
      } else {
        liveState = "0";
        liveInfo = roomInfo ? roomInfo.tRecentLive : null;
      }
    } else {
      liveState = "0";
      liveInfo = roomInfo ? roomInfo.tRecentLive : null;
    }

    if (!liveInfo) {
      _huya_throw("INVALID_RESPONSE", "missing liveInfo", { roomId: String(roomId || "") });
    }

    // liveInfo 结构与 Swift 侧 HuyaRoomTLiveInfo 对齐
    return {
      userName: String(liveInfo.sNick || ""),
      roomTitle: String(liveInfo.sIntroduction || ""),
      roomCover: String(liveInfo.sScreenshot || ""),
      userHeadImg: String(liveInfo.sAvatar180 || ""),
      liveType: "1",
      liveState,
      userId: String(liveInfo.lYyid || ""),
      roomId,
      liveWatchedCount: String(liveInfo.lTotalCount || "")
    };
  },

  async getLiveState(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _huya_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });

    const info = await this.getRoomDetail({
      roomId,
      userId: payload && payload.userId ? payload.userId : null
    });

    return {
      liveState: String(info && info.liveState ? info.liveState : "3")
    };
  },

  async getDanmaku(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _huya_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });
    return await _huya_danmakuDriver().getDanmakuPlan(roomId);
  },

  async createDanmakuSession(payload) {
    return await _huya_danmakuDriver().createDanmakuSession(payload);
  },

  async onDanmakuOpen(payload) {
    return await _huya_danmakuDriver().onDanmakuOpen(payload);
  },

  async onDanmakuFrame(payload) {
    return await _huya_danmakuDriver().onDanmakuFrame(payload);
  },

  async onDanmakuTick(payload) {
    return await _huya_danmakuDriver().onDanmakuTick(payload);
  },

  async destroyDanmakuSession(payload) {
    return await _huya_danmakuDriver().destroyDanmakuSession(payload);
  },
  async getPlayback(payload) {
    const roomId = String(payload && payload.roomId ? payload.roomId : "");
    if (!roomId) _huya_throw("INVALID_ARGS", "roomId is required", { field: "roomId" });
    const playbackUA = "HYSDK(Windows,30000002)_APP(pc_exe&7030003&official)_SDK(trans&2.29.0.5493)";

    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1";
    const resp = await Host.http.request({
      url: `https://m.huya.com/${roomId}`,
      method: "GET",
      headers: { "user-agent": ua },
      timeout: 20
    });
    const html = resp.bodyText || "";

    const data = _lp_extractHNFGlobalInit(html);
    const topSid = _lp_extractTopSid(html);
    const results = [];

    const streamInfo = data && data.roomInfo && data.roomInfo.tLiveInfo && data.roomInfo.tLiveInfo.tLiveStreamInfo;
    if (streamInfo && streamInfo.vStreamInfo && streamInfo.vBitRateInfo) {
      const defaultCdn = String(streamInfo.sDefaultLiveStreamLine || "");
      const streams = (streamInfo.vStreamInfo.value || []).map(function (stream, index) {
        return { stream, index };
      }).sort(function (a, b) {
        const aDefault = String((a.stream && a.stream.sCdnType) || "") === defaultCdn ? 1 : 0;
        const bDefault = String((b.stream && b.stream.sCdnType) || "") === defaultCdn ? 1 : 0;
        if (aDefault !== bDefault) return bDefault - aDefault;

        const aPriority = Number((a.stream && a.stream.iMobilePriorityRate) || -1);
        const bPriority = Number((b.stream && b.stream.iMobilePriorityRate) || -1);
        if (aPriority !== bPriority) return bPriority - aPriority;
        return a.index - b.index;
      }).map(function (item) {
        return item.stream;
      });
      const bitRates = streamInfo.vBitRateInfo.value || [];

      for (const s of streams) {
        if (!s || !s.sFlvUrl) continue;
        const signerUid = Number(s.lPresenterUid || topSid || 0);
        const qualities = [];
        for (const br of bitRates) {
          if (!br || (br.sDisplayName || "").includes("HDR")) continue;
          const bitRate = br.iBitRate || 0;
          const title = br.sDisplayName || "";

          const flvURL = await _lp_getPlayURL(s, signerUid, bitRate);
          if (flvURL) {
            qualities.push({
              roomId,
              title,
              qn: bitRate,
              url: flvURL,
              liveCodeType: "flv",
              liveType: "1",
              userAgent: playbackUA,
              headers: { "user-agent": playbackUA },
              playbackHints: { streamFormat: "flv" }
            });
          }

        }
        if (qualities.length > 0) {
          results.push({ cdn: `线路 ${s.sCdnType}`, qualitys: qualities });
        }
      }

      if (results.length > 0) {
        return results;
      }
    }

    const replay = data && data.roomInfo && data.roomInfo.tReplayInfo && data.roomInfo.tReplayInfo.tReplayVideoInfo;
    if (replay && replay.sHlsUrl) {
      return [{
        cdn: "回放",
        qualitys: [{
          roomId,
          title: "回放",
          qn: replay.iVideoSyncTime || 0,
          url: replay.sHlsUrl,
          liveCodeType: "m3u8",
          liveType: "1",
          userAgent: playbackUA,
          headers: { "user-agent": playbackUA },
          playbackHints: {
            streamFormat: "hlsVod",
            requiresCustomSegmentLoader: true,
            startPositionSeconds: Number(replay.iVideoSyncTime || 0)
          }
        }]
      }];
    }

    _huya_throw("INVALID_RESPONSE", "empty result", { roomId: String(roomId || "") });
  }
};
