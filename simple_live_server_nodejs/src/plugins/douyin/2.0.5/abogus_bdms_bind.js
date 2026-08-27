/**
 * Bind bdms __ab_sign as the plugin a_bogus entry.
 * Must load AFTER abogus_bdms_sdk.js.
 */
(function (root) {
  "use strict";
  var g = root || (typeof globalThis !== "undefined" ? globalThis : this);

  function callSign(query, userAgent) {
    var sign = g.__ab_sign;
    if (typeof sign !== "function") return "";
    var ua =
      userAgent ||
      (g.navigator && g.navigator.userAgent) ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    // fn[103]/fn[150] convention: (1, 0, 8, query, body, ua, pageId, aid, version)
    var token = sign(1, 0, 8, String(query || ""), "", ua, 0, 6383, "1.0.1.19-fix.01");
    return token == null ? "" : String(token);
  }

  g.__lp_douyin_abogus_sign = callSign;

  // Override classic sign_datail if already defined later; index.js also checks this.
  g.__lp_douyin_abogus_ready = typeof g.__ab_sign === "function";
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this
);
