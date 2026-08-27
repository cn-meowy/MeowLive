const _bigo_liveType = "16";
const _bigo_platformId = "bigo";
const _bigo_apiBase = "https://ta.bigo.tv/official_website";
const _bigo_siteBase = "https://www.bigo.tv";
const _bigo_defaultPageSize = 20;
const _bigo_defaultUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const _bigo_mobileUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const _bigo_playbackUserAgent = "libmpv";
const _bigo_danmakuSharedGlobalKey = "__lp_plugin_bigo_1_0_3_shared";
const _bigo_danmakuWebSocketURL = "wss://wss.bigolive.tv/live/official/web";
const _bigo_playbackHeaders = {
  Referer: "https://www.bigo.tv/",
  Origin: "https://www.bigo.tv"
};
const _bigo_logoURL = "https://static-web.hzmk.site/as/bigo-static/www.bigo.tv/img/logo_icon2.png";
const _bigo_fallbackShowCategories = [
  { id: "show:ALL", parentId: "bigo-show", title: "热门秀场", icon: _bigo_logoURL, biz: "" },
  { id: "show:IN", parentId: "bigo-show", title: "India", icon: "", biz: JSON.stringify({ region: "AS", count: "" }) },
  { id: "show:ID", parentId: "bigo-show", title: "Indonesia", icon: "", biz: JSON.stringify({ region: "AS", count: "" }) },
  { id: "show:PH", parentId: "bigo-show", title: "Philippines", icon: "", biz: JSON.stringify({ region: "AS", count: "" }) },
  { id: "show:TH", parentId: "bigo-show", title: "Thailand", icon: "", biz: JSON.stringify({ region: "AS", count: "" }) },
  { id: "show:CN", parentId: "bigo-show", title: "China", icon: "", biz: JSON.stringify({ region: "AS", count: "" }) }
];
const _bigo_fallbackGameCategories = [
  { id: "game:00", parentId: "bigo-game", title: "热门游戏", icon: _bigo_logoURL, biz: "" },
  { id: "game:5E", parentId: "bigo-game", title: "ROBLOX", icon: "", biz: JSON.stringify({ listType: "11" }) },
  { id: "game:6G", parentId: "bigo-game", title: "PUBG Mobile", icon: "", biz: JSON.stringify({ listType: "11" }) },
  { id: "game:10", parentId: "bigo-game", title: "Free Fire", icon: "", biz: JSON.stringify({ listType: "11" }) },
  { id: "game:3k", parentId: "bigo-game", title: "Mobile Legends", icon: "", biz: JSON.stringify({ listType: "11" }) }
];

function _bigo_str(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

function _bigo_int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function _bigo_throw(code, message, context) {
  if (globalThis.Host && typeof Host.raise === "function") {
    Host.raise(code || "UNKNOWN", message || "", context || {});
  }
  if (globalThis.Host && typeof Host.makeError === "function") {
    throw Host.makeError(code || "UNKNOWN", message || "", context || {});
  }
  throw new Error(message || code || "UNKNOWN");
}

function _bigo_parseJSON(text, fallback) {
  try {
    return JSON.parse(_bigo_str(text));
  } catch (_) {
    return fallback;
  }
}

function _bigo_query(params) {
  const parts = [];
  const obj = params || {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    if (value === null || typeof value === "undefined" || value === "") continue;
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
  }
  return parts.length ? "?" + parts.join("&") : "";
}

function _bigo_form(params) {
  const parts = [];
  const obj = params || {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    if (value === null || typeof value === "undefined") continue;
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
  }
  return parts.join("&");
}

function _bigo_cloneCategory(category) {
  return {
    id: _bigo_str(category && category.id),
    parentId: _bigo_str(category && category.parentId),
    title: _bigo_str(category && category.title),
    icon: _bigo_str(category && category.icon),
    biz: _bigo_str(category && category.biz)
  };
}

function _bigo_pickReserveIcon(item) {
  const reserve = item && Array.isArray(item.reserve) ? item.reserve : [];
  for (let i = 0; i < reserve.length; i += 1) {
    const entry = reserve[i] || {};
    const key = _bigo_str(entry.key).toLowerCase();
    const value = _bigo_str(entry.value).trim();
    if (value && (!key || key.indexOf("cover") >= 0 || key.indexOf("icon") >= 0)) return value;
  }
  return "";
}

function _bigo_pickImage(room) {
  if (!room || typeof room !== "object") return "";
  if (room.cover_l) return _bigo_str(room.cover_l);
  if (room.cover_m) return _bigo_str(room.cover_m);
  if (room.data5) return _bigo_str(room.data5);
  if (room.data1) return _bigo_str(room.data1);
  if (room.data2 && typeof room.data2 === "object" && room.data2.bigUrl) return _bigo_str(room.data2.bigUrl);
  return "";
}

function _bigo_pickTitle(room, fallbackId) {
  const topic = _bigo_str(room && room.room_topic).trim();
  if (topic) return topic;
  const roomName = _bigo_str(room && room.room_name).trim();
  if (roomName) return roomName;
  const nick = _bigo_str(room && room.nick_name).trim();
  if (nick) return nick;
  return "BIGO " + _bigo_str(fallbackId || "Live");
}

function _bigo_roomModel(room) {
  const id = _bigo_extractBigoId(room) || _bigo_str(room && room.room_id) || _bigo_str(room && room.sid);
  const cover = _bigo_pickImage(room);
  const nick = _bigo_str(room && room.nick_name).trim() || "BIGO LIVE";
  return {
    userName: nick,
    roomTitle: _bigo_pickTitle(room, id),
    roomCover: cover,
    userHeadImg: _bigo_str(room && room.data5) || cover,
    liveType: _bigo_liveType,
    liveState: "1",
    userId: id,
    roomId: id,
    liveWatchedCount: _bigo_str(room && room.user_count),
    biz: JSON.stringify({
      platform: "bigo",
      bigoId: id,
      sid: _bigo_str(room && room.sid),
      owner: _bigo_str(room && room.owner),
      country: _bigo_str(room && room.country),
      roomId: _bigo_str(room && room.room_id)
    })
  };
}

function _bigo_minimalRoomModel(bigoId) {
  const id = _bigo_str(bigoId).trim();
  return _bigo_roomModel({
    bigo_id: id,
    nick_name: "BIGO LIVE",
    room_topic: "BIGO " + id,
    user_count: ""
  });
}

function _bigo_extractBigoId(value) {
  if (value && typeof value === "object") {
    return _bigo_str(value.bigo_id || value.bigoID || value.bigoId || value.roomId || value.userId || value.id).trim();
  }
  const text = _bigo_str(value).trim();
  if (!text) return "";
  const direct = text.replace(/^@+/, "");
  if (/^[0-9]{4,20}$/.test(direct)) return direct;
  let match = text.match(/bigo\.tv\/(?:[a-z]{2}\/)?([0-9]{4,20})(?:[/?#]|$)/i);
  if (match && match[1]) return match[1];
  match = text.match(/(?:bigoId|bigo_id|roomId)=([0-9]{4,20})/i);
  if (match && match[1]) return match[1];
  return "";
}

function _bigo_categoryKind(categoryId) {
  const id = _bigo_str(categoryId).trim();
  if (!id || id === "bigo" || id === "bigo-show" || id === "all" || id === "root") {
    return { type: "show", tabType: "ALL", endpoint: "/OInterfaceWeb/vedioList/5" };
  }
  if (id === "bigo-game") {
    return { type: "game", tabType: "00", endpoint: "/OInterfaceWeb/vedioList/11" };
  }
  const idx = id.indexOf(":");
  if (idx >= 0) {
    const type = id.slice(0, idx);
    const tabType = id.slice(idx + 1) || "ALL";
    if (type === "game") return { type: "game", tabType: tabType || "00", endpoint: "/OInterfaceWeb/vedioList/11" };
    if (type === "game2") return { type: "game2", tabType: tabType || "00", endpoint: "/OInterfaceWeb/vedioList/72" };
    return { type: "show", tabType: tabType || "ALL", endpoint: "/OInterfaceWeb/vedioList/5" };
  }
  return { type: "show", tabType: id, endpoint: "/OInterfaceWeb/vedioList/5" };
}

async function _bigo_request(path, params, userAgent) {
  const url = _bigo_apiBase + path + _bigo_query(params || {});
  const resp = await Host.http.request({
    platformId: _bigo_platformId,
    authMode: "none",
    request: {
      url: url,
      method: "GET",
      headers: {
        "User-Agent": userAgent || _bigo_defaultUserAgent,
        Accept: "application/json, text/plain, */*",
        Referer: _bigo_siteBase + "/",
        Origin: _bigo_siteBase
      },
      body: null,
      timeout: 20
    }
  });
  const data = _bigo_parseJSON(resp && resp.bodyText, null);
  if (!data || Number(data.code) !== 0) {
    _bigo_throw("INVALID_RESPONSE", "BIGO API response is invalid", { path: path, body: _bigo_str(resp && resp.bodyText).slice(0, 200) });
  }
  return data;
}

async function _bigo_post(path, params, refererPath) {
  const url = _bigo_apiBase + path;
  const resp = await Host.http.request({
    platformId: _bigo_platformId,
    authMode: "none",
    request: {
      url: url,
      method: "POST",
      headers: {
        "User-Agent": _bigo_defaultUserAgent,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: _bigo_siteBase + (refererPath || "/"),
        Origin: _bigo_siteBase
      },
      body: _bigo_form(params || {}),
      timeout: 20
    }
  });
  const data = _bigo_parseJSON(resp && resp.bodyText, null);
  if (!data || Number(data.code) !== 0) {
    _bigo_throw("INVALID_RESPONSE", "BIGO API response is invalid", { path: path, body: _bigo_str(resp && resp.bodyText).slice(0, 200) });
  }
  return data;
}

function _bigo_extractRoomArray(data) {
  const root = data && data.data;
  if (Array.isArray(root)) return root;
  if (root && Array.isArray(root.data)) return root.data;
  if (root && root.resCode && !Array.isArray(root.data)) return [];
  return [];
}

async function _bigo_fetchRooms(categoryId, page, pageSize) {
  const parsed = _bigo_categoryKind(categoryId);
  const size = Math.max(1, _bigo_int(pageSize, _bigo_defaultPageSize));
  const current = Math.max(1, _bigo_int(page, 1));
  const fetchNum = Math.min(120, Math.max(size, current * size));
  const params = { tabType: parsed.tabType, fetchNum: fetchNum };
  if (parsed.type === "game" || parsed.type === "game2") {
    params.lang = "en";
  }
  const data = await _bigo_request(parsed.endpoint, params);
  const rooms = _bigo_extractRoomArray(data).map(_bigo_roomModel).filter(function (room) {
    return !!room.roomId;
  });
  const start = (current - 1) * size;
  return rooms.slice(start, start + size);
}

async function _bigo_fetchVideoParam(bigoId) {
  const id = _bigo_extractBigoId(bigoId);
  if (!id) _bigo_throw("INVALID_INPUT", "missing BIGO id", { value: _bigo_str(bigoId) });
  const data = await _bigo_request("/OInterface/getVideoParam", { bigoId: id }, _bigo_mobileUserAgent);
  return data && data.data ? data.data : {};
}

async function _bigo_fetchInternalStudioInfo(bigoId) {
  const id = _bigo_extractBigoId(bigoId);
  if (!id) _bigo_throw("INVALID_INPUT", "missing BIGO id", { value: _bigo_str(bigoId) });
  const data = await _bigo_post("/studio/getInternalStudioInfo", { siteId: id }, "/" + encodeURIComponent(id));
  return data && data.data ? data.data : {};
}

async function _bigo_fetchWebSocketLink(deviceId) {
  const data = await _bigo_post("/studio/getWebSocketLink", { deviceId: _bigo_str(deviceId) }, "/");
  return data && data.data ? data.data : {};
}

async function _bigo_buildShowCategories() {
  try {
    const data = await _bigo_request("/OInterface/getRegionList", {});
    const tabs = data && data.data && Array.isArray(data.data.tabs) ? data.data.tabs : [];
    const result = [{ id: "show:ALL", parentId: "bigo-show", title: "热门秀场", icon: _bigo_logoURL, biz: "" }];
    for (let i = 0; i < tabs.length; i += 1) {
      const region = tabs[i] || {};
      const subTabs = Array.isArray(region.subTabs) ? region.subTabs : [];
      for (let j = 0; j < subTabs.length && result.length < 41; j += 1) {
        const item = subTabs[j] || {};
        const id = _bigo_str(item.id).trim();
        if (!id) continue;
        result.push({
          id: "show:" + id,
          parentId: "bigo-show",
          title: _bigo_str(item.title || id),
          icon: "",
          biz: JSON.stringify({ region: _bigo_str(region.id), count: _bigo_str(item.num) })
        });
      }
    }
    return result.length > 1 ? result : _bigo_fallbackShowCategories.map(_bigo_cloneCategory);
  } catch (_) {
    return _bigo_fallbackShowCategories.map(_bigo_cloneCategory);
  }
}

async function _bigo_buildGameCategories() {
  try {
    const data = await _bigo_request("/OInterface/getGameCategory", {});
    const items = Array.isArray(data && data.data) ? data.data : [];
    const result = [{ id: "game:00", parentId: "bigo-game", title: "热门游戏", icon: _bigo_logoURL, biz: "" }];
    for (let i = 0; i < items.length && result.length < 41; i += 1) {
      const item = items[i] || {};
      const tabId = _bigo_str(item.tabId).trim();
      if (!tabId) continue;
      result.push({
        id: "game:" + tabId,
        parentId: "bigo-game",
        title: _bigo_str(item.title || tabId),
        icon: _bigo_pickReserveIcon(item),
        biz: JSON.stringify({ listType: _bigo_str(item.list_type) })
      });
    }
    return result.length > 1 ? result : _bigo_fallbackGameCategories.map(_bigo_cloneCategory);
  } catch (_) {
    return _bigo_fallbackGameCategories.map(_bigo_cloneCategory);
  }
}

async function _bigo_searchRooms(keyword, page, pageSize) {
  const needle = _bigo_str(keyword).trim().toLowerCase();
  if (!needle) return [];
  const showRooms = await _bigo_fetchRooms("show:ALL", 1, 60);
  const gameRooms = await _bigo_fetchRooms("game:00", 1, 60);
  const seen = {};
  const merged = showRooms.concat(gameRooms).filter(function (room) {
    if (!room || !room.roomId || seen[room.roomId]) return false;
    seen[room.roomId] = true;
    const haystack = [room.userName, room.roomTitle, room.roomId, room.biz].join("\n").toLowerCase();
    return haystack.indexOf(needle) !== -1;
  });
  const size = Math.max(1, _bigo_int(pageSize, _bigo_defaultPageSize));
  const current = Math.max(1, _bigo_int(page, 1));
  return merged.slice((current - 1) * size, current * size);
}

function _bigo_credentialOk() {
  return { ok: true, credentialRequired: false };
}

function _bigo_credentialStatus() {
  return {
    state: "valid",
    expireAt: 0,
    userId: "",
    userName: "",
    message: "credential not required"
  };
}

function _bigo_danmakuDriver() {
  const driver = globalThis.__bigoDanmakuDriver;
  if (!driver) _bigo_throw("UNSUPPORTED", "bigo danmaku driver is unavailable", {});
  return driver;
}

globalThis[_bigo_danmakuSharedGlobalKey] = {
  throwError: _bigo_throw,
  toString: _bigo_str,
  parseJSON: _bigo_parseJSON,
  extractBigoId: _bigo_extractBigoId,
  fetchInternalStudioInfo: _bigo_fetchInternalStudioInfo,
  fetchWebSocketLink: _bigo_fetchWebSocketLink,
  userAgent: _bigo_defaultUserAgent,
  siteBase: _bigo_siteBase,
  wsURL: _bigo_danmakuWebSocketURL
};

const _bigo_plugin = {
  apiVersion: 1,

  async setCredential() {
    return _bigo_credentialOk();
  },

  async clearCredential() {
    return _bigo_credentialOk();
  },

  async getCredentialStatus() {
    return _bigo_credentialStatus();
  },

  async validateCredential() {
    return _bigo_credentialStatus();
  },

  async getCategories() {
    const showCategories = await _bigo_buildShowCategories();
    const gameCategories = await _bigo_buildGameCategories();
    return [
      { id: "bigo-show", title: "BIGO 秀场", icon: _bigo_logoURL, biz: "", subList: showCategories },
      { id: "bigo-game", title: "BIGO 游戏", icon: _bigo_logoURL, biz: "", subList: gameCategories }
    ];
  },

  async getRooms(payload) {
    return await _bigo_fetchRooms(payload && payload.id, payload && payload.page, payload && payload.pageSize);
  },

  async getRoomDetail(payload) {
    const id = _bigo_extractBigoId(payload && (payload.roomId || payload.userId || payload.id || payload.url || payload.shareCode));
    if (!id) _bigo_throw("INVALID_INPUT", "missing BIGO id", { payload: payload || {} });
    const found = (await _bigo_searchRooms(id, 1, 1))[0];
    return found || _bigo_minimalRoomModel(id);
  },

  async getPlayback(payload) {
    const id = _bigo_extractBigoId(payload && (payload.roomId || payload.userId || payload.id || payload.url || payload.shareCode));
    const info = await _bigo_fetchVideoParam(id);
    const src = _bigo_str(info.videoSrc).trim();
    if (!src) _bigo_throw("OFFLINE", "BIGO room is offline or stream URL is unavailable", { bigoId: id });
    return [
      {
        cdn: "BIGO",
        qualitys: [
          {
            roomId: id,
            title: "原始 HLS",
            qn: 0,
            url: src,
            liveCodeType: "m3u8",
            liveType: _bigo_liveType,
            userAgent: _bigo_playbackUserAgent,
            headers: Object.assign({}, _bigo_playbackHeaders)
          }
        ]
      }
    ];
  },

  async search(payload) {
    return await _bigo_searchRooms(payload && payload.keyword, payload && payload.page, payload && payload.pageSize);
  },

  async getLiveState(payload) {
    const id = _bigo_extractBigoId(payload && (payload.roomId || payload.userId || payload.id || payload.url || payload.shareCode));
    if (!id) return { liveState: "0" };
    try {
      const info = await _bigo_fetchVideoParam(id);
      return { liveState: _bigo_str(info.videoSrc).trim() ? "1" : "0" };
    } catch (_) {
      return { liveState: "0" };
    }
  },

  async resolveShare(payload) {
    const id = _bigo_extractBigoId(payload && (payload.shareCode || payload.url || payload.roomId || payload.id));
    return id ? _bigo_minimalRoomModel(id) : null;
  },

  async getDanmaku(payload) {
    return await _bigo_danmakuDriver().getDanmakuPlan(payload || {});
  },

  async createDanmakuSession(payload) {
    return await _bigo_danmakuDriver().createDanmakuSession(payload || {});
  },

  async onDanmakuOpen(payload) {
    return await _bigo_danmakuDriver().onDanmakuOpen(payload || {});
  },

  async onDanmakuFrame(payload) {
    return await _bigo_danmakuDriver().onDanmakuFrame(payload || {});
  },

  async onDanmakuTick(payload) {
    return await _bigo_danmakuDriver().onDanmakuTick(payload || {});
  },

  async destroyDanmakuSession(payload) {
    return await _bigo_danmakuDriver().destroyDanmakuSession(payload || {});
  }
};

_bigo_plugin.setcredential = _bigo_plugin.setCredential;
_bigo_plugin.clearcredential = _bigo_plugin.clearCredential;
_bigo_plugin.getcredentialstatus = _bigo_plugin.getCredentialStatus;
_bigo_plugin.validatecredential = _bigo_plugin.validateCredential;

globalThis.LiveParsePlugin = _bigo_plugin;
