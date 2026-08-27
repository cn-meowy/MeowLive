const _bili_loginPlatformId = "bilibili";
const _bili_loginUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const _bili_loginReferer = "https://www.bilibili.com/";
const _bili_loginRuntime = {
  credentialSynced: false,
  credentialStatus: {
    state: "missing",
    expireAt: 0,
    userId: "",
    userName: "",
    message: ""
  }
};

function _bili_loginTrim(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function _bili_loginToNumber(value, defaultValue) {
  if (value === null || value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function _bili_loginBuildCredentialStatus(status) {
  const source = status && typeof status === "object" ? status : {};
  return {
    state: _bili_loginTrim(source.state) || "unknown",
    expireAt: _bili_loginToNumber(source.expireAt, 0),
    userId: _bili_loginTrim(source.userId),
    userName: _bili_loginTrim(source.userName),
    message: _bili_loginTrim(source.message)
  };
}

function _bili_loginSetCredentialStatus(status) {
  _bili_loginRuntime.credentialStatus = _bili_loginBuildCredentialStatus(status);
  return _bili_loginGetCredentialStatusSnapshot();
}

function _bili_loginGetCredentialStatusSnapshot() {
  return _bili_loginBuildCredentialStatus(_bili_loginRuntime.credentialStatus);
}

function _bili_loginParseJSON(text, fallback) {
  try {
    return JSON.parse(text === undefined || text === null ? "{}" : String(text));
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}

function _bili_loginMarkSynced(message) {
  _bili_loginRuntime.credentialSynced = true;
  return _bili_loginSetCredentialStatus({
    state: "unknown",
    expireAt: 0,
    userId: "",
    userName: "",
    message: _bili_loginTrim(message) || "credential synced; validation pending"
  });
}

function _bili_loginMarkCleared() {
  _bili_loginRuntime.credentialSynced = false;
  return _bili_loginSetCredentialStatus({
    state: "missing",
    expireAt: 0,
    userId: "",
    userName: "",
    message: ""
  });
}

async function _bili_loginRequest(request, authMode) {
  return await Host.http.request({
    platformId: _bili_loginPlatformId,
    authMode: authMode || "none",
    request: request || {}
  });
}

function _bili_loginAuthFailureStatus(httpCode, obj, hasCredential) {
  const code = _bili_loginToNumber(obj && obj.code, 0);
  const message = _bili_loginTrim((obj && (obj.message || obj.msg)) || "");
  if (httpCode === 412 || code === -352) {
    return {
      state: "risk_control",
      message: message || "bilibili credential blocked by risk control"
    };
  }
  if (httpCode === 401 || httpCode === 403) {
    return {
      state: hasCredential ? "expired" : "missing",
      message: message || "bilibili credential expired"
    };
  }
  if (code === -101) {
    return {
      state: hasCredential ? "invalid" : "missing",
      message: message || "bilibili login required"
    };
  }
  return {
    state: hasCredential ? "invalid" : "missing",
    message: message || "bilibili credential validation failed"
  };
}

async function _bili_loginGetLoginUID(authMode) {
  try {
    const resp = await _bili_loginRequest({
      url: "https://api.bilibili.com/x/web-interface/nav",
      method: "GET",
      headers: {
        "User-Agent": _bili_loginUA,
        Referer: _bili_loginReferer
      },
      timeout: 20
    }, authMode || "platform_cookie");
    const obj = _bili_loginParseJSON(resp && resp.bodyText, {}) || {};
    const mid = obj && obj.data ? obj.data.mid : null;
    return String(mid || "0");
  } catch (e) {
    return "0";
  }
}

async function _bili_loginValidateCredential() {
  const resp = await _bili_loginRequest({
    url: "https://api.bilibili.com/x/web-interface/nav",
    method: "GET",
    headers: {
      "User-Agent": _bili_loginUA,
      Referer: _bili_loginReferer
    },
    timeout: 20
  }, "platform_cookie");

  const httpCode = _bili_loginToNumber(resp && (resp.statusCode || resp.status), 0);
  const obj = _bili_loginParseJSON(resp && resp.bodyText, {}) || {};
  const data = obj && typeof obj.data === "object" ? obj.data : {};
  const isLogin = data.isLogin === true || _bili_loginToNumber(data.isLogin, 0) === 1;
  const responseCode = _bili_loginToNumber(obj && obj.code, 0);
  const hasCredential = !!_bili_loginRuntime.credentialSynced;

  if (httpCode >= 400 || responseCode !== 0 || !isLogin) {
    const failure = _bili_loginAuthFailureStatus(httpCode, obj, hasCredential);
    return _bili_loginSetCredentialStatus({
      state: failure.state,
      expireAt: 0,
      userId: String(data.mid || ""),
      userName: _bili_loginTrim(data.uname),
      message: failure.message
    });
  }

  return _bili_loginSetCredentialStatus({
    state: "valid",
    expireAt: 0,
    userId: String(data.mid || ""),
    userName: _bili_loginTrim(data.uname),
    message: ""
  });
}

async function _bili_loginSetCookie() {
  _bili_loginMarkSynced("cookie synced from host");
  return { ok: true };
}

async function _bili_loginClearCookie() {
  _bili_loginMarkCleared();
  return { ok: true };
}

async function _bili_loginSetCredential() {
  const status = _bili_loginMarkSynced("credential synced from host");
  return Object.assign({ ok: true }, status);
}

async function _bili_loginClearCredential() {
  const status = _bili_loginMarkCleared();
  return Object.assign({ ok: true }, status);
}

async function _bili_loginGetCredentialStatus() {
  return _bili_loginGetCredentialStatusSnapshot();
}

globalThis.__lp_plugin_bilibili_1_0_11_login = {
  request: _bili_loginRequest,
  getLoginUID: _bili_loginGetLoginUID,
  setCookie: _bili_loginSetCookie,
  clearCookie: _bili_loginClearCookie,
  setCredential: _bili_loginSetCredential,
  clearCredential: _bili_loginClearCredential,
  getCredentialStatus: _bili_loginGetCredentialStatus,
  validateCredential: _bili_loginValidateCredential
};
