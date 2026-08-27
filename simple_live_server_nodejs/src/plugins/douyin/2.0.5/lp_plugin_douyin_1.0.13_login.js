const _dy_loginPlatformId = "douyin";
const _dy_loginUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const _dy_loginRuntime = {
  credentialSynced: false,
  credentialStatus: {
    state: "missing",
    expireAt: 0,
    userId: "",
    userName: "",
    message: ""
  }
};

function _dy_loginTrim(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function _dy_loginToNumber(value, defaultValue) {
  if (value === null || value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function _dy_loginBuildCredentialStatus(status) {
  const source = status && typeof status === "object" ? status : {};
  return {
    state: _dy_loginTrim(source.state) || "unknown",
    expireAt: _dy_loginToNumber(source.expireAt, 0),
    userId: _dy_loginTrim(source.userId),
    userName: _dy_loginTrim(source.userName),
    message: _dy_loginTrim(source.message)
  };
}

function _dy_loginSetCredentialStatus(status) {
  _dy_loginRuntime.credentialStatus = _dy_loginBuildCredentialStatus(status);
  return _dy_loginGetCredentialStatusSnapshot();
}

function _dy_loginGetCredentialStatusSnapshot() {
  return _dy_loginBuildCredentialStatus(_dy_loginRuntime.credentialStatus);
}

function _dy_loginParseJSON(text, fallback) {
  try {
    return JSON.parse(text === undefined || text === null ? "{}" : String(text));
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}

function _dy_loginMarkSynced(message) {
  _dy_loginRuntime.credentialSynced = true;
  return _dy_loginSetCredentialStatus({
    state: "unknown",
    expireAt: 0,
    userId: "",
    userName: "",
    message: _dy_loginTrim(message) || "credential synced; validation pending"
  });
}

function _dy_loginMarkCleared() {
  _dy_loginRuntime.credentialSynced = false;
  return _dy_loginSetCredentialStatus({
    state: "missing",
    expireAt: 0,
    userId: "",
    userName: "",
    message: ""
  });
}

async function _dy_loginRequest(request, authMode) {
  return await Host.http.request({
    platformId: _dy_loginPlatformId,
    authMode: authMode || "none",
    request: request || {}
  });
}

function _dy_loginReadCookieHeader() {
  if (globalThis.Host && Host.session && typeof Host.session.getCookieHeader === "function") {
    return _dy_loginTrim(Host.session.getCookieHeader(_dy_loginPlatformId));
  }
  return "";
}

function _dy_loginReadCookieValue(cookieHeader, name) {
  const cookie = _dy_loginTrim(cookieHeader);
  const target = _dy_loginTrim(name);
  if (!cookie || !target) return "";
  const parts = cookie.split(";");
  for (const part of parts) {
    const segment = _dy_loginTrim(part);
    if (!segment) continue;
    const index = segment.indexOf("=");
    const key = index >= 0 ? segment.slice(0, index).trim() : segment;
    const value = index >= 0 ? segment.slice(index + 1).trim() : "";
    if (key === target) return value;
  }
  return "";
}

function _dy_loginPickFirst(values) {
  for (const value of values || []) {
    const text = _dy_loginTrim(value);
    if (text) return text;
  }
  return "";
}

function _dy_loginDecodeURIComponent(text) {
  try {
    return decodeURIComponent(String(text || ""));
  } catch (e) {
    return String(text || "");
  }
}

function _dy_loginExpireAt(cookieHeader) {
  const sidGuard = _dy_loginReadCookieValue(cookieHeader, "sid_guard");
  const parts = sidGuard ? sidGuard.split("|") : [];
  const loginAt = _dy_loginToNumber(parts[1], 0);
  const ttl = _dy_loginToNumber(parts[2], 0);
  if (loginAt > 0 && ttl > 0) return (loginAt + ttl) * 1000;
  if (parts[3]) {
    const parsed = Date.parse(_dy_loginDecodeURIComponent(parts[3]));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function _dy_loginHasSignalCookie(cookieHeader) {
  return !!_dy_loginPickFirst([
    _dy_loginReadCookieValue(cookieHeader, "sessionid"),
    _dy_loginReadCookieValue(cookieHeader, "sessionid_ss"),
    _dy_loginReadCookieValue(cookieHeader, "sid_guard")
  ]);
}

function _dy_loginBuildValidationURL(cookieHeader) {
  const msToken = _dy_loginReadCookieValue(cookieHeader, "msToken");
  const params = [
    "device_platform=webapp",
    "aid=6383",
    "channel=channel_pc_web",
    "publish_video_strategy_type=2",
    "source=channel_pc_web",
    "sec_user_id=",
    "version_code=170400",
    "version_name=17.4.0",
    "cookie_enabled=true",
    "screen_width=1920",
    "screen_height=1080",
    "browser_language=zh-CN",
    "browser_platform=MacIntel",
    "browser_name=Chrome",
    "browser_version=140.0.0.0",
    "browser_online=true",
    "engine_name=Blink",
    "engine_version=140.0.0.0",
    "os_name=Mac+OS",
    "os_version=10.15.7",
    "cpu_core_num=8",
    "device_memory=8",
    "platform=PC",
    "downlink=10",
    "effective_type=4g",
    "round_trip_time=100",
    "webid=7247041636524377637"
  ];
  if (msToken) params.push("msToken=" + encodeURIComponent(msToken));

  const query = params.join("&");
  let url = "https://www.douyin.com/aweme/v1/web/user/profile/self/?" + query;
  if (typeof sign_datail === "function") {
    const aBogus = _dy_loginTrim(sign_datail(query, _dy_loginUA));
    if (aBogus) url += "&a_bogus=" + encodeURIComponent(aBogus);
  }
  return url;
}

function _dy_loginExtractUser(obj) {
  const root = obj && typeof obj === "object" ? obj : {};
  const data = root.data && typeof root.data === "object" ? root.data : {};
  const candidates = [
    root.user,
    root.user_info,
    root.userInfo,
    data.user,
    data.user_info,
    data.userInfo,
    data
  ];
  for (const candidate of candidates) {
    const user = candidate && typeof candidate === "object" ? candidate : null;
    if (!user) continue;
    const userId = _dy_loginPickFirst([
      user.uid,
      user.user_id,
      user.userId,
      user.id,
      user.id_str,
      user.sec_uid,
      user.secUid,
      user.unique_id,
      user.uniqueId,
      user.short_id,
      user.shortId
    ]);
    const userName = _dy_loginPickFirst([
      user.nickname,
      user.nick_name,
      user.name,
      user.unique_id,
      user.uniqueId,
      user.short_id,
      user.shortId
    ]);
    if (userId || userName) return { userId, userName };
  }
  return { userId: "", userName: "" };
}

function _dy_loginAuthFailureStatus(httpCode, obj, hasCredential) {
  const statusCode = _dy_loginToNumber(obj && obj.status_code, 0);
  const message = _dy_loginPickFirst([
    obj && obj.status_msg,
    obj && obj.message,
    obj && obj.msg,
    obj && obj.error_msg,
    obj && obj.err_msg
  ]);
  if (httpCode === 444 || httpCode === 412 || statusCode === 10000 || statusCode === 10001) {
    return {
      state: "risk_control",
      message: message || "douyin credential blocked by risk control"
    };
  }
  if (httpCode === 401 || httpCode === 403 || statusCode === 8 || statusCode === 9 || statusCode === 14) {
    return {
      state: hasCredential ? "expired" : "missing",
      message: message || "douyin credential expired"
    };
  }
  return {
    state: hasCredential ? "invalid" : "missing",
    message: message || "douyin credential validation failed"
  };
}

async function _dy_loginValidateCredential() {
  const hasCredential = !!_dy_loginRuntime.credentialSynced;
  const cookieHeader = _dy_loginReadCookieHeader();
  const expireAt = _dy_loginExpireAt(cookieHeader);
  if (!_dy_loginHasSignalCookie(cookieHeader)) {
    return _dy_loginSetCredentialStatus({
      state: "missing",
      expireAt: 0,
      userId: "",
      userName: "",
      message: "douyin session cookie not present in host vault"
    });
  }

  const resp = await _dy_loginRequest({
    url: _dy_loginBuildValidationURL(cookieHeader),
    method: "GET",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Authority": "www.douyin.com",
      "Referer": "https://www.douyin.com/user/self",
      "User-Agent": _dy_loginUA
    },
    timeout: 15
  }, "platform_cookie");

  const httpCode = _dy_loginToNumber(resp && (resp.statusCode || resp.status), 0);
  const obj = _dy_loginParseJSON(resp && resp.bodyText, {}) || {};
  const user = _dy_loginExtractUser(obj);
  const statusCode = _dy_loginToNumber(obj && obj.status_code, 0);

  if (httpCode >= 400 || statusCode !== 0 || (!user.userId && !user.userName)) {
    const failure = _dy_loginAuthFailureStatus(httpCode, obj, hasCredential);
    return _dy_loginSetCredentialStatus({
      state: failure.state,
      expireAt,
      userId: user.userId,
      userName: user.userName,
      message: failure.message
    });
  }

  return _dy_loginSetCredentialStatus({
    state: "valid",
    expireAt,
    userId: user.userId,
    userName: user.userName,
    message: ""
  });
}

async function _dy_loginSetCookie() {
  _dy_loginMarkSynced("cookie synced from host");
  return { ok: true };
}

async function _dy_loginClearCookie() {
  _dy_loginMarkCleared();
  return { ok: true };
}

async function _dy_loginSetCredential() {
  const status = _dy_loginMarkSynced("credential synced from host");
  return Object.assign({ ok: true }, status);
}

async function _dy_loginClearCredential() {
  const status = _dy_loginMarkCleared();
  return Object.assign({ ok: true }, status);
}

async function _dy_loginGetCredentialStatus() {
  return _dy_loginGetCredentialStatusSnapshot();
}

globalThis.__lp_plugin_douyin_1_0_13_login = {
  request: _dy_loginRequest,
  setCookie: _dy_loginSetCookie,
  clearCookie: _dy_loginClearCookie,
  setCredential: _dy_loginSetCredential,
  clearCredential: _dy_loginClearCredential,
  getCredentialStatus: _dy_loginGetCredentialStatus,
  validateCredential: _dy_loginValidateCredential
};
