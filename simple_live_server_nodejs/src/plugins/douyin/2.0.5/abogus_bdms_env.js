/**
 * Environment stubs for bdms a_bogus runtime in Host/JSCore.
 * Must load BEFORE abogus_bdms_sdk.js.
 */
(function (root) {
  "use strict";
  var g = root || (typeof globalThis !== "undefined" ? globalThis : this);
  if (!g.window) g.window = g;
  if (!g.self) g.self = g;
  if (!g.globalThis) g.globalThis = g;

  function emptyFn() {}
  function noopObj() {
    return {};
  }

  if (typeof g.atob !== "function") {
    g.atob = function (input) {
      var chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      var str = String(input).replace(/=+$/, "");
      var output = "";
      if (str.length % 4 === 1) {
        throw new Error("Invalid base64");
      }
      for (
        var bc = 0, bs, buffer, idx = 0;
        (buffer = str.charAt(idx++));
        ~buffer &&
        ((bs = bc % 4 ? bs * 64 + buffer : buffer),
        bc++ % 4)
          ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
          : 0
      ) {
        buffer = chars.indexOf(buffer);
      }
      return output;
    };
  }
  if (typeof g.btoa !== "function") {
    g.btoa = function (input) {
      var chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      var str = String(input);
      var output = "";
      for (
        var block, charCode, idx = 0, map = chars;
        str.charAt(idx | 0) || ((map = "="), idx % 1);
        output += map.charAt(63 & (block >> (8 - (idx % 1) * 8)))
      ) {
        charCode = str.charCodeAt((idx += 3 / 4));
        if (charCode > 0xff) throw new Error("invalid btoa");
        block = (block << 8) | charCode;
      }
      return output;
    };
  }

  var nav = g.navigator || {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    platform: "MacIntel",
    language: "zh-CN",
    languages: ["zh-CN", "zh"],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    vendor: "Google Inc.",
    webdriver: false,
    cookieEnabled: true,
    plugins: { length: 0, item: function () { return null; }, namedItem: function () { return null; } },
    mimeTypes: { length: 0 },
    connection: { effectiveType: "4g", rtt: 50, downlink: 10 },
    permissions: {
      query: function () {
        return Promise.resolve({ state: "prompt" });
      },
    },
  };
  g.navigator = nav;

  var screenObj = g.screen || {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 960,
    colorDepth: 24,
    pixelDepth: 24,
    orientation: { type: "landscape-primary", angle: 0 },
  };
  g.screen = screenObj;

  var loc = g.location || {
    href: "https://www.douyin.com/",
    protocol: "https:",
    host: "www.douyin.com",
    hostname: "www.douyin.com",
    pathname: "/",
    search: "",
    hash: "",
    origin: "https://www.douyin.com",
    assign: emptyFn,
    replace: emptyFn,
    reload: emptyFn,
    toString: function () {
      return this.href;
    },
  };
  g.location = loc;

  if (!g.document) {
    g.document = {
      cookie: "",
      title: "",
      referrer: "https://www.douyin.com/",
      documentElement: { style: {}, clientWidth: 1440, clientHeight: 900 },
      body: { clientWidth: 1440, clientHeight: 900, children: [] },
      head: { children: [] },
      createElement: function () {
        return {
          style: {},
          children: [],
          setAttribute: emptyFn,
          getAttribute: function () {
            return null;
          },
          appendChild: function (c) {
            return c;
          },
          getContext: function () {
            return {
              fillRect: emptyFn,
              fillText: emptyFn,
              measureText: function () {
                return { width: 10 };
              },
              getImageData: function () {
                return { data: [] };
              },
              canvas: {
                toDataURL: function () {
                  return "data:image/png;base64,AAAA";
                },
              },
            };
          },
          toDataURL: function () {
            return "data:image/png;base64,AAAA";
          },
          width: 300,
          height: 150,
        };
      },
      getElementById: function () {
        return null;
      },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
      addEventListener: emptyFn,
      removeEventListener: emptyFn,
      defaultView: g,
      location: loc,
    };
  }

  if (!g.performance) {
    var t0 = Date.now();
    g.performance = {
      now: function () {
        return Date.now() - t0;
      },
      timeOrigin: t0,
      timing: { navigationStart: t0 },
      getEntriesByType: function () {
        return [];
      },
      getEntries: function () {
        return [];
      },
      mark: emptyFn,
      measure: emptyFn,
    };
  }

  if (!g.crypto) {
    g.crypto = {
      getRandomValues: function (arr) {
        for (var i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
    };
  }

  if (typeof g.innerWidth !== "number") g.innerWidth = 1440;
  if (typeof g.innerHeight !== "number") g.innerHeight = 900;
  if (typeof g.outerWidth !== "number") g.outerWidth = 1440;
  if (typeof g.outerHeight !== "number") g.outerHeight = 900;
  if (typeof g.devicePixelRatio !== "number") g.devicePixelRatio = 2;
  if (!g.onwheelx) g.onwheelx = { _Ax: "0X21" };
  if (typeof g.__ac_referer === "undefined") g.__ac_referer = "";
  if (!g.chrome) g.chrome = { runtime: {} };
  if (typeof g.addEventListener !== "function") g.addEventListener = emptyFn;
  if (typeof g.removeEventListener !== "function") g.removeEventListener = emptyFn;
  if (typeof g.XMLHttpRequest !== "function") {
    g.XMLHttpRequest = function () {
      this.open = emptyFn;
      this.setRequestHeader = emptyFn;
      this.send = emptyFn;
      this.addEventListener = emptyFn;
    };
  }
  if (typeof g.fetch !== "function") {
    g.fetch = function () {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({});
        },
        text: function () {
          return Promise.resolve("");
        },
      });
    };
  }
  if (typeof g.localStorage === "undefined") {
    var store = {};
    g.localStorage = {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (k, v) {
        store[k] = String(v);
      },
      removeItem: function (k) {
        delete store[k];
      },
      clear: function () {
        store = {};
      },
    };
  }
  if (typeof g.sessionStorage === "undefined") g.sessionStorage = g.localStorage;

  // free vars used by bdms outer scopes (non-strict assignment targets)
  g.nr = g.nr;
  g.qt = g.qt;
  g.Ht = g.Ht;
  g.vt = g.vt;
  g.Nt = g.Nt;
  g.Yt = g.Yt;
  g.N = g.N;
  g.cr = g.cr;
  g.ar = g.ar;
  g.fr = g.fr;
  g.lr = g.lr;
  g.pr = g.pr;
  g.vr = g.vr;
  g.hr = g.hr;
  g.Qt = g.Qt;
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this
);
