(function () {
const __huya_danmakuSessions = {};
const __huya_sharedGlobalKey = "__lp_plugin_huya_1_0_4_shared";
const __huya_connectionUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/91.0.4472.69";

const __huya_defaultEmotByCode = {
  "dx": { name: "[大笑]", url: "https://a.msstatic.com/huya/main/emot_png/dx.png" },
  "sh": { name: "[送花]", url: "https://a.msstatic.com/huya/main/emot_png/sh.png" },
  "tx": { name: "[偷笑]", url: "https://a.msstatic.com/huya/main/emot_png/tx.png" },
  "dk": { name: "[大哭]", url: "https://a.msstatic.com/huya/main/emot_png/dk.png" },
  "hh": { name: "[嘿哈]", url: "https://a.msstatic.com/huya/main/emot_png/hh.png" },
  "66": { name: "[666]", url: "https://a.msstatic.com/huya/main/emot_png/66.png" },
  "gd": { name: "[感动]", url: "https://a.msstatic.com/huya/main/emot_png/gd.png" },
  "yw": { name: "[疑问]", url: "https://a.msstatic.com/huya/main/emot_png/yw.png" },
  "xh": { name: "[喜欢]", url: "https://a.msstatic.com/huya/main/emot_png/xh.png" },
  "jx": { name: "[奸笑]", url: "https://a.msstatic.com/huya/main/emot_png/jx.png" },
  "zan": { name: "[赞]", url: "https://a.msstatic.com/huya/main/emot_png/zan.png" },
  "ka": { name: "[可爱]", url: "https://a.msstatic.com/huya/main/emot_png/ka.png" },
  "am": { name: "[傲慢]", url: "https://a.msstatic.com/huya/main/emot_png/am.png" },
  "kx": { name: "[开心]", url: "https://a.msstatic.com/huya/main/emot_png/kx.png" },
  "88": { name: "[拜拜]", url: "https://a.msstatic.com/huya/main/emot_png/88.png" },
  "hx": { name: "[害羞]", url: "https://a.msstatic.com/huya/main/emot_png/hx.png" },
  "zs": { name: "[衰]", url: "https://a.msstatic.com/huya/main/emot_png/zs.png" },
  "pu": { name: "[吐血]", url: "https://a.msstatic.com/huya/main/emot_png/pu.png" },
  "zc": { name: "[嘴馋]", url: "https://a.msstatic.com/huya/main/emot_png/zc.png" },
  "sq": { name: "[生气]", url: "https://a.msstatic.com/huya/main/emot_png/sq.png" },
  "fe": { name: "[扶额]", url: "https://a.msstatic.com/huya/main/emot_png/fe.png" },
  "bz": { name: "[闭嘴]", url: "https://a.msstatic.com/huya/main/emot_png/bz.png" },
  "kw": { name: "[枯萎]", url: "https://a.msstatic.com/huya/main/emot_png/kw.png" },
  "xu": { name: "[嘘]", url: "https://a.msstatic.com/huya/main/emot_png/xu.png" },
  "xk": { name: "[笑哭]", url: "https://a.msstatic.com/huya/main/emot_png/xk.png" },
  "lh": { name: "[流汗]", url: "https://a.msstatic.com/huya/main/emot_png/lh.png" },
  "bk": { name: "[不看]", url: "https://a.msstatic.com/huya/main/emot_png/bk.png" },
  "hq": { name: "[哈欠]", url: "https://a.msstatic.com/huya/main/emot_png/hq.png" },
  "tp": { name: "[调皮]", url: "https://a.msstatic.com/huya/main/emot_png/tp.png" },
  "gl": { name: "[鬼脸]", url: "https://a.msstatic.com/huya/main/emot_png/gl.png" },
  "cl": { name: "[戳脸]", url: "https://a.msstatic.com/huya/main/emot_png/cl.png" },
  "dg": { name: "[大哥]", url: "https://a.msstatic.com/huya/main/emot_png/dg.png" },
  "kun": { name: "[困]", url: "https://a.msstatic.com/huya/main/emot_png/kun.png" },
  "yb": { name: "[拥抱]", url: "https://a.msstatic.com/huya/main/emot_png/yb.png" },
  "zt": { name: "[猪头]", url: "https://a.msstatic.com/huya/main/emot_png/zt.png" },
  "kl": { name: "[骷髅]", url: "https://a.msstatic.com/huya/main/emot_png/kl.png" },
  "cc": { name: "[臭臭]", url: "https://a.msstatic.com/huya/main/emot_png/cc.png" },
  "xd": { name: "[心动]", url: "https://a.msstatic.com/huya/main/emot_png/xd.png" },
  "dao": { name: "[刀]", url: "https://a.msstatic.com/huya/main/emot_png/dao.png" }
};

const __huya_defaultEmotByName = {};
(function () {
  const keys = Object.keys(__huya_defaultEmotByCode);
  for (let i = 0; i < keys.length; i += 1) {
    const code = keys[i];
    const item = __huya_defaultEmotByCode[code];
    if (item && item.name) __huya_defaultEmotByName[item.name] = item;
  }
})();


function _huya_shared() {
  const shared = globalThis[__huya_sharedGlobalKey];
  if (!shared) {
    throw new Error("LP_PLUGIN_ERROR:{\"code\":\"UNSUPPORTED\",\"message\":\"huya shared helpers are unavailable\",\"context\":{}}");
  }
  return shared;
}

function _huya_throw(code, message, context) {
  const shared = globalThis[__huya_sharedGlobalKey];
  if (shared && typeof shared.throwError === "function") {
    return shared.throwError(code, message, context || {});
  }
  throw new Error(`LP_PLUGIN_ERROR:${JSON.stringify({ code: String(code || "UNKNOWN"), message: String(message || ""), context: context || {} })}`);
}

function _huya_str(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function _huya_bytesToBase64(bytes) {
  if (typeof btoa !== "function") _huya_throw("UNSUPPORTED", "btoa is unavailable", {});
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] & 0xff);
  }
  return btoa(binary);
}

function _huya_base64ToBytes(value) {
  if (typeof atob !== "function") _huya_throw("UNSUPPORTED", "atob is unavailable", {});
  const raw = atob(_huya_str(value));
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    out.push(raw.charCodeAt(i) & 0xff);
  }
  return out;
}

function _huya_binaryWrite(bytes) {
  return {
    kind: "binary",
    bytesBase64: _huya_bytesToBase64(bytes)
  };
}

function _huya_asByteArray(bufferLike) {
  return Array.from(new Uint8Array(bufferLike));
}

function _huya_buildJoinPacket(uid, tid, sid) {
  if (typeof sendRegister !== "function" || !globalThis.HUYA || !globalThis.Taf) {
    _huya_throw("UNSUPPORTED", "huya.js runtime not available", {});
  }

  const userInfo = new HUYA.WSUserInfo();
  userInfo.lUid = Number(uid || 0);
  userInfo.bAnonymous = true;
  userInfo.sGuid = "";
  userInfo.sToken = "";
  userInfo.lTid = Number(tid || 0);
  userInfo.lSid = Number(sid || 0);
  userInfo.lGroupId = 0;
  userInfo.lGroupType = 0;

  return _huya_asByteArray(sendRegister(userInfo));
}

function _huya_buildHeartbeatPacket() {
  const raw = "ABQdAAwsNgBM";
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    out.push(raw.charCodeAt(i) & 0xff);
  }
  return out;
}


function _huya_pickAbsoluteHttpURL(value) {
  const text = _huya_str(value).trim();
  if (!text) return "";
  if (text.indexOf("https://") === 0 || text.indexOf("http://") === 0) return text;
  return "";
}

function _huya_imageForPlainEmotContent(content) {
  // Whole-message image only.
  // Escape form: "/{dx"  (no closing brace; matches web @huyafed/emoticon-parser)
  // Name form:   "[大笑]"
  const text = _huya_str(content).trim();
  if (!text) return null;

  let item = null;
  const escapeMatch = text.match(/^\/\{([\w]+)$/);
  if (escapeMatch) {
    item = __huya_defaultEmotByCode[escapeMatch[1]];
  } else {
    const nameMatch = text.match(/^\[(.+?)\]$/);
    if (nameMatch) {
      item = __huya_defaultEmotByName["[" + nameMatch[1] + "]"];
    }
  }
  if (!item) return null;
  const url = _huya_pickAbsoluteHttpURL(item.url);
  if (!url) return null;
  return { url: url };
}

function _huya_makeChatMessage(nickname, text, color) {
  const content = _huya_str(text);
  if (!content) return null;
  const message = {
    nickname: _huya_str(nickname),
    text: content,
    color: color
  };
  const image = _huya_imageForPlainEmotContent(content);
  if (image) message.image = image;
  return message;
}

function _huya_parseMessages(bytes) {
  const out = [];
  if (!globalThis.HUYA || !globalThis.Taf) {
    return out;
  }

  try {
    const commandInput = new Taf.JceInputStream(new Uint8Array(bytes || []).buffer);
    const command = new HUYA.WebSocketCommand();
    command.readFrom(commandInput);

    if (Number(command.iCmdType) !== HUYA.EWebSocketCommandType.EWSCmdS2C_MsgPushReq) {
      return out;
    }

    const pushInput = new Taf.JceInputStream(command.vData.buffer);
    const pushMessage = new HUYA.WSPushMessage();
    pushMessage.readFrom(pushInput);

    if (Number(pushMessage.iUri) !== 1400) {
      return out;
    }

    const noticeInput = new Taf.JceInputStream(pushMessage.sMsg.buffer);
    const messageNotice = new HUYA.MessageNotice();
    messageNotice.readFrom(noticeInput);

    const nickname = messageNotice.tUserInfo && messageNotice.tUserInfo.sNickName
      ? String(messageNotice.tUserInfo.sNickName)
      : "";
    const text = String(messageNotice.sContent || "");
    const fontColor = messageNotice.tBulletFormat
      ? Number(messageNotice.tBulletFormat.iFontColor)
      : -1;
    const color = (fontColor === 255 || !Number.isFinite(fontColor) || fontColor < 0)
      ? 0xFFFFFF
      : (fontColor >>> 0);

    const message = _huya_makeChatMessage(nickname, text, color);
    if (message) out.push(message);
  } catch (e) {
  }

  return out;
}

function _huya_session(connectionId) {
  const key = _huya_str(connectionId);
  const session = __huya_danmakuSessions[key];
  if (!session) {
    _huya_throw("INVALID_STATE", "danmaku session not found", { connectionId: key });
  }
  return session;
}

const __huyaDanmakuDriver = {
  async getDanmakuPlan(roomId) {
    const shared = _huya_shared();
    const context = await shared.getDanmakuContext(roomId);
    return {
      args: {
        roomId: _huya_str(context.roomId || roomId),
        lYyid: _huya_str(context.lYyid),
        lChannelId: _huya_str(context.lChannelId),
        lSubChannelId: _huya_str(context.lSubChannelId)
      },
      headers: {
        "User-Agent": __huya_connectionUserAgent
      },
      transport: {
        kind: "websocket",
        url: _huya_str(shared.danmakuWebSocketURL || "wss://cdnws.api.huya.com"),
        frameType: "binary"
      },
      runtime: {
        driver: "plugin_js_v1",
        protocolId: "huya_ws_jce",
        protocolVersion: "1"
      }
    };
  },

  async createDanmakuSession(payload) {
    const connectionId = _huya_str(payload && payload.connectionId ? payload.connectionId : "");
    const args = payload && payload.args ? payload.args : {};
    if (!connectionId) _huya_throw("INVALID_ARGS", "connectionId is required", { field: "connectionId" });
    if (!_huya_str(args.lChannelId) || !_huya_str(args.lSubChannelId)) {
      _huya_throw("INVALID_ARGS", "huya danmaku args are incomplete", {
        lChannelId: _huya_str(args.lChannelId),
        lSubChannelId: _huya_str(args.lSubChannelId)
      });
    }

    __huya_danmakuSessions[connectionId] = {
      connectionId: connectionId,
      lYyid: _huya_str(args.lYyid),
      lChannelId: _huya_str(args.lChannelId),
      lSubChannelId: _huya_str(args.lSubChannelId)
    };

    return {
      ok: true,
      timer: {
        mode: "off"
      }
    };
  },

  async onDanmakuOpen(payload) {
    const session = _huya_session(payload && payload.connectionId);
    return {
      writes: [
        _huya_binaryWrite(_huya_buildJoinPacket(session.lYyid, session.lChannelId, session.lSubChannelId))
      ],
      timer: {
        mode: "heartbeat",
        intervalMs: 60000
      }
    };
  },

  async onDanmakuFrame(payload) {
    const frameType = _huya_str(payload && payload.frameType ? payload.frameType : "");
    if (frameType !== "binary") return { messages: [], writes: [] };
    _huya_session(payload && payload.connectionId);
    return {
      messages: _huya_parseMessages(_huya_base64ToBytes(payload && payload.bytesBase64 ? payload.bytesBase64 : "")),
      writes: []
    };
  },

  async onDanmakuTick(payload) {
    _huya_session(payload && payload.connectionId);
    return {
      writes: [_huya_binaryWrite(_huya_buildHeartbeatPacket())],
      timer: {
        mode: "heartbeat",
        intervalMs: 60000
      }
    };
  },

  async destroyDanmakuSession(payload) {
    const connectionId = _huya_str(payload && payload.connectionId ? payload.connectionId : "");
    if (connectionId) delete __huya_danmakuSessions[connectionId];
    return { ok: true };
  }
};

globalThis.__huyaDanmakuDriver = __huyaDanmakuDriver;

__huyaDanmakuDriver.__imageForPlainEmotContentForTest = function (content) {
  return _huya_imageForPlainEmotContent(content);
};

__huyaDanmakuDriver.__defaultEmotByCodeForTest = function () {
  return __huya_defaultEmotByCode;
};

__huyaDanmakuDriver.__defaultEmotByNameForTest = function () {
  return __huya_defaultEmotByName;
};


})();
