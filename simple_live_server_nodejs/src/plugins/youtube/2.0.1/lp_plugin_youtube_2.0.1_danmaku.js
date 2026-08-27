(function () {
const __yt_danmakuSessions = {};
const __yt_sharedGlobalKey = "__lp_plugin_youtube_2_0_1_shared";
const __yt_defaultPollingIntervalMs = 2500;
const __yt_minPollingIntervalMs = 250;
const __yt_maxPollingIntervalMs = 60000;
const __yt_maxSeenMessageIds = 4096;
const __yt_refreshFailureThreshold = 3;
const __yt_liveChatEndpoint = "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat";

function _yt_shared() {
  const shared = globalThis[__yt_sharedGlobalKey];
  if (!shared) {
    throw new Error("LP_PLUGIN_ERROR:{\"code\":\"UNSUPPORTED\",\"message\":\"youtube shared helpers are unavailable\",\"context\":{}}");
  }
  return shared;
}

function _yt_throw(code, message, context) {
  const shared = globalThis[__yt_sharedGlobalKey];
  if (shared && typeof shared.throwError === "function") {
    return shared.throwError(code, message, context || {});
  }
  throw new Error(`LP_PLUGIN_ERROR:${JSON.stringify({ code: String(code || "UNKNOWN"), message: String(message || ""), context: context || {} })}`);
}

function _yt_str(value) {
  return value === undefined || value === null ? "" : String(value);
}

function _yt_safeJsonParse(text) {
  try {
    return JSON.parse(_yt_str(text));
  } catch (_) {
    return null;
  }
}

function _yt_cloneJson(value) {
  if (!value || typeof value !== "object") return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function _yt_pollingInterval(value, fallback) {
  const parsed = Number(value);
  const fallbackValue = Number(fallback) || __yt_defaultPollingIntervalMs;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
  return Math.max(__yt_minPollingIntervalMs, Math.min(__yt_maxPollingIntervalMs, Math.round(parsed)));
}

function _yt_sharedTextFromRuns(value) {
  const shared = _yt_shared();
  return typeof shared.textFromRuns === "function" ? shared.textFromRuns(value) : "";
}

function _yt_extractMessageText(renderer) {
  if (!renderer || typeof renderer !== "object") return "";
  const candidateKeys = [
    "message",
    "headerSubtext",
    "subtext",
    "primaryText",
    "headerPrimaryText",
    "bodyText",
    "purchaseMessage",
    "purchaseAmountText",
    "text"
  ];
  for (const key of candidateKeys) {
    const text = _yt_sharedTextFromRuns(renderer[key]);
    if (text) return text;
  }
  return "";
}

function _yt_extractAuthorName(renderer) {
  if (!renderer || typeof renderer !== "object") return "";
  const candidateKeys = ["authorName", "headerPrimaryText", "authorBadges"];
  for (const key of candidateKeys) {
    const text = _yt_sharedTextFromRuns(renderer[key]);
    if (text) return text;
  }
  const author = renderer.authorExternalChannelId || renderer.id;
  return _yt_str(author);
}

function _yt_extractColor(renderer) {
  const keys = [
    "bodyBackgroundColor",
    "headerBackgroundColor",
    "bodyTextColor",
    "authorNameTextColor"
  ];
  for (const key of keys) {
    const num = Number(renderer && renderer[key]);
    if (Number.isFinite(num) && num >= 0) return num >>> 0;
  }
  return 16777215;
}

function _yt_messageKey(rendererType, renderer, nickname, text) {
  const directId = _yt_str(renderer && renderer.id);
  if (directId) return rendererType + ":id:" + directId;
  return [
    rendererType,
    _yt_str(renderer && renderer.timestampUsec),
    _yt_str(renderer && renderer.authorExternalChannelId),
    _yt_str(renderer && renderer.trackingParams),
    _yt_str(nickname),
    _yt_str(text)
  ].join("::");
}

function _yt_markMessageSeen(session, key) {
  const finalKey = _yt_str(key);
  if (!finalKey) return false;
  if (session.seenMessageIds[finalKey]) return true;
  session.seenMessageIds[finalKey] = true;
  session.seenMessageOrder.push(finalKey);
  while (session.seenMessageOrder.length > __yt_maxSeenMessageIds) {
    const expired = session.seenMessageOrder.shift();
    if (expired) delete session.seenMessageIds[expired];
  }
  return false;
}

function _yt_pushMessage(out, session, rendererType, renderer, nickname, text, color) {
  const finalText = _yt_str(text).trim();
  if (!finalText) return;
  const finalNickname = _yt_str(nickname);
  const dedupeKey = _yt_messageKey(rendererType, renderer, finalNickname, finalText);
  if (_yt_markMessageSeen(session, dedupeKey)) return;
  out.push({
    text: finalText,
    nickname: finalNickname,
    color: Number.isFinite(Number(color)) ? (Number(color) >>> 0) : 16777215
  });
}

function _yt_rendererFromItem(item) {
  if (!item || typeof item !== "object") return null;
  const rendererKeys = [
    "liveChatTextMessageRenderer",
    "liveChatPaidMessageRenderer",
    "liveChatPaidStickerRenderer",
    "liveChatMembershipItemRenderer",
    "liveChatSponsorshipsGiftPurchaseAnnouncementRenderer",
    "liveChatSponsorshipsGiftRedemptionAnnouncementRenderer"
  ];
  for (const rendererType of rendererKeys) {
    const renderer = item[rendererType];
    if (renderer && typeof renderer === "object") {
      return { rendererType: rendererType, renderer: renderer };
    }
  }
  return null;
}

function _yt_itemFromAction(action) {
  if (!action || typeof action !== "object") return null;
  if (action.addChatItemAction && action.addChatItemAction.item) {
    return action.addChatItemAction.item;
  }
  if (action.replaceChatItemAction && action.replaceChatItemAction.replacementItem) {
    return action.replaceChatItemAction.replacementItem;
  }
  return null;
}

function _yt_liveChatContinuation(response) {
  const contents = response && response.continuationContents;
  const liveChat = contents && contents.liveChatContinuation;
  return liveChat && typeof liveChat === "object" ? liveChat : null;
}

function _yt_collectMessages(liveChat, session) {
  const out = [];
  const actions = Array.isArray(liveChat && liveChat.actions) ? liveChat.actions : [];
  for (const action of actions) {
    const item = _yt_itemFromAction(action);
    const entry = _yt_rendererFromItem(item);
    if (!entry) continue;
    const text = _yt_extractMessageText(entry.renderer);
    if (!text) continue;
    const nickname = _yt_extractAuthorName(entry.renderer);
    _yt_pushMessage(
      out,
      session,
      entry.rendererType,
      entry.renderer,
      nickname,
      text,
      _yt_extractColor(entry.renderer)
    );
  }

  return out;
}

function _yt_extractNextContinuation(liveChat) {
  const continuations = Array.isArray(liveChat && liveChat.continuations)
    ? liveChat.continuations
    : [];
  const keys = ["invalidationContinuationData", "timedContinuationData", "reloadContinuationData"];
  for (const key of keys) {
    for (const continuationEntry of continuations) {
      if (!continuationEntry || typeof continuationEntry !== "object") continue;
      const data = continuationEntry[key];
      const continuation = _yt_str(data && data.continuation);
      if (!continuation) continue;
      return {
        continuation: continuation,
        clickTrackingParams: _yt_str(data.clickTrackingParams),
        timeoutMs: _yt_pollingInterval(data.timeoutMs, __yt_defaultPollingIntervalMs)
      };
    }
  }
  return null;
}

function _yt_buildPollURL(apiKey) {
  return __yt_liveChatEndpoint + "?prettyPrint=false&key=" + encodeURIComponent(_yt_str(apiKey));
}

function _yt_buildPollHeaders(session) {
  const base = session && session.headers && typeof session.headers === "object" ? session.headers : {};
  const headers = {
    "Content-Type": _yt_str(base["Content-Type"] || base["content-type"] || "application/json"),
    Origin: _yt_str(base.Origin || base.origin || "https://www.youtube.com"),
    Referer: _yt_str(base.Referer || base.referer || "https://www.youtube.com/"),
    "User-Agent": _yt_str(base["User-Agent"] || base["user-agent"] || _yt_shared().userAgent || "")
  };
  if (_yt_str(session.visitorData)) {
    headers["X-Goog-Visitor-Id"] = _yt_str(session.visitorData);
  }
  return headers;
}

function _yt_buildPollBody(session) {
  const context = _yt_cloneJson(session.innertubeContext) || {};
  if (!context.client || typeof context.client !== "object") context.client = {};
  context.client.clientName = _yt_str(
    context.client.clientName || session.clientName || _yt_shared().webClientName || "WEB"
  );
  context.client.clientVersion = _yt_str(
    context.client.clientVersion || session.clientVersion || _yt_shared().webClientVersionFallback || ""
  );
  context.client.hl = _yt_str(context.client.hl || session.hl || "en");
  context.client.gl = _yt_str(context.client.gl || session.gl || "US");
  if (_yt_str(session.visitorData) && !_yt_str(context.client.visitorData)) {
    context.client.visitorData = _yt_str(session.visitorData);
  }
  if (_yt_str(session.clickTrackingParams)) {
    context.clickTracking = {
      clickTrackingParams: _yt_str(session.clickTrackingParams)
    };
  } else if (context.clickTracking) {
    delete context.clickTracking;
  }

  return {
    context: context,
    continuation: _yt_str(session.continuation)
  };
}

function _yt_makePoll(session) {
  return {
    url: _yt_buildPollURL(session.apiKey),
    method: "POST",
    headers: _yt_buildPollHeaders(session),
    bodyText: JSON.stringify(_yt_buildPollBody(session))
  };
}

function _yt_session(connectionId) {
  const key = _yt_str(connectionId);
  const session = __yt_danmakuSessions[key];
  if (!session) {
    _yt_throw("INVALID_STATE", "danmaku session not found", { connectionId: key });
  }
  return session;
}

function _yt_parseContextJson(text) {
  const parsed = _yt_safeJsonParse(text);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function _yt_failureDelay(failureCount) {
  const power = Math.max(0, Math.min(4, Number(failureCount || 1) - 1));
  return Math.min(30000, __yt_defaultPollingIntervalMs * Math.pow(2, power));
}

function _yt_recordFailure(session) {
  session.consecutiveFailures += 1;
  session.nextPollDelayMs = _yt_failureDelay(session.consecutiveFailures);
  if (session.consecutiveFailures >= __yt_refreshFailureThreshold) {
    session.needsRefresh = true;
  }
  return {
    messages: [],
    timer: {
      mode: "polling",
      intervalMs: session.nextPollDelayMs
    }
  };
}

async function _yt_refreshSession(session) {
  const shared = _yt_shared();
  const watch = await shared.fetchWatchByVideoId(session.videoId);
  const playerResponse = shared.extractWatchPlayerResponse(watch.text);
  let initialData = null;
  try {
    initialData = shared.extractInitialData(watch.text);
  } catch (_) {
    initialData = null;
  }
  const continuation = _yt_str(
    shared.extractLiveChatContinuation(playerResponse, initialData, watch.text)
  );
  if (!continuation) {
    _yt_throw("NOT_FOUND", "youtube live chat continuation refresh failed", {
      videoId: _yt_str(session.videoId)
    });
  }

  session.continuation = continuation;
  session.apiKey = _yt_str(shared.extractInnertubeApiKey(watch.text) || session.apiKey);
  session.clientVersion = _yt_str(
    shared.extractInnertubeClientVersion(watch.text) || session.clientVersion
  );
  session.visitorData = _yt_str(shared.extractVisitorData(watch.text) || session.visitorData);
  if (typeof shared.extractInnertubeContext === "function") {
    session.innertubeContext = shared.extractInnertubeContext(watch.text) || session.innertubeContext;
  }
  session.clickTrackingParams = "";
  session.consecutiveFailures = 0;
  session.needsRefresh = false;
  session.nextPollDelayMs = __yt_defaultPollingIntervalMs;
}

const __ytDanmakuDriver = {
  async getDanmakuPlan(roomId) {
    const shared = _yt_shared();
    const resolved = await shared.resolveVideoId(roomId);
    const watch = await shared.fetchWatchByVideoId(resolved.videoId);
    const playerResponse = shared.extractWatchPlayerResponse(watch.text);
    let initialData = null;
    try {
      initialData = shared.extractInitialData(watch.text);
    } catch (_) {
      initialData = null;
    }

    const continuation = _yt_str(shared.extractLiveChatContinuation(playerResponse, initialData, watch.text));
    if (!continuation) {
      _yt_throw("NOT_FOUND", "youtube live chat continuation not found", {
        roomId: _yt_str(roomId),
        videoId: _yt_str(resolved.videoId)
      });
    }

    const apiKey = _yt_str(shared.extractInnertubeApiKey(watch.text) || "");
    const clientVersion = _yt_str(shared.extractInnertubeClientVersion(watch.text) || shared.webClientVersionFallback || "");
    const visitorData = _yt_str(shared.extractVisitorData(watch.text));
    const innertubeContext = typeof shared.extractInnertubeContext === "function"
      ? shared.extractInnertubeContext(watch.text)
      : null;
    const videoId = _yt_str(resolved.videoId);

    return {
      args: {
        _danmu_type: "http_polling",
        _polling_url: __yt_liveChatEndpoint,
        _polling_method: "POST",
        _polling_interval: String(__yt_defaultPollingIntervalMs),
        continuation: continuation,
        apiKey: apiKey,
        clientName: _yt_str(shared.webClientName || "WEB"),
        clientVersion: clientVersion,
        visitorData: visitorData,
        innertubeContextJson: innertubeContext ? JSON.stringify(innertubeContext) : "",
        hl: "en",
        gl: "US",
        videoId: videoId
      },
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.youtube.com",
        Referer: "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId),
        "User-Agent": _yt_str(shared.userAgent)
      },
      transport: {
        kind: "http_polling",
        url: __yt_liveChatEndpoint,
        polling: {
          method: "POST",
          intervalMs: __yt_defaultPollingIntervalMs,
          sendOnConnect: true
        }
      },
      runtime: {
        driver: "plugin_js_v1",
        protocolId: "youtube_live_chat_json",
        protocolVersion: "2"
      }
    };
  },

  async createDanmakuSession(payload) {
    const connectionId = _yt_str(payload && payload.connectionId);
    if (!connectionId) {
      _yt_throw("INVALID_ARGS", "connectionId is required", { field: "connectionId" });
    }
    const args = payload && payload.args ? payload.args : {};
    const continuation = _yt_str(args.continuation);
    const apiKey = _yt_str(args.apiKey);
    if (!continuation) {
      _yt_throw("INVALID_ARGS", "continuation is required", { field: "continuation" });
    }
    if (!apiKey) {
      _yt_throw("INVALID_ARGS", "apiKey is required", { field: "apiKey" });
    }

    __yt_danmakuSessions[connectionId] = {
      connectionId: connectionId,
      continuation: continuation,
      apiKey: apiKey,
      clientName: _yt_str(args.clientName || _yt_shared().webClientName || "WEB"),
      clientVersion: _yt_str(args.clientVersion || _yt_shared().webClientVersionFallback || ""),
      visitorData: _yt_str(args.visitorData),
      innertubeContext: _yt_parseContextJson(args.innertubeContextJson),
      hl: _yt_str(args.hl || "en"),
      gl: _yt_str(args.gl || "US"),
      videoId: _yt_str(args.videoId),
      headers: payload && payload.headers ? payload.headers : null,
      clickTrackingParams: "",
      nextPollDelayMs: __yt_defaultPollingIntervalMs,
      consecutiveFailures: 0,
      needsRefresh: false,
      seenMessageIds: {},
      seenMessageOrder: []
    };

    const session = __yt_danmakuSessions[connectionId];
    return {
      ok: true,
      poll: _yt_makePoll(session),
      timer: {
        mode: "polling",
        intervalMs: __yt_defaultPollingIntervalMs
      }
    };
  },

  async onDanmakuOpen() {
    return {
      timer: {
        mode: "polling",
        intervalMs: __yt_defaultPollingIntervalMs
      }
    };
  },

  async onDanmakuFrame(payload) {
    const session = _yt_session(payload && payload.connectionId);
    const statusCode = Number(payload && payload.statusCode);
    if (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)) {
      return _yt_recordFailure(session);
    }
    const text = _yt_str(payload && payload.text);
    const response = _yt_safeJsonParse(text);
    if (!response || typeof response !== "object" || response.error) {
      return _yt_recordFailure(session);
    }
    const liveChat = _yt_liveChatContinuation(response);
    if (!liveChat) return _yt_recordFailure(session);

    const messages = _yt_collectMessages(liveChat, session);
    const next = _yt_extractNextContinuation(liveChat);
    if (!next) {
      const failure = _yt_recordFailure(session);
      failure.messages = messages;
      return failure;
    }

    session.continuation = next.continuation;
    session.clickTrackingParams = next.clickTrackingParams;
    session.nextPollDelayMs = next.timeoutMs;
    session.consecutiveFailures = 0;
    session.needsRefresh = false;

    return {
      messages: messages,
      timer: {
        mode: "polling",
        intervalMs: session.nextPollDelayMs
      }
    };
  },

  async onDanmakuTick(payload) {
    const session = _yt_session(payload && payload.connectionId);
    if (session.needsRefresh) {
      try {
        await _yt_refreshSession(session);
      } catch (_) {
        const failure = _yt_recordFailure(session);
        return {
          poll: null,
          timer: failure.timer
        };
      }
    }
    return {
      poll: _yt_makePoll(session),
      timer: {
        mode: "polling",
        intervalMs: session.nextPollDelayMs
      }
    };
  },

  async destroyDanmakuSession(payload) {
    const connectionId = _yt_str(payload && payload.connectionId);
    if (connectionId) {
      delete __yt_danmakuSessions[connectionId];
    }
    return {
      ok: true
    };
  }
};

globalThis.__ytDanmakuDriver = __ytDanmakuDriver;
})();
