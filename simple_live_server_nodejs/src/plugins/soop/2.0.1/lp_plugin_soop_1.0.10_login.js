const _soop_loginPlatformId = "soop";
const _soop_loginUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const _soop_loginRuntime = {
  credentialSynced: false,
  credentialStatus: {
    state: "missing",
    expireAt: 0,
    userId: "",
    userName: "",
    message: ""
  }
};

function _soop_loginTrim(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function _soop_loginToNumber(value, defaultValue) {
  if (value === null || value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function _soop_loginBuildCredentialStatus(status) {
  const source = status && typeof status === "object" ? status : {};
  return {
    state: _soop_loginTrim(source.state) || "unknown",
    expireAt: _soop_loginToNumber(source.expireAt, 0),
    userId: _soop_loginTrim(source.userId),
    userName: _soop_loginTrim(source.userName),
    message: _soop_loginTrim(source.message)
  };
}

function _soop_loginSetCredentialStatus(status) {
  _soop_loginRuntime.credentialStatus = _soop_loginBuildCredentialStatus(status);
  return _soop_loginGetCredentialStatusSnapshot();
}

function _soop_loginGetCredentialStatusSnapshot() {
  return _soop_loginBuildCredentialStatus(_soop_loginRuntime.credentialStatus);
}

function _soop_loginParseJSON(text, fallback) {
  try {
    return JSON.parse(text === undefined || text === null ? "{}" : String(text));
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}

function _soop_loginMarkSynced(message) {
  _soop_loginRuntime.credentialSynced = true;
  return _soop_loginSetCredentialStatus({
    state: "unknown",
    expireAt: 0,
    userId: "",
    userName: "",
    message: _soop_loginTrim(message) || "credential synced; validation pending"
  });
}

function _soop_loginMarkCleared() {
  _soop_loginRuntime.credentialSynced = false;
  return _soop_loginSetCredentialStatus({
    state: "missing",
    expireAt: 0,
    userId: "",
    userName: "",
    message: ""
  });
}

async function _soop_loginRequest(request, authMode) {
  return await Host.http.request({
    platformId: _soop_loginPlatformId,
    authMode: authMode || "none",
    request: request || {}
  });
}

function _soop_loginReadCookieHeader() {
  if (globalThis.Host && Host.session && typeof Host.session.getCookieHeader === "function") {
    return _soop_loginTrim(Host.session.getCookieHeader(_soop_loginPlatformId));
  }
  return "";
}

function _soop_loginReadCookieValue(cookieHeader, name) {
  const cookie = _soop_loginTrim(cookieHeader);
  const target = _soop_loginTrim(name);
  if (!cookie || !target) return "";
  const parts = cookie.split(";");
  for (const part of parts) {
    const segment = _soop_loginTrim(part);
    if (!segment) continue;
    const index = segment.indexOf("=");
    const key = index >= 0 ? segment.slice(0, index).trim() : segment;
    const value = index >= 0 ? segment.slice(index + 1).trim() : "";
    if (key === target) return value;
  }
  return "";
}

function _soop_loginPickFirst(values) {
  for (const value of values || []) {
    const text = _soop_loginTrim(value);
    if (text) return text;
  }
  return "";
}

function _soop_loginDecodeURIComponent(text) {
  try {
    return decodeURIComponent(String(text || ""));
  } catch (e) {
    return String(text || "");
  }
}

function _soop_loginHasSignalCookie(cookieHeader) {
  return !!_soop_loginPickFirst([
    _soop_loginReadCookieValue(cookieHeader, "PdboxTicket"),
    _soop_loginReadCookieValue(cookieHeader, "AuthTicket"),
    _soop_loginReadCookieValue(cookieHeader, "BbsTicket"),
    _soop_loginReadCookieValue(cookieHeader, "RDB"),
    _soop_loginReadCookieValue(cookieHeader, "_au"),
    _soop_loginReadCookieValue(cookieHeader, "SOOP_TOKEN"),
    _soop_loginReadCookieValue(cookieHeader, "access_token")
  ]);
}

function _soop_loginAuthFailureStatus(httpCode, obj, hasCredential) {
  const result = _soop_loginToNumber(obj && obj.RESULT, 0);
  const channel = obj && typeof obj.CHANNEL === "object" ? obj.CHANNEL : {};
  const isLogin = _soop_loginToNumber(channel.IS_LOGIN, 0);
  const message = _soop_loginPickFirst([
    obj && obj.MESSAGE,
    obj && obj.message,
    obj && obj.msg,
    obj && obj.error_msg
  ]);
  if (httpCode === 429 || result === -9 || result === -10 || result === -33) {
    return {
      state: "risk_control",
      message: message || "soop credential blocked by risk control"
    };
  }
  if (httpCode === 401 || httpCode === 403 || result === -1 || result === -11 || result === -12) {
    return {
      state: hasCredential ? "expired" : "missing",
      message: message || "soop credential expired"
    };
  }
  if (isLogin < 1) {
    return {
      state: hasCredential ? "expired" : "missing",
      message: message || "soop login required"
    };
  }
  return {
    state: hasCredential ? "invalid" : "missing",
    message: message || "soop credential validation failed"
  };
}

async function _soop_loginValidateCredential() {
  const hasCredential = !!_soop_loginRuntime.credentialSynced;
  const cookieHeader = _soop_loginReadCookieHeader();
  if (!_soop_loginHasSignalCookie(cookieHeader)) {
    return _soop_loginSetCredentialStatus({
      state: "missing",
      expireAt: 0,
      userId: "",
      userName: "",
      message: "soop login cookie not present in host vault"
    });
  }

  const resp = await _soop_loginRequest({
    url: "https://afevent2.sooplive.com/api/get_private_info.php",
    method: "GET",
    headers: {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": "https://www.sooplive.com/",
      "User-Agent": _soop_loginUA
    },
    timeout: 15
  }, "platform_cookie");

  const httpCode = _soop_loginToNumber(resp && (resp.statusCode || resp.status), 0);
  const obj = _soop_loginParseJSON(resp && resp.bodyText, {}) || {};
  const channel = obj && typeof obj.CHANNEL === "object" ? obj.CHANNEL : {};
  const isLogin = _soop_loginToNumber(channel.IS_LOGIN, 0);
  const loginCheck = _soop_loginTrim(channel.LOGIN_CHK);
  const userId = _soop_loginPickFirst([channel.LOGIN_ID, channel.STATION_NO]);
  const userName = _soop_loginPickFirst([channel.LOGIN_NICK, channel.LOGIN_ID]);

  if (httpCode >= 400 || isLogin < 1 || loginCheck === "0" || !userId) {
    const failure = _soop_loginAuthFailureStatus(httpCode, obj, hasCredential);
    return _soop_loginSetCredentialStatus({
      state: failure.state,
      expireAt: 0,
      userId: userId,
      userName: userName,
      message: failure.message
    });
  }

  return _soop_loginSetCredentialStatus({
    state: "valid",
    expireAt: 0,
    userId: userId,
    userName: userName,
    message: ""
  });
}

async function _soop_loginSetCookie() {
  _soop_loginMarkSynced("cookie synced from host");
  return { ok: true };
}

async function _soop_loginClearCookie() {
  _soop_loginMarkCleared();
  return { ok: true };
}

async function _soop_loginSetCredential() {
  const status = _soop_loginMarkSynced("credential synced from host");
  return Object.assign({ ok: true }, status);
}

async function _soop_loginClearCredential() {
  const status = _soop_loginMarkCleared();
  return Object.assign({ ok: true }, status);
}

async function _soop_loginGetCredentialStatus() {
  return _soop_loginGetCredentialStatusSnapshot();
}

globalThis.__lp_plugin_soop_1_0_10_login = {
  request: _soop_loginRequest,
  setCookie: _soop_loginSetCookie,
  clearCookie: _soop_loginClearCookie,
  setCredential: _soop_loginSetCredential,
  clearCredential: _soop_loginClearCredential,
  getCredentialStatus: _soop_loginGetCredentialStatus,
  validateCredential: _soop_loginValidateCredential
};
