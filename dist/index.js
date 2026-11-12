"use strict";

// ../checks/src/hygiene.ts
var MAX_DESCRIPTION_LEN = 2048;
var ZERO_WIDTH = /[​-‏⁠-⁤﻿᠎]/u;
var TAG_CHARS = /[\u{E0000}-\u{E007F}]/u;
var BIDI = /[‪-‮⁦-⁩]/u;
var PUA = /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;
var ORTHOGRAPHIC_SCRIPTS = [
  new RegExp("\\p{Script_Extensions=Arabic}", "u"),
  new RegExp("\\p{Script_Extensions=Devanagari}", "u"),
  new RegExp("\\p{Script_Extensions=Bengali}", "u"),
  new RegExp("\\p{Script_Extensions=Gurmukhi}", "u"),
  new RegExp("\\p{Script_Extensions=Gujarati}", "u"),
  new RegExp("\\p{Script_Extensions=Oriya}", "u"),
  new RegExp("\\p{Script_Extensions=Tamil}", "u"),
  new RegExp("\\p{Script_Extensions=Telugu}", "u"),
  new RegExp("\\p{Script_Extensions=Kannada}", "u"),
  new RegExp("\\p{Script_Extensions=Malayalam}", "u"),
  new RegExp("\\p{Script_Extensions=Sinhala}", "u"),
  new RegExp("\\p{Script_Extensions=Syriac}", "u"),
  new RegExp("\\p{Script_Extensions=Thaana}", "u")
];
var MARK = new RegExp("\\p{M}", "u");
var UNASSIGNED = new RegExp("\\p{Cn}", "u");
var PICTOGRAPHIC = new RegExp("\\p{Extended_Pictographic}", "u");
var ZWNJ = 8204;
var ZWJ = 8205;
function letterBefore(text, end) {
  let i = end;
  while (i > 0) {
    const lowAt = i - 1;
    const start = lowAt > 0 && /[\uDC00-\uDFFF]/.test(text[lowAt]) && /[\uD800-\uDBFF]/.test(text[lowAt - 1]) ? lowAt - 1 : lowAt;
    const ch = String.fromCodePoint(text.codePointAt(start));
    if (!MARK.test(ch)) return ch;
    i = start;
  }
  return void 0;
}
function letterAfter(text, start) {
  let i = start;
  while (i < text.length) {
    const ch = String.fromCodePoint(text.codePointAt(i));
    if (!MARK.test(ch)) return ch;
    i += ch.length;
  }
  return void 0;
}
function orthographicJoiner(text, at) {
  const cp = text.charCodeAt(at);
  if (cp !== ZWNJ && cp !== ZWJ) return false;
  if (at > 0 && ZERO_WIDTH.test(text[at - 1]) || at + 1 < text.length && ZERO_WIDTH.test(text[at + 1])) return false;
  const before = letterBefore(text, at);
  const after = letterAfter(text, at + 1);
  if (before === void 0 || after === void 0 || UNASSIGNED.test(before) || UNASSIGNED.test(after)) return false;
  if (cp === ZWJ && PICTOGRAPHIC.test(before) && PICTOGRAPHIC.test(after)) return true;
  return ORTHOGRAPHIC_SCRIPTS.some((script) => script.test(before) && script.test(after));
}
function zeroWidthSignal(text) {
  const all = new RegExp(ZERO_WIDTH.source, "gu");
  for (let m = all.exec(text); m !== null; m = all.exec(text)) {
    if (!orthographicJoiner(text, m.index)) return { index: m.index, char: m[0] };
  }
  return null;
}
var CONCEAL_FROM_USER = /\bdo\s+not\s+(tell|inform|mention|reveal|show)\s+(the\s+)?(user|human)\b/gi;
var CONCEAL_CLOSES = /\s*([.,;:!)]|$|(about|that\s+you|what\s+you|how\s+you|anything|any\s+of)\b)/iy;
var CONCEAL_FOLLOWS = [/['’]s\b/iy, /[ \t]+-/iy, /[ \t]*[–—]/iy, /[ \t]*\r?\n/iy, /\s+(that|what|why|where|how|this|any)\b/iy];
var FLOW_OR_STOP = /[.,;!?\n，。！？；]|\b(until|unless|yet|before|after|otherwise|once|while|if|when)\b/gi;
function matchedAt(re, text, at) {
  re.lastIndex = at;
  const m = re.exec(text);
  return m === null ? -1 : m[0].length;
}
function concealFromUser(input) {
  const text = String(input);
  let from = 0, to = -1, flow = false;
  const flowBeforeStop = (after) => {
    if (after < from || after > to) {
      FLOW_OR_STOP.lastIndex = after;
      const next = FLOW_OR_STOP.exec(text);
      from = after;
      to = next === null ? text.length : next.index;
      flow = next !== null && next[1] !== void 0;
    }
    return flow;
  };
  for (const m of text.matchAll(CONCEAL_FROM_USER)) {
    const end = m.index + m[0].length;
    if (matchedAt(CONCEAL_CLOSES, text, end) >= 0) return m.index;
    for (const follow of CONCEAL_FOLLOWS) {
      const length = matchedAt(follow, text, end);
      if (length >= 0 && !flowBeforeStop(end + length)) return m.index;
    }
  }
  return null;
}
var IMPERATIVES = [
  [/\bignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\b/i, "\u5305\u542B\u300Cignore previous\u300D\u7C7B\u6307\u4EE4"],
  [/\bdisregard\s+(all\s+|any\s+)?(previous|prior|above|the)\b/i, "\u5305\u542B\u300Cdisregard previous\u300D\u7C7B\u6307\u4EE4"],
  // Suite 0.17.0: only when what follows "the user" makes it concealment from the
  // user (about…, that you…, what you…, anything, or the clause ends there).
  // "Do not tell the user X until Y" is an ordinary flow instruction and no
  // longer counts.
  // Suite 0.18.0 also counts 's, a spaced dash, a line break, or that / what / why /
  // where / how / this / any next, unless the clause that follows has a flow
  // word (until, unless, yet, before, after, otherwise, once, while, if, when).
  // Every alternative is suite 0.16.0's pattern followed by a lookahead, so it
  // can only flag what 0.16.0 flagged. Suite 0.19.0: the flow-word lookahead
  // stops at a comma and at ，。！？； as well, as a clause does in clauseAt.
  // Suite 0.19.1: the same rule, as the scan concealFromUser.
  [concealFromUser, "\u8981\u6C42\u5BF9\u7528\u6237\u9690\u7792\u4FE1\u606F"],
  // Suite 0.17.0: only the prompt of the assistant reading this ("your system
  // prompt"), or one being extracted or overridden. A system_prompt parameter, an
  // agent's configured prompt, or "never treat it as a system prompt" no longer counts.
  // Suite 0.18.0 widens the verbs (show, return, display, replace, dump, echo,
  // act as), allows out / previous / prior / above / earlier / original /
  // contents of between, and counts "your new …" and a line that starts with
  // "system prompt:" or "system prompt override". Each alternative contains
  // suite 0.16.0's whole pattern, so it can only flag what 0.16.0 flagged.
  [
    /\byour\s+(new\s+)?(system|developer)\s+prompt\b|\b(reveal|print|output|repeat|disclose|leak|ignore|override|disregard|forget|show|return|display|replace|dump|echo|act\s+as)\s+(out\s+)?(the\s+|any\s+|all\s+|your\s+)?((previous|prior|above|earlier|original|contents\s+of)\s+)?(the\s+|your\s+)?(system|developer)\s+prompt\b|(?<=^|\n)[ \t#*>[-]*(system|developer)\s+prompt\b\s*(:|override\b)/i,
    "\u63D0\u53CA system / developer prompt"
  ],
  [/\byou\s+(must|should|shall)\s+(always|never)\b/i, "\u5BF9\u52A9\u624B\u4E0B\u8FBE\u7EDD\u5BF9\u6307\u4EE4"],
  [/\bbefore\s+(using|calling)\s+any\s+other\s+tool\b/i, "\u8BD5\u56FE\u62A2\u5360\u5176\u4ED6\u5DE5\u5177\u7684\u8C03\u7528\u987A\u5E8F"],
  // 只匹配「动词 + 具体的敏感文件路径」。刻意不匹配 secret / api key 等普通词——
  // 否则会把合法的密钥管理类 MCP 全部误报，而误报是这条检查最大的风险。
  [
    /\b(read|send|upload|post|exfiltrate|dump|cat)\b[\s\S]{0,40}(\.env\b|~\/\.ssh|\bid_rsa\b|\.aws\/credentials|\bnetrc\b|\.npmrc\b)/i,
    "\u63D0\u53CA\u8BFB\u53D6\u6216\u5916\u53D1\u5177\u4F53\u7684\u51ED\u636E\u6587\u4EF6"
  ]
];
var PSEUDO_DELIM = /<\/?(system|instructions?|important|assistant|user)\s*>|\[\/?INST\]|<\|[a-z_]+\|>/i;
var EMBEDDED_MARKUP = /<script\b|<iframe\b|\bon(error|load|click)\s*=|javascript:/i;
var SPEND_LIMIT_NAME = String.raw`(spendControls(\.\w+)?|maxAmountPerPayment|spend(ing)?\s+(limits?|caps?)|payment\s+caps?)`;
var RAISE_OWN_LIMIT = new RegExp(String.raw`\b(raise|increase|disable|turn\s+off)\s+(the\s+|your\s+)?${SPEND_LIMIT_NAME}\b|\bset\s+(the\s+|your\s+)?${SPEND_LIMIT_NAME}\s*(:|=|\s+to)?\s*(false|0)(?![.\w])`, "i");
var PAYS_FROM_OWNER = /\b(pays|charges|spends)\b[^.!?\n。！？]{0,40}?\bfrom\s+(your\s+owner|the\s+user|your\s+human|the\s+human)['’]s\s+(credits?|balance|wallet|funds)\b/i;
var CONFIRMATION = /\b(confirm(s|ed|ing|ation|ations)?|approv(e|es|ed|ing|al|als))\b|\bask(s|ed|ing)?\b[^.!?\n。！？]{0,40}?\bpermission\b/i;
var UNCONFIRMED_SPENDING_PHRASES = [
  // Suite 0.19.0: the same-sentence windows here also end at 。！？.
  /\bpay\b[^.!?\n。！？]{0,40}?\bby\s+default\b/i,
  /\bno\s+(approval|confirmation)\s+(is\s+)?(needed|required)\b/i,
  /\bneed\s+not\s+ask\b|\bzero\s+questions\b/i,
  // Not after never / not / don't ("never buy without asking"), and not asking
  // for something or asking us.
  /\bwithout(?<!\b(never|not|\w+n't)\b[^.!?\n。！？]{0,30}without)\s+asking\b(?!\s+(for|us)\b)/i,
  /\bdoes(\s+not|n't)\s+require\s+per[- ](change|action|call|purchase|payment)\s+approval\b/i,
  /\bthe\s+(grant|allowance|delegation)\s+is\s+(the|your)\s+(permission|approval|consent)\b/i,
  /无需(另行)?确认|视为(用户)?同意/,
  // Accepting every prompt on the user's behalf; an action that keeps going on
  // its own; an agent loop that calls again; reading the local git identity.
  /\b(accept|approve)\s+(all|every|any)\s+(\w+\s+){0,2}?(prompts?|confirmations?|dialogs?|requests?)\b/i,
  /\b(continues|repeats|recurs)\s+automatically\b/i,
  /\b(the|your|this)\s+agent\s+loop\b/i,
  /\bgit\s+config\s+(--\w+\s+)*user\.email\b/i,
  // "Never ask (the user) before charging" and the other spending verbs.
  /\bnever\s+ask\s+(the\s+user\s+)?before\s+(charging|paying|buying|purchasing|spending|billing|renewing|subscribing)\b/i,
  // Suite 0.19.0: selling on what the user or operator entrusted or lent to the assistant.
  /\b(re)?sell(s|ing|able)?\b[^.!?\n。！？]{0,80}?\b(entrusted|lent)\s+(to\s+)?you\b/i,
  RAISE_OWN_LIMIT,
  PAYS_FROM_OWNER
];
var UNPROMPTED_CONTINUATION = /\bwithout\s+(waiting\s+for\s+)?(another|a\s+further|any\s+further|further|a\s+new|a\s+second|an\s+additional|additional)\s+(user|human)\s+(prompts?|messages?|requests?|turns?|repl(y|ies))\b/i;
var SPEND_OR_IDENTITY = /\b(pay|pays|paid|paying|payer|payments?|charg(e|es|ed|ing)|credits?|wallets?|usdc|invoices?|purchas(e|es|ed|ing)|buy(s|ing)?|subscri(be|bes|bed|bing|ption|ptions)|renew(s|ed|al|als)?|bill(s|ed|ing)?|costs?|fees?|refund(s|ed|able)?|spend(s|ing)?|money|identity|e-?mails?)\b|\$\s?\d|扣费|续费|费用|支付|付款|购买|订阅|钱包|邮箱|身份/i;
var LIMIT = /\b(caps?|capped|limits?|ceilings?|max|maximum|polic(y|ies)|mandates?|allow-?list(ed)?|white-?list(ed)?|thresholds?|quotas?)\b|上限|额度|限额|策略|白名单/i;
var NO_COST_OR_NOT_SENT = /\bcosts?\s+(\w+\s+){0,2}?nothing\b|(?<!\bfeel\s+)\bfree\b|\bno\s+(charges?|costs?|fees?)\b|\b(does\s+not|doesn't|do\s+not|don't|never|will\s+not|won't)\s+(send|collect|store|share)s?\b|免费|不收费/i;
var NO_SPEND_ACTION = /\bno\s+purchases?\b|\bread[- ]only\b|\b(does\s+not|doesn't)\s+(buy|purchase|register|charge)\b|\bwhat\s+it\s+costs\b|\bhow\s+much\b/i;
var isClauseEnd = (text, i) => /[,;\n，。！？；]/.test(text[i]) || /[.!?]/.test(text[i]) && (i + 1 === text.length || /\s/.test(text[i + 1]));
var isSentenceEnd = (text, i) => /[\n。！？]/.test(text[i]) || /[.!?]/.test(text[i]) && (i + 1 === text.length || /\s/.test(text[i + 1]));
function endsWithMark(text, i) {
  const c = text.charCodeAt(i);
  return (c === 46 || c === 33 || c === 63) && (i + 1 === text.length || /\s/.test(text[i + 1]));
}
function clauseEndAt(text, i) {
  switch (text.charCodeAt(i)) {
    case 44:
    case 59:
    case 10:
    case 65292:
    case 12290:
    case 65281:
    case 65311:
    case 65307:
      return true;
    default:
      return endsWithMark(text, i);
  }
}
function sentenceEndAt(text, i) {
  switch (text.charCodeAt(i)) {
    case 10:
    case 12290:
    case 65281:
    case 65311:
      return true;
    default:
      return endsWithMark(text, i);
  }
}
function clauseBounds(text, at) {
  const isEnd = typeof text === "string" ? clauseEndAt : isClauseEnd;
  let start = at, end = at;
  while (start > 0 && at - start < 200 && !isEnd(text, start - 1)) start--;
  while (end < text.length && end - at < 200 && !isEnd(text, end)) end++;
  return [start, end];
}
var clauseAt = (text, at) => text.slice(...clauseBounds(text, at));
function sentenceAndNext(text, at) {
  const isEnd = typeof text === "string" ? sentenceEndAt : isSentenceEnd;
  let start = at, end = at, ends = 0;
  while (start > 0 && at - start < 400 && !isEnd(text, start - 1)) start--;
  while (end < text.length && end - at < 800 && !(isEnd(text, end) && ++ends === 2)) end++;
  return text.slice(start, end + 1);
}
var CONCEAL_OUTCOME_VERB = /\b(never|do\s+not|don['’]t)\s+(say|mention|tell|disclose|reveal|state)\b/i;
var CONCEAL_OUTCOME_WORD = /\b(missing|not\s+verified|unverified|failed|absent)\b/i;
var SUBORDINATOR = /\b(because|when|if|unless|since|as|so)\b/i;
function concealedOutcome(text) {
  const verbs = new RegExp(CONCEAL_OUTCOME_VERB.source, "gi");
  for (let m = verbs.exec(text); m !== null; m = verbs.exec(text)) {
    const rest = text.slice(m.index + m[0].length, clauseBounds(text, m.index)[1]);
    const word = CONCEAL_OUTCOME_WORD.exec(rest);
    if (word !== null && !SUBORDINATOR.test(rest.slice(0, word.index))) return m.index;
  }
  return null;
}
function spendOrIdentityNear(text, counts, from, to) {
  const words = new RegExp(SPEND_OR_IDENTITY.source, "gi");
  const near = text.slice(from, to);
  for (let w = words.exec(near); w !== null; w = words.exec(near)) {
    const at = from + w.index;
    let counted = counts.get(at);
    if (counted === void 0) {
      const clause = clauseAt(text, at);
      counted = !NO_COST_OR_NOT_SENT.test(clause) && !NO_SPEND_ACTION.test(clause);
      counts.set(at, counted);
    }
    if (counted) return true;
  }
  return false;
}
function unconfirmedSpending(text) {
  let first = null;
  const counts = /* @__PURE__ */ new Map();
  for (const pattern of UNCONFIRMED_SPENDING_PHRASES) {
    const all = new RegExp(pattern.source, pattern.flags + "g");
    for (let m = all.exec(text); m !== null && (first === null || m.index < first); m = all.exec(text)) {
      if (NO_SPEND_ACTION.test(clauseAt(text, m.index))) continue;
      const near = spendOrIdentityNear(text, counts, Math.max(0, m.index - 200), m.index + m[0].length + 200);
      if (!near || pattern !== RAISE_OWN_LIMIT && LIMIT.test(text.slice(Math.max(0, m.index - 120), m.index))) continue;
      if (pattern === PAYS_FROM_OWNER && CONFIRMATION.test(sentenceAndNext(text, m.index))) continue;
      first = m.index;
    }
  }
  return first;
}
function snippet(s, at) {
  return s.slice(Math.max(0, at - 20), at + 40).replace(/\s+/g, " ");
}
function scanText(text, where, out) {
  const z = zeroWidthSignal(text);
  if (z) out.push({
    flag: "zero_width_chars",
    note: `${where} \u542B\u96F6\u5BBD / \u4E0D\u53EF\u89C1\u5B57\u7B26`,
    at: z.index,
    sample: JSON.stringify(z.char)
  });
  const checks = [
    [TAG_CHARS, "unicode_tag_chars", "\u542B Unicode Tag \u533A\u5B57\u7B26\uFF08\u53EF\u7F16\u7801\u9690\u85CF\u6587\u672C\uFF09"],
    [BIDI, "bidi_override", "\u542B\u53CC\u5411\u8986\u76D6\u63A7\u5236\u7B26\uFF08\u663E\u793A\u987A\u5E8F\u53EF\u4E0E\u5B9E\u9645\u5185\u5BB9\u4E0D\u4E00\u81F4\uFF09"],
    [PUA, "private_use_area", "\u542B\u79C1\u7528\u533A\u5B57\u7B26"]
  ];
  for (const [re, flag, note] of checks) {
    const m = re.exec(text);
    if (m) out.push({
      flag,
      note: `${where} ${note}`,
      at: m.index,
      sample: JSON.stringify(m[0])
    });
  }
  for (const [rule, note] of IMPERATIVES) {
    const at = typeof rule === "function" ? rule(text) : rule.exec(text)?.index ?? null;
    if (at !== null) out.push({
      flag: "injection_imperative",
      note: `${where} ${note}`,
      at,
      sample: snippet(text, at)
    });
  }
  const o = concealedOutcome(text);
  if (o !== null) out.push({
    flag: "injection_imperative",
    note: `${where} \u8981\u6C42\u4E0D\u8BF4\u51FA\u7F3A\u5931\u3001\u672A\u6838\u9A8C\u6216\u5931\u8D25\u7684\u68C0\u67E5`,
    at: o,
    sample: snippet(text, o)
  });
  const s = unconfirmedSpending(text);
  if (s !== null) out.push({
    flag: "unconfirmed_spending",
    note: `${where} \u672A\u7ECF\u9010\u6B21\u786E\u8BA4\u7684\u82B1\u8D39\u6216\u8EAB\u4EFD\u4FE1\u606F\u53D1\u9001`,
    at: s,
    sample: snippet(text, s)
  });
  const c = UNPROMPTED_CONTINUATION.exec(text);
  if (c) out.push({
    flag: "unprompted_continuation",
    note: `${where} \u8981\u6C42\u4E0D\u7B49\u7528\u6237\u518D\u6B21\u63D0\u51FA\u5C31\u7EE7\u7EED\u5DE5\u4F5C`,
    at: c.index,
    sample: snippet(text, c.index)
  });
  const d = PSEUDO_DELIM.exec(text);
  if (d) out.push({
    flag: "pseudo_system_delimiter",
    note: `${where} \u542B\u4F2A\u9020\u7684\u7CFB\u7EDF\u8FB9\u754C\u6807\u8BB0`,
    at: d.index,
    sample: snippet(text, d.index)
  });
  const e = EMBEDDED_MARKUP.exec(text);
  if (e) out.push({
    flag: "embedded_markup",
    note: `${where} \u542B\u53EF\u6267\u884C\u6807\u8BB0`,
    at: e.index,
    sample: snippet(text, e.index)
  });
}
function checkTool(tool) {
  const out = [];
  scanText(tool.name, `\u5DE5\u5177\u540D '${tool.name}'`, out);
  if (/[^\x20-\x7E]/.test(tool.name)) {
    out.push({
      flag: "non_ascii_tool_name",
      note: `\u5DE5\u5177\u540D '${tool.name}' \u542B\u975E ASCII \u5B57\u7B26\uFF08\u53EF\u80FD\u662F\u540C\u5F62\u5B57\u5192\u5145\uFF09`
    });
  }
  const desc = tool.description ?? "";
  if (desc.length > MAX_DESCRIPTION_LEN) {
    out.push({
      flag: "excessive_length",
      note: `\u5DE5\u5177 '${tool.name}' \u7684 description \u957F\u5EA6 ${desc.length} \u8D85\u8FC7 ${MAX_DESCRIPTION_LEN}`
    });
  }
  scanText(desc, `\u5DE5\u5177 '${tool.name}' \u7684 description`, out);
  return out;
}
function runHygieneCheck(tools) {
  const flags_by_tool = {};
  const details = [];
  let hitTools = 0;
  let riskTools = 0;
  for (const t of tools) {
    const hits = checkTool(t);
    if (hits.some((h) => h.flag !== "excessive_length")) riskTools++;
    if (hits.length) {
      hitTools++;
      flags_by_tool[t.name] = [...new Set(hits.map((h) => h.flag))];
      for (const h of hits) details.push(`Warn: ${h.note}`);
    }
  }
  details.push(`Info: \u5171\u626B\u63CF ${tools.length} \u4E2A\u5DE5\u5177\uFF0C${tools.length - hitTools} \u4E2A\u672A\u547D\u4E2D\u4EFB\u4F55\u4FE1\u53F7`);
  return {
    // 只报告信号，不推断意图 —— 因此永远不是 FAILED
    assertion_status: riskTools ? "OBSERVED_RISK" : "VERIFIED",
    reason: riskTools ? { key: "hygiene_risk_detected", params: { hitCount: riskTools, totalCount: tools.length } } : { key: "hygiene_no_risk", params: { totalCount: tools.length } },
    details,
    flags_by_tool
  };
}

// ../checks/checks.json
var checks_default = {
  $schema: "https://mcpcheckup.com/schema/checks-registry-v0.1.json",
  registry_version: "0.18.0",
  suite_id: "remote-baseline-v0.1",
  generated_from: "PRD v1.4 \xA75.2 / UI \xA75.2.1 \xA75.2.2",
  groups: [
    {
      key: "reach",
      name_zh: "\u53EF\u8FBE\u6027\u4E0E\u6027\u80FD",
      name_en: "Reachability & Performance",
      order: 1,
      description_zh: "\u8FD9\u4E2A endpoint \u73B0\u5728\u8FD8\u6D3B\u7740\u5417\u3001\u54CD\u5E94\u591A\u5FEB\u3002**\u53EA\u89C2\u6D4B\uFF0C\u4E0D\u5224\u5B9A**\u2014\u2014\u6211\u4EEC\u4E0D\u5B9A\u4E49\u591A\u5C11\u6BEB\u79D2\u7B97\u6162\uFF0C\u90A3\u53D6\u51B3\u4E8E\u4F60\u7684\u7528\u6237\u3002",
      description_en: "Is this endpoint alive right now, and how fast does it respond. **Observation only, no verdict** \u2014 we don't define how many milliseconds counts as slow; that depends on your users."
    },
    {
      key: "proto",
      name_zh: "\u534F\u8BAE\u5951\u7EA6\u6B63\u786E\u6027",
      name_en: "Protocol Contract",
      order: 2,
      description_zh: "\u4F60\u7684 server \u662F\u5426\u771F\u7684\u6309\u5B83\u58F0\u79F0\u7684\u90A3\u7248 MCP \u534F\u8BAE\u8BF4\u8BDD\u3002\u8FD9\u662F\u672C\u4EA7\u54C1\u7684\u4E3B\u4F53\uFF1A\u7EDD\u5927\u591A\u6570\u300Cagent \u7A81\u7136\u7528\u4E0D\u4E86\u300D\u7684\u6545\u969C\u51FA\u5728\u8FD9\u4E00\u5C42\uFF0C\u800C\u4E0D\u662F\u5B89\u5168\u5C42\u3002",
      description_en: 'Whether your server actually speaks the MCP protocol revision it claims to. This is the core of the product: most "the agent suddenly stopped working" failures live at this layer, not the security layer.'
    },
    {
      key: "sec",
      name_zh: "\u5B89\u5168\u536B\u751F",
      name_en: "Security Hygiene",
      order: 3,
      description_zh: "\u516C\u5F00\u53EF\u89C2\u5BDF\u7684\u57FA\u7840\u5B89\u5168\u5C5E\u6027\u3002**\u8FD9\u4E0D\u662F\u5B89\u5168\u626B\u63CF**\u2014\u2014\u6211\u4EEC\u4E0D\u6D4B prompt injection\u3001\u6570\u636E\u5916\u6CC4\u3001\u6743\u9650\u6EE5\u7528\uFF0C\u56E0\u4E3A\u90A3\u9700\u8981\u6267\u884C\u4E1A\u52A1\u5DE5\u5177\uFF0C\u800C\u6211\u4EEC\u9ED8\u8BA4\u7981\u6B62\u8FD9\u4E48\u505A\u3002",
      description_en: "Publicly observable baseline security properties. **This is not a security scan** \u2014 we don't test for prompt injection, data exfiltration, or privilege abuse, because those require calling business tools, which we refuse to do by default."
    },
    {
      key: "drift",
      name_zh: "\u5951\u7EA6\u53D8\u66F4\u4E0E\u4F9B\u5E94\u94FE",
      name_en: "Contract Drift & Supply Chain",
      order: 4,
      description_zh: "\u5DE5\u5177\u96C6\u4E0E Schema \u6709\u6CA1\u6709\u5728\u4F60\u4E0D\u77E5\u60C5\u7684\u60C5\u51B5\u4E0B\u53D8\u8FC7\u3002**\u53EA\u6709\u5728\u4F60\u6279\u51C6\u8FC7\u4E00\u4E2A\u57FA\u7EBF\u4E4B\u540E**\uFF0C\u53D8\u5316\u624D\u4F1A\u88AB\u5224\u4E3A\u300C\u672A\u901A\u8FC7\u300D\uFF1B\u5426\u5219\u5B83\u53EA\u662F\u4E00\u6761\u5DF2\u8BB0\u5F55\u7684\u53D8\u5316\u4E8B\u5B9E\u3002",
      description_en: `Whether the toolset or schema changed without your knowledge. A change is only judged "failed" **after you've approved a baseline**; before that, it's just a recorded fact.`
    }
  ],
  checks: [
    {
      n: 1,
      check_id: "reachability",
      group: "reach",
      docs_version: "v0.5.0",
      predicate_zh: "endpoint \u5728\u9884\u7B97\u5185\u54CD\u5E94",
      predicate_en: "endpoint responds within budget",
      failure_status: null,
      requires_baseline: false,
      explain: {
        what_zh: "endpoint \u5728\u7ED9\u5B9A\u9884\u7B97\u5185\u662F\u5426\u8FD4\u56DE\u54CD\u5E94\uFF0C\u5E76\u8BB0\u5F55\u5EF6\u8FDF\u5206\u5E03\u3002",
        what_en: "Whether the endpoint returns a response within the given budget, and the latency distribution.",
        how_zh: "\u6211\u4EEC\u7684\u63E1\u624B\u4EA4\u6362\u4EE5 endpoint \u7684 HTTP \u56DE\u5E94\u7ED3\u675F\u65F6\uFF08\u4EFB\u4F55\u72B6\u6001\u7801\u90FD\u7B97\uFF09\uFF0C\u8BB0 VERIFIED\u3002\u5982\u679C\u63A2\u6D4B\u5728\u4EA4\u6362\u7ED3\u675F\u524D\u505C\u4E0B\u2014\u2014\u4F8B\u5982 endpoint \u8981\u6C42\u6211\u4EEC\u7A0D\u540E\u518D\u6765\uFF08429\uFF0C\u6216\u5E26 Retry-After \u7684 503\uFF09\u3001\u67D0\u4E2A\u56DE\u5E94\u8D85\u51FA\u5927\u5C0F\u4E0A\u9650\u3001\u8FDE\u63A5\u51FA\u9519\u3001\u6216\u63A2\u6D4B\u7684\u67D0\u9879\u9884\u7B97\u7528\u5C3D\u2014\u2014\u672C\u9879\u8BB0 UNVERIFIED \u5E76\u9644\u4E0A\u539F\u56E0\uFF0C\u5373\u4F7F endpoint \u5DF2\u7ECF\u7B54\u590D\u8FC7\u4E4B\u524D\u7684\u8BF7\u6C42\u3002\u6574\u6B21\u63A2\u6D4B\uFF08\u542B\u63E1\u624B\uFF09\u90FD\u5728\u786C\u4E0A\u9650\u5185\u8FDB\u884C\uFF1A\u603B\u5171 8 \u4E2A\u8BF7\u6C42\u300110 s\uFF0C\u6BCF\u4E2A\u56DE\u5E94 2 MB\u3002\u8BFB\u53D6\u8F83\u957F\u5DE5\u5177\u5217\u8868\u7684\u540E\u7EED\u9875\uFF0C\u6700\u591A\u5728 8 \u4E2A\u8BF7\u6C42\u4E4B\u5916\u518D\u52A0 9 \u4E2A\uFF0C\u540C\u6837\u53D7 10 s \u548C\u6BCF\u4E2A\u56DE\u5E94 2 MB \u7684\u9650\u5236\u3002",
        how_en: "Recorded as VERIFIED when our handshake exchange finishes with an HTTP response from the endpoint, whatever its status. If the probe stops before the exchange finishes \u2014 for example because the endpoint asks us to back off (429, or 503 with Retry-After), a response is over the size limit, the connection fails, or one of the probe's budgets runs out \u2014 this check is UNVERIFIED, with that reason, even if the endpoint had already answered an earlier request. The whole probe, handshake included, runs under hard caps: 8 requests and 10s in total, and 2MB per response. Reading the further pages of a long tool list adds at most 9 requests to the 8; they share the same 10s and the 2MB limit per response.",
        cannot_zh: "\u8D85\u65F6\u4E0D\u7B49\u4E8E\u4F60\u6302\u4E86\u2014\u2014\u4E5F\u53EF\u80FD\u662F\u6211\u4EEC\u8FD9\u8FB9\u7684\u7F51\u7EDC\u3002\u6240\u4EE5\u8D85\u9884\u7B97\u8BB0 UNVERIFIED \u800C\u4E0D\u662F FAILED\u3002\u76EE\u5F55\u91CC\u7684\u5728\u7EBF\u7387\u53E3\u5F84\u66F4\u4E25\uFF1A\u5F53\u5929\u4EFB\u4F55\u4E00\u6B21\u63A2\u6D4B\u5728\u9884\u7B97\u5185\u6CA1\u6709\u6536\u5230\u5B8C\u6574\u5E94\u7B54\uFF0C\u8FD9\u4E00\u5929\u7B97\u672A\u5E94\u7B54\u3002",
        cannot_en: "A timeout doesn't mean you're down \u2014 it could be our network. That's why exceeding budget is UNVERIFIED, not FAILED. The directory's online rate is stricter: a day on which any probe got no complete answer within its budget counts as unanswered."
      }
    },
    {
      n: 9,
      check_id: "latency_profile",
      group: "reach",
      docs_version: "v0.3.0",
      predicate_zh: "\u4ECE\u6211\u4EEC\u63A2\u6D4B\u8282\u70B9\u6D4B\u5F97\u7684\u8BF7\u6C42\u54CD\u5E94\u65F6\u95F4 p50 / p95",
      predicate_en: "p50 / p95 response time of our requests, measured from our probe node",
      failure_status: null,
      observation_only: true,
      requires_baseline: false,
      explain: {
        what_zh: "\u5355\u6B21 run \u5185\uFF0C\u6211\u4EEC\u53D1\u5F80\u8BE5 endpoint \u7684\u8BF7\u6C42\u4ECE\u53D1\u51FA\u5230\u6536\u5230\u54CD\u5E94\u5934\u7684\u8017\u65F6\uFF1A\u4E2D\u4F4D\u6570\uFF08p50\uFF09\u3001\u7B2C 95 \u767E\u5206\u4F4D\uFF08p95\uFF09\uFF0C\u4EE5\u53CA\u8BA1\u65F6\u7684\u8BF7\u6C42\u6570 n\u3002",
        what_en: "Within one run: the median (p50) and 95th-percentile (p95) time from sending a request to this endpoint to receiving its response headers, and how many requests were timed (n).",
        how_zh: "**\u4E0D\u505A\u5224\u5B9A\u3002** VERIFIED \u53EA\u8868\u793A\u6D4B\u5230\u4E86\uFF0C\u4E0D\u8868\u793A\u5FEB\uFF1A\u6211\u4EEC\u4E0D\u8BBE\u9608\u503C\uFF0C\u4E5F\u4E0D\u6309\u901F\u5EA6\u7ED9 server \u6392\u540D\u3002\u672C\u8F6E\u4E2D\u53D1\u5F80\u8BE5 endpoint\u3001\u6536\u5230 HTTP \u56DE\u5E94\u7684\u6BCF\u4E2A\u8BF7\u6C42\u90FD\u8BA1\u65F6\uFF0C\u4E0D\u8BBA\u72B6\u6001\u7801\uFF1B\u6CA1\u6536\u5230\u56DE\u5E94\u7684\u4E0D\u8BA1\u3002\u8BA1\u65F6\u4ECE\u8BF7\u6C42\u53D1\u51FA\u524D\u5F00\u59CB\uFF0C\u5230\u6536\u5230\u54CD\u5E94\u5934\u4E3A\u6B62\uFF0C\u4E0D\u542B\u6211\u4EEC\u81EA\u5DF1\u7684 DNS \u6821\u9A8C\uFF0C\u4E5F\u4E0D\u542B\u54CD\u5E94\u4F53\u7684\u4E0B\u8F7D\u3002p50\u3001p95 \u6309\u6700\u8FD1\u79E9\u53D6\u81EA n \u4E2A\u8BA1\u65F6\u8BF7\u6C42\uFF1B\u5C11\u4E8E 20 \u4E2A\u8BF7\u6C42\u65F6\uFF0Cp95 \u5C31\u662F\u5176\u4E2D\u6700\u6162\u7684\u4E00\u4E2A\u3002\u63E1\u624B\u9636\u6BB5\u5C31\u505C\u5728\u8BA4\u8BC1\u8D28\u8BE2\u7684\u8FD0\u884C\u4E0D\u8BB0\u5F55\u65F6\u95F4\u3002\u4E00\u4E2A\u8BA1\u65F6\u8BF7\u6C42\u90FD\u6CA1\u6709\u65F6\uFF0C\u672C\u9879\u8BB0 UNVERIFIED\u3002",
        how_en: "**No verdict is made.** VERIFIED means the time was measured, not that it was fast: we set no threshold and do not rank servers by speed. Every request to the endpoint in the run that got an HTTP response is timed, whatever its status; a request that got none is not. The timer runs from just before the request is sent until the response headers arrive, so our own DNS checks and the download of the body are not included. p50 and p95 are nearest-rank values over the n timed requests; with fewer than 20 requests, p95 is the slowest of them. A run that stops at an authentication challenge during the handshake records no time. With no timed request, this check is UNVERIFIED.",
        cannot_zh: "\u8FD9\u662F\u6211\u4EEC\u63A2\u6D4B\u8282\u70B9\u770B\u5230\u7684\u503C\uFF0C\u4E0D\u4EE3\u8868\u4F60\u7684\u7528\u6237\u770B\u5230\u7684\u503C\u3002\u5176\u4E2D\u5305\u542B\u6211\u4EEC\u8282\u70B9\u5230\u4F60 endpoint \u4E4B\u95F4\u7684\u7F51\u7EDC\u3001\u5EFA\u7ACB\u8FDE\u63A5\u7684\u65F6\u95F4\uFF0C\u4EE5\u53CA\u5728\u6211\u4EEC\u81EA\u5DF1 Worker \u91CC\u7684\u7B49\u5F85\u3002",
        cannot_en: "This is what our probe node observed, not what your users see. It includes the network between our node and your endpoint, setting up the connection, and any wait inside our own Worker."
      }
    },
    {
      n: 2,
      check_id: "transport_type",
      group: "proto",
      docs_version: "v0.2.0",
      predicate_zh: "\u7AEF\u70B9\u7ECF\u6240\u7528\u4F20\u8F93\u56DE\u5E94\u4E86\u63E1\u624B\u8BF7\u6C42",
      predicate_en: "the endpoint answered our handshake request over the transport used",
      failure_status: null,
      requires_baseline: false,
      explain: {
        what_zh: "\u672C\u6B21\u63A2\u6D4B\u6240\u7528\u7684\u4F20\u8F93\u7C7B\u578B\uFF0C\u4EE5\u53CA\u7AEF\u70B9\u662F\u5426\u7ECF\u8BE5\u4F20\u8F93\u4F5C\u51FA\u56DE\u5E94\u3002",
        what_en: "The transport this probe used to reach the server, and whether the endpoint answered over it.",
        how_zh: "\u6211\u4EEC\u7ECF\u8BE5\u4F20\u8F93\u7684\u63E1\u624B\u4EA4\u6362\u4EE5\u7AEF\u70B9\u7684 HTTP \u56DE\u5E94\u7ED3\u675F\u65F6\uFF0C\u8BB0 VERIFIED\uFF0C\u65E0\u8BBA\u63E1\u624B\u672C\u8EAB\u662F\u5426\u6210\u529F\uFF08\u90A3\u7531 discovery_handshake \u5224\u5B9A\uFF09\u3002\u5982\u679C\u63A2\u6D4B\u5728\u4EA4\u6362\u7ED3\u675F\u524D\u505C\u4E0B\u2014\u2014\u4F8B\u5982\u7AEF\u70B9\u8981\u6C42\u6211\u4EEC\u7A0D\u540E\u518D\u6765\u3001\u67D0\u4E2A\u56DE\u5E94\u8D85\u51FA\u63A2\u6D4B\u7684\u5927\u5C0F\u4E0A\u9650\u3001\u6216\u63A2\u6D4B\u7684\u67D0\u9879\u9884\u7B97\u7528\u5C3D\u2014\u2014\u672C\u9879\u4E0D\u8BB0 VERIFIED\uFF0C\u5E76\u540C\u65F6\u8BB0\u4E0B\u539F\u56E0\u3002\u4E0D\u4F1A\u4E0E server \u58F0\u660E\u7684\u4F20\u8F93\u505A\u6BD4\u5BF9\u3002",
        how_en: "Recorded as VERIFIED when our handshake exchange over that transport finishes with an HTTP response from the endpoint, whether or not the handshake itself succeeds \u2014 that is discovery_handshake's verdict. If the probe stops before the exchange finishes \u2014 for example because the endpoint asks us to back off, a response is over the probe's size limit, or one of the probe's budgets runs out \u2014 this check is not recorded as VERIFIED, and the reason is recorded with it. It is not compared against any transport the server declares.",
        cannot_zh: "\u4E0D\u80FD\u8BF4\u660E\u4F20\u8F93\u5B9E\u73B0\u6709\u6CA1\u6709 bug\u3002",
        cannot_en: "This cannot tell you whether the transport implementation has bugs."
      }
    },
    {
      n: 3,
      check_id: "protocol_revision",
      group: "proto",
      docs_version: "v0.2.0",
      predicate_zh: "\u534F\u8BAE revision \u53EF\u8BC6\u522B",
      predicate_en: "protocol revision is identifiable",
      failure_status: "FAILED",
      no_credential_status: "UNVERIFIED",
      requires_baseline: false,
      revision_matrix: ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"],
      explain: {
        what_zh: "server \u5B9E\u9645\u9075\u5FAA\u7684 MCP \u534F\u8BAE revision\u3002",
        what_en: "The MCP protocol revision the server actually follows.",
        how_zh: "\u80FD\u8BC6\u522B\u5230\u77E9\u9635\u5185\u4EFB\u4E00\u7248\u672C\u5373\u901A\u8FC7\u3002",
        how_en: "Passes if any version within the recognized matrix is identified.",
        cannot_zh: "\u4E0D\u80FD\u8BF4\u660E\u8BE5\u7248\u672C\u5B9E\u73B0\u5F97\u5B8C\u6574\u3002\u5F53\u63E1\u624B\u88AB\u51ED\u636E\u95E8\u63A7\uFF08\u89C1 discovery_handshake\uFF09\uFF0C\u672C\u68C0\u67E5\u7EA7\u8054\u8BB0 UNVERIFIED\uFF08\u539F\u56E0 credential_required\uFF09\uFF1A\u63E1\u624B\u6CA1\u6709\u5B8C\u6210\uFF0C\u4E0D\u4F1A\u62FF\u4EFB\u4F55\u58F0\u660E\u7684\u7248\u672C\u53F7\u53BB\u6BD4\u5BF9\u652F\u6301\u77E9\u9635\u3002",
        cannot_en: "This cannot tell you whether that version is fully implemented. When the handshake is credential-gated (see discovery_handshake), this check cascades to UNVERIFIED with reason credential_required: the handshake never completed, so no declared version is compared against the support matrix."
      }
    },
    {
      n: 4,
      check_id: "discovery_handshake",
      group: "proto",
      docs_version: "v0.3.0",
      predicate_zh: "\u73B0\u4EE3 server/discover \u6216 legacy initialize \u884C\u4E3A\u7B26\u5408\u8BE5 revision \u89C4\u8303",
      predicate_en: "modern server/discover or legacy initialize behavior matches the revision's spec",
      failure_status: "FAILED",
      no_credential_status: "UNVERIFIED",
      requires_baseline: false,
      p0_note_zh: "2026-07-28 \u5DF2\u79FB\u9664\u65E7 initialize / notifications/initialized / Mcp-Session-Id \u6D41\u7A0B\u3002\u4E0D\u5F97\u4EC5\u6309\u65E7\u63E1\u624B\u5224\u5B9A\uFF0C\u5426\u5219\u4F1A\u628A\u6700\u65B0\u5B9E\u73B0\u8BEF\u62A5\u4E3A FAILED\u3002\u5FC5\u987B\u6709 negative-control fixture\u3002",
      p0_note_en: "The 2026-07-28 revision removed the old initialize / notifications/initialized / Mcp-Session-Id flow. Judging solely by the legacy handshake would misreport the newest implementations as FAILED. A negative-control fixture is required.",
      explain: {
        what_zh: "\u73B0\u4EE3 `server/discover` \u6216 legacy initialize \u7684\u884C\u4E3A\u662F\u5426\u7B26\u5408\u8BE5 revision\u3002",
        what_en: "Whether the modern server/discover or legacy initialize handshake behaves according to the identified revision.",
        how_zh: "\u6309\u8BC6\u522B\u5230\u7684 revision \u9009\u62E9\u5BF9\u5E94\u89C4\u8303\u6BD4\u5BF9\u3002",
        how_en: "Compared against the matching spec for whichever revision was identified.",
        cannot_zh: "\u4E0D\u80FD\u8BF4\u660E discovery \u8FD4\u56DE\u7684\u5185\u5BB9\u662F\u51C6\u786E\u7684\u3002\u82E5\u51B3\u5B9A\u63E1\u624B\u7ED3\u679C\u7684\u90A3\u6B21\u54CD\u5E94\u662F 401 \u4E14\u5E26\u6709\u683C\u5F0F\u5408\u6CD5\u7684 WWW-Authenticate \u8D28\u8BE2\uFF0C\u672C\u68C0\u67E5\u8BB0 UNVERIFIED\uFF08\u539F\u56E0 credential_required\uFF09\u800C\u975E FAILED\u2014\u2014\u6211\u4EEC\u4ECE\u4E0D\u53D1\u9001\u51ED\u636E\uFF0C\u65E0\u6CD5\u770B\u5230\u6709\u610F\u8BBE\u7F6E\u7684\u8BBF\u95EE\u63A7\u5236\u95E8\u4E4B\u540E\u7684\u60C5\u51B5\u3002\u65E0\u5408\u6CD5\u8D28\u8BE2\u7684 401\u3001403\u3001\u6216\u9996\u4E2A\u8BF7\u6C42\u4E0A\u5DF2\u8BC6\u522B\u7684 MCP \u534F\u8BAE\u9519\u8BEF\u7801\uFF0C\u90FD\u4E0D\u89C6\u4E3A\u51ED\u636E\u95E8\u63A7\u3002",
        cannot_en: "This cannot tell you whether the content returned by discovery is accurate. If the response that settles the handshake is a 401 carrying a structurally valid WWW-Authenticate challenge, this check records UNVERIFIED with reason credential_required rather than FAILED \u2014 we never send credentials, so we cannot see past a deliberate access-control gate. A 401 without a valid challenge, a 403, or a recognized MCP protocol error code on the first request is not treated as a credential gate."
      }
    },
    {
      n: 5,
      check_id: "tools_list",
      group: "proto",
      docs_version: "v0.3.0",
      predicate_zh: "tools/list \u53EF\u7528\u5E76\u8FD4\u56DE\u5408\u6CD5\u7ED3\u6784",
      predicate_en: "tools/list is available and returns a legal structure",
      failure_status: "FAILED",
      no_credential_status: "UNVERIFIED",
      requires_baseline: false,
      explain: {
        what_zh: "`tools/list` \u662F\u5426\u53EF\u7528\u5E76\u8FD4\u56DE\u7ED3\u6784\u5408\u6CD5\u7684\u5DE5\u5177\u5217\u8868\u3002",
        what_en: "Whether tools/list is available and returns a structurally valid tool list.",
        how_zh: "\u7ED3\u6784\u4E0D\u5408\u6CD5\u5373 FAILED\uFF0C\u56E0\u4E3A\u4E0B\u6E38 agent \u4F1A\u76F4\u63A5\u89E3\u6790\u5931\u8D25\u3002\u670D\u52A1\u5668\u628A\u5217\u8868\u5206\u9875\u65F6\uFF0C\u6211\u4EEC\u6CBF nextCursor \u8BFB\u53D6\u6BCF\u4E00\u9875\uFF0C\u4E00\u6B21 run \u6700\u591A\u8BFB 10 \u9875\u6216 5,000 \u4E2A\u5DE5\u5177\u3002\u7B2C\u4E00\u9875\u4E4B\u540E\u7684\u9875\u4E0D\u8BA1\u5165 8 \u4E2A\u8BF7\u6C42\u7684\u4E0A\u9650\uFF1B10 s \u7684\u65F6\u95F4\u4E0A\u9650\u548C\u6BCF\u4E2A\u56DE\u5E94 2 MB \u7684\u4E0A\u9650\u7167\u6837\u9002\u7528\u3002\u5217\u8868\u8D85\u51FA\u8FD9\u4E2A\u8303\u56F4\uFF0C\u6216\u540E\u9762\u67D0\u4E00\u9875\u8D85\u65F6\u3001\u8BF7\u6C42\u6216\u56DE\u5E94\u8D85\u8FC7 2 MB\u3001\u6216\u8BFB\u4E0D\u51FA\u5DE5\u5177\u5217\u8868\u65F6\uFF0C\u6211\u4EEC\u5C31\u505C\u5728\u90A3\u91CC\u4E0D\u518D\u7FFB\u9875\uFF1A\u672C\u9879\u4ECD\u6309\u7B2C\u4E00\u9875\u5224\u5B9A\uFF0C\u4F9D\u8D56\u5B8C\u6574\u5217\u8868\u7684\u7ED3\u8BBA\u90FD\u4E0D\u8BB0\u4E3A VERIFIED\uFF08\u89C1\u5404\u9879\u68C0\u67E5\uFF09\u3002\u540E\u9762\u67D0\u4E00\u9875\u9047\u5230\u5176\u4ED6\u5931\u8D25\uFF08\u4F8B\u5982\u670D\u52A1\u5668\u8981\u6C42\u6211\u4EEC\u7A0D\u540E\u518D\u6765\uFF0C\u6216\u8FDE\u63A5\u5931\u8D25\uFF09\u65F6\uFF0C\u548C\u5176\u4ED6\u8BF7\u6C42\u4E00\u6837\uFF0C\u672C\u6B21 run \u5C31\u6B64\u7ED3\u675F\u3002",
        how_en: "An invalid structure is FAILED, since a downstream agent would fail to parse it directly. When the server splits its list into pages, we follow nextCursor and read every page, up to 10 pages or 5,000 tools in one run. Pages after the first do not count toward the 8-request limit; the 10s time limit and the 2MB limit per response still apply. If the list is longer than that, or a later page runs out of the time limit, goes over the 2MB limit (in its request or its response) or is not a readable tool list, we stop reading pages there: this check is still judged on the first page, and nothing that depends on the whole list is recorded as VERIFIED (see each check). Any other failure on a later page (for example the server asking us to back off, or a failed connection) ends the run, as it would on any other request.",
        cannot_zh: "\u4E0D\u80FD\u8BF4\u660E\u8FD9\u4E9B\u5DE5\u5177\u771F\u7684\u80FD\u7528\u2014\u2014\u6211\u4EEC\u4E0D\u8C03\u7528\u4E1A\u52A1\u5DE5\u5177\u3002\u82E5\u63E1\u624B\u5DF2\u5B8C\u6210\u4F46 tools/list \u8FD4\u56DE 401 \u4E14\u5E26\u6709\u683C\u5F0F\u5408\u6CD5\u7684 WWW-Authenticate \u8D28\u8BE2\uFF0C\u672C\u68C0\u67E5\u8BB0 UNVERIFIED\uFF08\u539F\u56E0 credential_required\uFF09\u800C\u975E FAILED\uFF1B\u82E5\u63E1\u624B\u672C\u8EAB\u88AB\u51ED\u636E\u95E8\u63A7\uFF0C\u672C\u68C0\u67E5\u7EA7\u8054\u4E3A\u540C\u4E00\u7ED3\u679C\u3002",
        cannot_en: "This cannot tell you the tools actually work \u2014 we never call business tools. If the handshake completed but tools/list answers 401 with a structurally valid WWW-Authenticate challenge, this check records UNVERIFIED with reason credential_required rather than FAILED; if the handshake itself was credential-gated, this check cascades to the same result."
      }
    },
    {
      n: 8,
      check_id: "error_taxonomy",
      group: "proto",
      docs_version: "v0.3.0",
      predicate_zh: "\u9519\u8BEF\u54CD\u5E94\u7B26\u5408\u534F\u8BAE\u5B9A\u4E49\u7684\u5F62\u72B6",
      predicate_en: "error responses match the protocol's defined shape",
      failure_status: "OBSERVED_RISK",
      requires_baseline: false,
      explain: {
        what_zh: "\u89E6\u53D1\u4E00\u4E2A\u5B89\u5168\u7684\u9519\u8BEF\u573A\u666F\uFF0C\u770B\u9519\u8BEF\u54CD\u5E94\u7684\u5F62\u72B6\u662F\u5426\u7B26\u5408\u534F\u8BAE\u3002",
        what_en: "Triggers a safe error scenario and checks whether the error response's shape matches the protocol.",
        how_zh: "\u504F\u79BB\u8BB0 OBSERVED_RISK\u2014\u2014\u9519\u8BEF\u5F62\u72B6\u4E0D\u89C4\u8303\u4F1A\u8BA9 agent \u65E0\u6CD5\u6B63\u786E\u91CD\u8BD5\u3002\u6CA1\u80FD\u8BFB\u5B8C\u6574\u4EFD\u5DE5\u5177\u5217\u8868\u65F6\uFF08\u89C1 tools_list\uFF09\uFF0C\u6211\u4EEC\u4E0D\u53D1\u8FD9\u6B21\u8C03\u7528\uFF0C\u56E0\u4E3A\u8981\u8C03\u7528\u7684\u540D\u5B57\u53EF\u80FD\u5C5E\u4E8E\u4E00\u4E2A\u6CA1\u8BFB\u5230\u7684\u5DE5\u5177\uFF1B\u672C\u9879\u8BB0 UNVERIFIED\uFF0C\u539F\u56E0 probe_tool_name_unverifiable\uFF1B\u82E5\u5DF2\u8BFB\u5230\u7684\u67D0\u4E00\u9875\u5217\u51FA\u4E86\u8FD9\u4E2A\u540D\u5B57\uFF0C\u539F\u56E0\u5219\u662F probe_tool_name_collision\u3002",
        how_en: "A deviation is recorded as OBSERVED_RISK \u2014 a non-conformant error shape prevents an agent from retrying correctly. If we could not read the whole tool list (see tools_list), we do not send this call, since the name we would call could belong to a tool we did not see; this check is then UNVERIFIED with reason probe_tool_name_unverifiable, or probe_tool_name_collision when a page we did read lists that name.",
        cannot_zh: "\u4E0D\u80FD\u8BF4\u660E\u6240\u6709\u9519\u8BEF\u8DEF\u5F84\u90FD\u89C4\u8303\uFF0C\u6211\u4EEC\u53EA\u63A2\u4E86\u975E\u7834\u574F\u6027\u7684\u90A3\u51E0\u6761\u3002",
        cannot_en: "This cannot tell you every error path is conformant \u2014 we only probe the handful of non-destructive ones."
      }
    },
    {
      n: 11,
      check_id: "tls_certificate",
      group: "sec",
      docs_version: "v0.1.0",
      predicate_zh: "\u8BC1\u4E66\u6709\u6548\u3001\u672A\u8FC7\u671F\u3001SAN \u5339\u914D\u3001\u94FE\u5B8C\u6574",
      predicate_en: "certificate is valid, unexpired, SAN matches, chain is complete",
      failure_status: "FAILED",
      requires_baseline: false,
      executor: "container",
      explain: {
        what_zh: "\u8BC1\u4E66\u6709\u6548\u671F\u3001SAN \u662F\u5426\u5339\u914D\u3001\u8BC1\u4E66\u94FE\u662F\u5426\u5B8C\u6574\u3002",
        what_en: "Certificate validity period, whether the SAN matches, and whether the certificate chain is complete.",
        how_zh: "\u8FC7\u671F / \u4E0D\u5339\u914D / \u94FE\u65AD\u88C2\u5747\u4E3A FAILED\u3002\u786E\u5B9A\u6027\u5224\u5B9A\u3002",
        how_en: "Expired / mismatched / broken chain are all FAILED. A deterministic judgment.",
        cannot_zh: "\u8FD9\u662F\u6700\u57FA\u7840\u7684\u4F20\u8F93\u5C42\u536B\u751F\uFF0C**\u548C\u300C\u8FD9\u4E2A server \u5B89\u5168\u300D\u662F\u4E24\u56DE\u4E8B**\u3002",
        cannot_en: 'This is the most basic transport-layer hygiene \u2014 **it is not the same thing as "this server is secure."**'
      }
    },
    {
      n: 12,
      check_id: "redirect_policy",
      group: "sec",
      docs_version: "v0.3.0",
      predicate_zh: "\u91CD\u5B9A\u5411\u4E0D\u8DE8\u8D8A\u5230\u975E\u9884\u671F\u4E3B\u673A",
      predicate_en: "redirects do not cross to an unexpected host",
      failure_status: "OBSERVED_RISK",
      requires_baseline: false,
      explain: {
        what_zh: "\u91CD\u5B9A\u5411\u662F\u5426\u8DE8\u8D8A\u5230\u975E\u9884\u671F\u4E3B\u673A\u3002",
        what_en: "Whether a redirect crosses to an unexpected host.",
        how_zh: "\u8DE8\u4E3B\u673A\u91CD\u5B9A\u5411\u8BB0 OBSERVED_RISK\u3002\u53EA\u6709\u8BFB\u53D6\u6388\u6743\u5143\u6570\u636E\u7684 GET \u4F1A\u8DDF\u968F\u91CD\u5B9A\u5411\uFF0C\u6700\u591A 3 \u8DF3\uFF1B\u534F\u8BAE POST \u6536\u5230\u91CD\u5B9A\u5411\u65F6\u53EA\u8BB0\u5F55\uFF0C\u4E0D\u8DDF\u968F\u3002\u5373\u4F7F run \u5728\u8FD9\u4E4B\u540E\u505C\u6B62\uFF08\u4F8B\u5982\u8D85\u8FC7\u8DF3\u6570\u4E0A\u9650\u3001\u9047\u5230\u6211\u4EEC\u4E0D\u8FDE\u63A5\u7684\u53E6\u4E00\u4E2A\u4E3B\u673A\uFF0C\u6216\u670D\u52A1\u5668\u8981\u6C42\u6211\u4EEC\u7A0D\u540E\u518D\u6765\uFF09\uFF0C\u5DF2\u89C2\u5BDF\u5230\u7684\u8DE8\u4E3B\u673A\u91CD\u5B9A\u5411\u4E5F\u7167\u6837\u8BB0\u5F55\u3002",
        how_en: "A cross-host redirect is recorded as OBSERVED_RISK. Only the GET for authorization metadata follows redirects, for at most 3 hops; a protocol POST that gets a redirect is recorded, not followed. A cross-host redirect is recorded even when the run stops afterwards, for example at the hop limit, at another host we do not connect to, or because the server asked us to back off.",
        cannot_zh: "\u4E0D\u80FD\u8BF4\u660E\u76EE\u6807\u4E3B\u673A\u53EF\u4FE1\uFF0C\u53EA\u8BF4\u660E\u6709\u6CA1\u6709\u53D1\u751F\u8DF3\u8F6C\u3002",
        cannot_en: "This cannot tell you the destination host is trustworthy \u2014 only whether a redirect happened."
      }
    },
    {
      n: 10,
      check_id: "auth_metadata",
      group: "sec",
      docs_version: "v0.3.0",
      predicate_zh: "\u516C\u5F00\u53EF\u89C2\u5BDF\u7684\u8BA4\u8BC1 metadata / challenge \u7ED3\u6784\u5408\u6CD5",
      predicate_en: "publicly observable auth metadata / challenge structure is legal",
      failure_status: "OBSERVED_RISK",
      no_credential_status: "UNVERIFIED",
      requires_baseline: false,
      explain: {
        what_zh: "\u65E0\u51ED\u636E\u65F6\u516C\u5F00\u53EF\u89C2\u5BDF\u5230\u7684\u8BA4\u8BC1 metadata / challenge \u7ED3\u6784\u662F\u5426\u5408\u6CD5\u3002",
        what_en: "Whether the publicly observable authentication metadata / challenge structure, seen without credentials, is structurally valid.",
        how_zh: "\u7ED3\u6784\u4E0D\u5408\u6CD5\u8BB0 OBSERVED_RISK\uFF1B\u5B8C\u5168\u65E0\u6CD5\u89C2\u5BDF\u65F6\u8BB0 UNVERIFIED\u3002",
        how_en: "An invalid structure is OBSERVED_RISK; when it can't be observed at all, it's UNVERIFIED.",
        cannot_zh: "**\u4E0D\u80FD\u8BF4\u660E\u8BA4\u8BC1\u5F3A\u5EA6\u3002** \u6211\u4EEC\u6CA1\u6709\u51ED\u636E\uFF0C\u770B\u4E0D\u5230\u8BA4\u8BC1\u771F\u6B63\u7684\u6267\u884C\u8DEF\u5F84\u3002",
        cannot_en: "**This cannot tell you the strength of authentication.** We have no credentials, so we never see the real authentication path execute."
      }
    },
    {
      n: 13,
      check_id: "tool_description_hygiene",
      group: "sec",
      docs_version: "v0.5.0",
      predicate_zh: "tool name / description \u4E0D\u542B\u9488\u5BF9 agent \u7684\u6CE8\u5165\u6A21\u5F0F\u6216\u9690\u85CF\u5B57\u7B26",
      predicate_en: "tool name / description contains no agent-targeted injection patterns or hidden characters",
      failure_status: "OBSERVED_RISK",
      requires_baseline: false,
      explain: {
        what_zh: "tool name / description \u4E2D\u662F\u5426\u542B\u9690\u85CF\u5B57\u7B26\u6216\u9488\u5BF9 agent \u7684\u6CE8\u5165\u6A21\u5F0F\u3002",
        what_en: "Whether tool name / description contains hidden characters or agent-targeted injection patterns.",
        how_zh: "\u96F6\u5BBD\u5B57\u7B26\u3001Unicode Tag \u533A\u3001\u53CC\u5411\u8986\u76D6\u7B26\u3001\u6307\u5411\u52A9\u624B\u7684\u7948\u4F7F\u53E5\u5F0F\u3001\u672A\u7ECF\u9010\u6B21\u786E\u8BA4\u7684\u82B1\u8D39\u6216\u8EAB\u4EFD\u4FE1\u606F\u53D1\u9001\u3001\u4E0D\u7B49\u7528\u6237\u518D\u6B21\u63D0\u51FA\u5C31\u7EE7\u7EED\u5DE5\u4F5C\uFF1B\u547D\u4E2D\u8BB0 OBSERVED_RISK\u3002\u8D85\u8FC7 2,048 \u4E2A\u5B57\u7B26\u7684\u63CF\u8FF0\u4ECD\u4F1A\u5217\u4E3A\u5F02\u5E38\u957F\u5EA6\uFF0C\u4F46\u4EC5\u51ED\u957F\u5EA6\u4E0D\u518D\u7B97\u4F5C\u98CE\u9669\u3002\u5939\u5728\u540C\u4E00\u79CD\u6587\u5B57\u7684\u4E24\u4E2A\u5B57\u7B26\u4E4B\u95F4\uFF08\u8DF3\u8FC7\u7EC4\u5408\u9644\u52A0\u7B26\u53F7\uFF09\u3001\u5C5E\u4E8E\u6B63\u5E38\u62FC\u5199\u7684 ZWNJ / ZWJ\uFF08\u9002\u7528\u4E8E\u963F\u62C9\u4F2F\u6587\u3001\u5929\u57CE\u6587\u7B49\u6211\u4EEC\u5217\u51FA\u7684\u6587\u5B57\uFF09\u4E0D\u7B97\u547D\u4E2D\uFF1B\u76F4\u63A5\u5939\u5728\u4E24\u4E2A\u56FE\u5F62\u7B26\u53F7\uFF08emoji\uFF09\u5B57\u7B26\u4E4B\u95F4\u7684 ZWJ \u4E5F\u4E0D\u7B97\uFF0C\u4F46\u8DDF\u5728\u80A4\u8272\u4FEE\u9970\u7B26\u540E\u9762\u7684 ZWJ \u4ECD\u7B97\u3002\u300Cdo not tell the user\u300D\uFF08\u4EE5\u53CA inform\u3001mention\u3001reveal\u3001show\uFF1Bthe \u53EF\u7701\u7565\uFF0Cuser \u4E5F\u53EF\u4EE5\u662F human\uFF09\u5728\u540E\u9762\u7D27\u8DDF about\u3001that you\u3001what you\u3001how you\u3001anything\u3001any of\u3001. , ; : ! ) \u4E4B\u4E00\u6216\u6587\u672C\u7ED3\u5C3E\u65F6\u7B97\uFF1B\u540E\u9762\u7D27\u8DDF 's \u6216 \u2019s\u3001\u524D\u6709\u7A7A\u683C\u6216\u5236\u8868\u7B26\u7684\u8FDE\u5B57\u7B26\u3001en \u6216 em \u7834\u6298\u53F7\u3001\u6362\u884C\uFF0C\u6216 that\u3001what\u3001why\u3001where\u3001how\u3001this\u3001any \u4E4B\u4E00\u65F6\u4E5F\u7B97\uFF0C\u9664\u975E\u5728\u5B83\u4E4B\u540E\uFF08\u5982\u679C\u662F\u6362\u884C\uFF0C\u5C31\u662F\u4E0B\u4E00\u884C\uFF09\u5230\u4E0B\u4E00\u4E2A . , ; ! ?\u3001\u6362\u884C\u6216\uFF0C\u3002\uFF01\uFF1F\uFF1B\u4E4B\u524D\u51FA\u73B0 until\u3001unless\u3001yet\u3001before\u3001after\u3001otherwise\u3001once\u3001while\u3001if\u3001when \u4E4B\u4E00\u3002\u300Csystem prompt\u300D\u300Cdeveloper prompt\u300D\u5728\u524D\u9762\u662F your \u6216 your new \u65F6\u7B97\uFF1B\u524D\u9762\u662F reveal\u3001print\u3001output\u3001repeat\u3001disclose\u3001leak\u3001ignore\u3001override\u3001disregard\u3001forget\u3001show\u3001return\u3001display\u3001replace\u3001dump\u3001echo\u3001act as \u4E4B\u4E00\u65F6\u7B97\uFF0C\u5176\u540E\u53EF\u4F9D\u6B21\u9694 out\uFF0Cthe\u3001any\u3001all \u6216 your\uFF0Cprevious\u3001prior\u3001above\u3001earlier\u3001original \u6216 contents of\uFF0C\u4EE5\u53CA the \u6216 your\uFF1B\u4F4D\u4E8E\u884C\u9996\uFF08\u524D\u9762\u53EA\u6709\u7A7A\u683C\u3001\u5236\u8868\u7B26\u3001#\u3001*\u3001>\u3001[ \u6216 -\uFF09\u4E14\u540E\u9762\uFF08\u53EF\u9694\u7A7A\u767D\uFF09\u662F\u5192\u53F7\u6216 override \u65F6\u4E5F\u7B97\u3002\u300Cnever\u300D\u300Cdo not\u300D\u6216\u300Cdon't\u300D\uFF08\u4E24\u79CD\u6487\u53F7\u5747\u53EF\uFF09\u540E\u63A5 say\u3001mention\u3001tell\u3001disclose\u3001reveal \u6216 state\uFF0C\u5E76\u4E14\u540C\u4E00\u4ECE\u53E5\u91CC\u5B83\u540E\u9762\u51FA\u73B0 missing\u3001not verified\u3001unverified\u3001failed \u6216 absent \u65F6\u4E5F\u7B97\uFF0C\u9664\u975E\u4E24\u8005\u4E4B\u95F4\u51FA\u73B0 because\u3001when\u3001if\u3001unless\u3001since\u3001as \u6216 so\u3002\u300C\u672A\u7ECF\u9010\u6B21\u786E\u8BA4\u7684\u82B1\u8D39\u6216\u8EAB\u4EFD\u4FE1\u606F\u53D1\u9001\u300D\u6307\u51FA\u73B0\u4EE5\u4E0B\u77ED\u8BED\u4E4B\u4E00\uFF1Apay \u540E\u9762\u540C\u4E00\u53E5\u5185\uFF08\u53E5\u5B50\u5728 . ! ?\u3001\u6362\u884C\u6216\u3002\uFF01\uFF1F\u5904\u7ED3\u675F\uFF0940 \u4E2A\u5B57\u7B26\u4EE5\u5185\u63A5 by default\uFF1Bno approval \u6216 no confirmation \u540E\u63A5 needed \u6216 required\uFF08\u4E2D\u95F4\u53EF\u6709 is\uFF09\uFF1Bneed not ask\uFF1Bzero questions\uFF1Bwithout asking\uFF0C\u4F46\u540C\u4E00\u53E5\u5185\uFF08\u53E5\u5B50\u5728 . ! ?\u3001\u6362\u884C\u6216\u3002\uFF01\uFF1F\u5904\u7ED3\u675F\uFF09\u5B83\u524D\u9762 30 \u4E2A\u5B57\u7B26\u4EE5\u5185\u6709 never\u3001not \u6216\u4EE5 n't\uFF08ASCII \u6487\u53F7\uFF09\u7ED3\u5C3E\u7684\u8BCD\uFF0C\u6216\u8005\u5B83\u540E\u9762\u63A5 for \u6216 us \u65F6\u4E0D\u7B97\uFF1Bdoes not \u6216 doesn't require per-change\u3001per-action\u3001per-call\u3001per-purchase \u6216 per-payment approval\uFF08per \u540E\u9762\u4E5F\u53EF\u4EE5\u662F\u7A7A\u683C\uFF09\uFF1Bthe grant\u3001allowance \u6216 delegation is the \u6216 your permission\u3001approval \u6216 consent\uFF1Baccept \u6216 approve \u540E\u63A5 all\u3001every \u6216 any\uFF0C\u518D\u9694\u81F3\u591A\u4E24\u4E2A\u8BCD\u63A5 prompt\u3001confirmation\u3001dialog \u6216 request\uFF08\u5355\u590D\u6570\u5747\u53EF\uFF09\uFF1Bcontinues\u3001repeats \u6216 recurs automatically\uFF1Bthe\u3001your \u6216 this agent loop\uFF1Bgit config \u540E\u63A5 user.email\uFF08\u4E2D\u95F4\u53EF\u4EE5\u6709 --get \u4E4B\u7C7B\u7684\u9009\u9879\uFF09\uFF1Bnever ask\uFF08\u4E2D\u95F4\u53EF\u4EE5\u6709 the user\uFF09before \u540E\u63A5 charging\u3001paying\u3001buying\u3001purchasing\u3001spending\u3001billing\u3001renewing \u6216 subscribing\uFF1B\u65E0\u9700\u786E\u8BA4\u6216\u65E0\u9700\u53E6\u884C\u786E\u8BA4\uFF1B\u89C6\u4E3A\u540C\u610F\u6216\u89C6\u4E3A\u7528\u6237\u540C\u610F\uFF1Bsell\u3001sells\u3001selling\u3001sellable\u3001resell\u3001resells\u3001reselling \u6216 resellable\uFF0C\u540C\u4E00\u53E5\u5185 80 \u4E2A\u5B57\u7B26\u4EE5\u5185\u518D\u63A5 entrusted \u6216 lent\u3001\u53EF\u9009\u7684 to \u548C you\uFF1Braise\u3001increase\u3001disable \u6216 turn off\uFF0C\u53EF\u9694 the \u6216 your\uFF0C\u518D\u63A5 spendControls\uFF08\u5176\u540E\u53EF\u5E26\u4E00\u4E2A\u70B9\u548C\u540D\u79F0\uFF09\u3001maxAmountPerPayment\u3001spend \u6216 spending \u52A0 limit\u3001limits\u3001cap \u6216 caps\uFF0C\u6216 payment \u52A0 cap \u6216 caps\uFF1Bset\uFF0C\u53EF\u9694 the \u6216 your\uFF0C\u518D\u63A5\u4E0A\u8FF0\u4E4B\u4E00\uFF0C\u53EF\u518D\u63A5 :\u3001= \u6216 to\uFF0C\u518D\u63A5 false \u6216 0\uFF08\u540E\u9762\u4E0D\u80FD\u7D27\u8DDF\u70B9\u3001\u5B57\u6BCD\u3001\u6570\u5B57\u6216\u4E0B\u5212\u7EBF\uFF09\uFF1Bpays\u3001charges \u6216 spends \u540E\u9762\u540C\u4E00\u53E5\u5185 40 \u4E2A\u5B57\u7B26\u4EE5\u5185\u63A5 from\uFF0C\u518D\u63A5 your owner's\u3001the user's\u3001your human's \u6216 the human's\uFF08\u4E24\u79CD\u6487\u53F7\u5747\u53EF\uFF09\uFF0C\u518D\u63A5 credit\u3001credits\u3001balance\u3001wallet \u6216 funds\uFF0C\u4F46\u8FD9\u4E00\u53E5\u6216\u4E0B\u4E00\u53E5\u91CC\u51FA\u73B0 confirm\u3001confirms\u3001confirmed\u3001confirming\u3001confirmation\u3001confirmations\u3001approve\u3001approves\u3001approved\u3001approving\u3001approval \u6216 approvals\uFF0C\u6216 ask\u3001asks\u3001asked \u6216 asking \u540E\u9762\u540C\u4E00\u53E5\u5185 40 \u4E2A\u5B57\u7B26\u4EE5\u5185\u63A5 permission \u65F6\u4E0D\u7B97\uFF08\u8FD9\u4E00\u79CD\u91CC\uFF0C\u53E5\u5B50\u5728\u540E\u9762\u8DDF\u7A7A\u767D\u6216\u4F4D\u4E8E\u6587\u672C\u7ED3\u5C3E\u7684 . ! ?\u3001\u6362\u884C\u6216\u3002\uFF01\uFF1F\u5904\u7ED3\u675F\uFF0C\u4E24\u53E5\u5408\u8BA1\u4ECE\u77ED\u8BED\u8D77\u70B9\u5411\u524D\u6700\u591A 400 \u4E2A\u5B57\u7B26\u3001\u5411\u540E\u6700\u591A 800 \u4E2A\u5B57\u7B26\uFF09\u3002\u53EA\u6709\u5F53\u5B83\u524D\u540E 200 \u4E2A\u5B57\u7B26\u4EE5\u5185\u51FA\u73B0\u82B1\u8D39\u6216\u8EAB\u4EFD\u7C7B\u7684\u8BCD\uFF08pay\u3001pays\u3001paid\u3001paying\u3001payer\u3001payment\u3001payments\u3001charge\u3001charges\u3001charged\u3001charging\u3001credit\u3001credits\u3001wallet\u3001wallets\u3001USDC\u3001invoice\u3001invoices\u3001purchase\u3001purchases\u3001purchased\u3001purchasing\u3001buy\u3001buys\u3001buying\u3001subscribe\u3001subscribes\u3001subscribed\u3001subscribing\u3001subscription\u3001subscriptions\u3001renew\u3001renews\u3001renewed\u3001renewal\u3001renewals\u3001bill\u3001bills\u3001billed\u3001billing\u3001cost\u3001costs\u3001fee\u3001fees\u3001refund\u3001refunds\u3001refunded\u3001refundable\u3001spend\u3001spends\u3001spending\u3001money\u3001identity\u3001email\u3001emails\u3001e-mail\u3001e-mails\u3001$ \u52A0\u91D1\u989D\uFF0C\u6216\u6263\u8D39\u3001\u7EED\u8D39\u3001\u8D39\u7528\u3001\u652F\u4ED8\u3001\u4ED8\u6B3E\u3001\u8D2D\u4E70\u3001\u8BA2\u9605\u3001\u94B1\u5305\u3001\u90AE\u7BB1\u3001\u8EAB\u4EFD\uFF09\uFF0C\u5E76\u4E14\u5B83\u524D\u9762 120 \u4E2A\u5B57\u7B26\u4EE5\u5185\u6CA1\u6709 cap\u3001caps\u3001capped\u3001limit\u3001limits\u3001ceiling\u3001ceilings\u3001max\u3001maximum\u3001policy\u3001policies\u3001mandate\u3001mandates\u3001allowlist\u3001allowlisted\u3001whitelist\u3001whitelisted\uFF08\u4E5F\u53EF\u5E26\u8FDE\u5B57\u7B26\uFF1Aallow-list\u3001white-list\uFF09\u3001threshold\u3001thresholds\u3001quota\u3001quotas \u6216\u4E0A\u9650\u3001\u989D\u5EA6\u3001\u9650\u989D\u3001\u7B56\u7565\u3001\u767D\u540D\u5355\u65F6\u624D\u7B97\uFF08\u63D0\u9AD8\u6216\u5173\u95ED\u4E0A\u9650\u7684\u90A3\u4E00\u79CD\u4E0D\u53D7\u8FD9\u4E00\u6761\u9650\u5236\uFF09\u3002\u82B1\u8D39\u6216\u8EAB\u4EFD\u7C7B\u7684\u8BCD\u6240\u5728\u7684\u4ECE\u53E5\u5982\u679C\u540C\u65F6\u5199\u660E\u4E0D\u82B1\u94B1\u6216\u4E0D\u53D1\u9001\uFF0C\u8FD9\u4E2A\u8BCD\u5C31\u4E0D\u7B97\uFF1Acost \u6216 costs \u540E\u63A5 nothing\uFF08\u4E2D\u95F4\u81F3\u591A\u4E24\u4E2A\u8BCD\uFF09\uFF0Cfree\uFF0Cno charge\u3001no cost \u6216 no fee\uFF08\u542B\u590D\u6570\uFF09\uFF0Cdoes not\u3001doesn't\u3001do not\u3001don't\u3001never\u3001will not \u6216 won't\uFF08ASCII \u6487\u53F7\uFF09\u540E\u63A5 send\u3001collect\u3001store \u6216 share\uFF08\u542B\u52A0 s \u7684\u5F62\u5F0F\uFF09\uFF0C\u6216\u8005\u514D\u8D39\u3001\u4E0D\u6536\u8D39\uFF1B\u7D27\u8DDF\u5728 feel \u540E\u9762\u7684 free \u4E0D\u7B97\u3002\u4ECE\u53E5\u5728\u540E\u9762\u8DDF\u7A7A\u767D\u6216\u4F4D\u4E8E\u6587\u672C\u7ED3\u5C3E\u7684 . ! ?\u3001\u5728 , ; \u6216\u6362\u884C\u3001\u4EE5\u53CA\u5728\uFF0C\u3002\uFF01\uFF1F\uFF1B\u5904\u7ED3\u675F\uFF0C\u5E76\u4E14\u4ECE\u8FD9\u4E2A\u8BCD\u7684\u7B2C\u4E00\u4E2A\u5B57\u7B26\u8D77\u5411\u4E24\u4FA7\u5404\u6700\u591A\u5EF6\u4F38 200 \u4E2A\u5B57\u7B26\uFF1B\u540C\u6837\u7684\u8BCD\u51FA\u73B0\u5728\u522B\u7684\u4ECE\u53E5\u91CC\u4E0D\u8D77\u4F5C\u7528\u3002\u77ED\u8BED\u6240\u5728\u7684\u4ECE\u53E5\u5982\u679C\u51FA\u73B0 no purchase\uFF08\u6216 no purchases\uFF09\u3001read-only\uFF08\u6216 read only\uFF09\u3001does not \u6216 doesn't \u540E\u63A5 buy\u3001purchase\u3001register \u6216 charge\u3001what it costs \u6216 how much\uFF0C\u8FD9\u4E2A\u77ED\u8BED\u5C31\u4E0D\u7B97\uFF1B\u8FD9\u4E9B\u8BCD\u51FA\u73B0\u5728\u67D0\u4E2A\u82B1\u8D39\u6216\u8EAB\u4EFD\u7C7B\u7684\u8BCD\u81EA\u5DF1\u7684\u4ECE\u53E5\u91CC\u65F6\uFF0C\u90A3\u4E2A\u8BCD\u4E0D\u7B97\uFF1B\u51FA\u73B0\u5728\u5176\u4ED6\u4ECE\u53E5\u91CC\u4E0D\u8D77\u4F5C\u7528\u3002\u300C\u4E0D\u7B49\u7528\u6237\u518D\u6B21\u63D0\u51FA\u5C31\u7EE7\u7EED\u5DE5\u4F5C\u300D\u6307 without \u540E\u9762\uFF08\u53EF\u9694 waiting for\uFF09\u63A5 another\u3001a further\u3001any further\u3001further\u3001a new\u3001a second\u3001an additional \u6216 additional\uFF0C\u518D\u63A5 user \u6216 human\uFF0C\u518D\u63A5 prompt\u3001message\u3001request\u3001turn \u6216 reply\uFF08\u5355\u590D\u6570\u5747\u53EF\uFF09\u3002\u6211\u4EEC\u8BFB\u53D6\u5DE5\u5177\u5217\u8868\u7684\u5168\u90E8\u9875\u3002\u6CA1\u80FD\u8BFB\u5B8C\u6574\u4EFD\u5217\u8868\u65F6\uFF0C\u5DF2\u8BFB\u5230\u7684\u5DE5\u5177\u91CC\u6709\u547D\u4E2D\u4ECD\u8BB0 OBSERVED_RISK\uFF1B\u6CA1\u6709\u547D\u4E2D\u5219\u8BB0 UNVERIFIED \u800C\u4E0D\u662F VERIFIED\uFF0C\u56E0\u4E3A\u6CA1\u8BFB\u5230\u7684\u5DE5\u5177\u6CA1\u6709\u68C0\u67E5\u8FC7\u3002",
        how_en: `Zero-width characters, Unicode Tag block, bidi override characters, imperative phrasing directed at an assistant, spending or sending identity data without per-action confirmation, continuing without another user prompt \u2014 any hit is recorded as OBSERVED_RISK. A description over 2,048 characters is still listed as anomalous length, but length alone no longer counts as a risk. A ZWNJ or ZWJ between two characters of one script that uses it in ordinary spelling (Arabic, Devanagari and the other scripts we list), combining marks skipped, is not a hit; nor is a ZWJ directly between two pictographic (emoji) characters, though a ZWJ after a skin-tone modifier still is. "Do not tell the user" (or inform, mention, reveal, show; "the" optional, "human" for "user") counts when followed by "about", "that you", "what you", "how you", "anything", "any of", one of . , ; : ! ) or the end of the text; it also counts when followed by 's or \u2019s, a hyphen with a space or tab before it, an en or em dash, a line break, or one of that, what, why, where, how, this or any, unless the text after it (after a line break, the next line) has until, unless, yet, before, after, otherwise, once, while, if or when before the next . , ; ! ? or line break or \uFF0C\u3002\uFF01\uFF1F\uFF1B. "System prompt" or "developer prompt" counts after "your" or "your new"; after one of reveal, print, output, repeat, disclose, leak, ignore, override, disregard, forget, show, return, display, replace, dump, echo or act as, optionally followed in turn by out, by the, any, all or your, by previous, prior, above, earlier, original or contents of, and by the or your; or at the start of a line (after only spaces, tabs, #, *, >, [ or -) when followed, after optional whitespace, by a colon or by "override". "Never", "do not" or "don't" (either apostrophe) followed by say, mention, tell, disclose, reveal or state also counts when missing, not verified, unverified, failed or absent comes after it in the same clause, unless because, when, if, unless, since, as or so comes between them. Spending or sending identity data without per-action confirmation is one of these phrases: "pay" followed by "by default" in the same sentence (ended by . ! ? a line break or \u3002\uFF01\uFF1F) within 40 characters; "no approval" or "no confirmation" followed by needed or required (optionally after "is"); "need not ask"; "zero questions"; "without asking", unless never, not or a word ending in n't (ASCII apostrophe) comes within 30 characters before it in the same sentence (ended by . ! ? a line break or \u3002\uFF01\uFF1F), or for or us follows it; "does not" or "doesn't" "require" per-change, per-action, per-call, per-purchase or per-payment (or "per" and a space) "approval"; "the" grant, allowance or delegation "is" the or your permission, approval or consent; accept or approve, then all, every or any, then up to two words, then prompt, confirmation, dialog or request (or their plurals); continues, repeats or recurs "automatically"; the, your or this "agent loop"; "git config", then user.email (options such as --get may come between); "never ask" (optionally followed by "the user") "before" charging, paying, buying, purchasing, spending, billing, renewing or subscribing; \u65E0\u9700\u786E\u8BA4 or \u65E0\u9700\u53E6\u884C\u786E\u8BA4; \u89C6\u4E3A\u540C\u610F or \u89C6\u4E3A\u7528\u6237\u540C\u610F; sell, sells, selling, sellable, resell, resells, reselling or resellable, then "entrusted" or "lent", optionally "to", and "you", in the same sentence within 80 characters; raise, increase, disable or "turn off", optionally the or your, then spendControls (optionally followed by a dot and a name), maxAmountPerPayment, "spend" or "spending" and limit, limits, cap or caps, or "payment" and cap or caps; "set", optionally the or your, then one of those, optionally ":", "=" or "to", then false or 0 (not followed by a dot, letter, digit or underscore); pays, charges or spends, then within 40 characters in the same sentence "from" your owner's, the user's, your human's or the human's (either apostrophe), then credit, credits, balance, wallet or funds, unless that sentence or the next has confirm, confirms, confirmed, confirming, confirmation, confirmations, approve, approves, approved, approving, approval or approvals, or ask, asks, asked or asking followed within 40 characters in the same sentence by "permission" (for this form a sentence ends at . ! or ? followed by whitespace or the end of the text, at a line break, or at \u3002\uFF01\uFF1F, and the two sentences reach at most 400 characters before the start of the phrase and 800 after it). It counts only when a money or identity word is within 200 characters of it (pay, pays, paid, paying, payer, payment, payments, charge, charges, charged, charging, credit, credits, wallet, wallets, USDC, invoice, invoices, purchase, purchases, purchased, purchasing, buy, buys, buying, subscribe, subscribes, subscribed, subscribing, subscription, subscriptions, renew, renews, renewed, renewal, renewals, bill, bills, billed, billing, cost, costs, fee, fees, refund, refunds, refunded, refundable, spend, spends, spending, money, identity, email, emails, e-mail, e-mails, a $ amount, or \u6263\u8D39, \u7EED\u8D39, \u8D39\u7528, \u652F\u4ED8, \u4ED8\u6B3E, \u8D2D\u4E70, \u8BA2\u9605, \u94B1\u5305, \u90AE\u7BB1, \u8EAB\u4EFD), and no cap, caps, capped, limit, limits, ceiling, ceilings, max, maximum, policy, policies, mandate, mandates, allowlist, allowlisted, whitelist, whitelisted (each also with a hyphen: allow-list, white-list), threshold, thresholds, quota or quotas (or \u4E0A\u9650, \u989D\u5EA6, \u9650\u989D, \u7B56\u7565, \u767D\u540D\u5355) is in the 120 characters before it (this does not apply to raising or switching off a limit). A money or identity word does not count when its own clause says it costs nothing or is not sent: "cost" or "costs" followed by "nothing" (up to two words between), "free", "no charge", "no cost" or "no fee" (or their plurals), does not, doesn't, do not, don't, never, will not or won't (ASCII apostrophe) followed by send, collect, store or share (or sends, collects, stores, shares), or \u514D\u8D39 or \u4E0D\u6536\u8D39; "free" right after "feel" does not count. A clause ends at . ! or ? followed by whitespace or the end of the text, at , ; or a line break, or at \uFF0C\u3002\uFF01\uFF1F\uFF1B, and reaches at most 200 characters either side of the first character of the word; the same words in another clause change nothing. A phrase does not count when its own clause has "no purchase" (or "no purchases"), "read-only" (or "read only"), "does not" or "doesn't" followed by buy, purchase, register or charge, "what it costs" or "how much"; the same words in a money or identity word's own clause stop that word from counting, and in any other clause they change nothing. Continuing without another user prompt is "without", optionally "waiting for", then another, a further, any further, further, a new, a second, an additional or additional, then user or human, then prompt, message, request, turn or reply (or their plurals). We read every page of the tool list. If we could not read the whole list, a hit in the tools we did read is still OBSERVED_RISK, but no hit is UNVERIFIED rather than VERIFIED: the tools we did not see were not checked.`,
        cannot_zh: "**\u4E0D\u80FD\u63A8\u65AD\u610F\u56FE\u3002** \u8FD9\u4E9B\u6A21\u5F0F\u5728\u5408\u6CD5\u5DE5\u5177\u91CC\u4E5F\u53EF\u80FD\u51FA\u73B0\uFF08\u4F8B\u5982\u4E00\u4E2A\u4E13\u95E8\u5904\u7406 Unicode \u7684\u5DE5\u5177\uFF09\u3002\u6211\u4EEC\u53EA\u62A5\u544A\u4FE1\u53F7\u3002",
        cannot_en: "**This cannot infer intent.** These patterns can also occur in legitimate tools (e.g. a tool that specifically handles Unicode). We only report the signal."
      }
    },
    {
      n: 6,
      check_id: "toolset_fingerprint",
      group: "drift",
      docs_version: "v0.2.0",
      predicate_zh: "\u5DE5\u5177\u96C6\u7684 canonical fingerprint \u53EF\u8BA1\u7B97\u5E76\u5DF2\u8BB0\u5F55",
      predicate_en: "the toolset's canonical fingerprint is computable and recorded",
      failure_status: "FAILED",
      requires_baseline: false,
      explain: {
        what_zh: "\u628A\u5DE5\u5177\u96C6\u505A JCS \u89C4\u8303\u5316\u540E\u8BA1\u7B97 SHA-256 \u6307\u7EB9\u5E76\u5F52\u6863\u3002",
        what_en: "Canonicalizes the toolset via JCS and computes a SHA-256 fingerprint, then archives it.",
        how_zh: "**\u7B97\u5F97\u51FA\u5C31\u662F VERIFIED**\u2014\u2014\u53EA\u5224\u65AD\u300C\u53EF\u8BA1\u7B97\u300D\uFF0C\u4E0D\u5224\u65AD\u300C\u53D8\u6CA1\u53D8\u300D\u3002\u6307\u7EB9\u6309\u5DE5\u5177\u5217\u8868\u7684\u5168\u90E8\u9875\u8BA1\u7B97\uFF1B\u6CA1\u80FD\u8BFB\u5B8C\u6574\u4EFD\u5217\u8868\u65F6\uFF08\u89C1 tools_list\uFF09\u4E0D\u8BA1\u7B97\u6307\u7EB9\uFF0C\u672C\u9879\u8BB0 UNVERIFIED\u3002",
        how_en: '**Computing successfully is VERIFIED** \u2014 this only judges "can it be computed," not "did it change." It is computed over every page of the tool list. If we could not read the whole list (see tools_list), no fingerprint is computed and this check is UNVERIFIED.',
        cannot_zh: "\u6307\u7EB9\u672C\u8EAB\u4E0D\u4EE3\u8868\u597D\u574F\uFF0C\u5B83\u53EA\u662F\u4E00\u4E2A\u53EF\u88AB\u7B2C\u4E09\u65B9\u590D\u7B97\u7684\u4E8B\u5B9E\u3002",
        cannot_en: "The fingerprint by itself says nothing about good or bad \u2014 it's only a fact a third party can independently recompute."
      }
    },
    {
      n: 7,
      check_id: "schema_fingerprint",
      group: "drift",
      docs_version: "v0.2.0",
      predicate_zh: "\u5404 tool inputSchema \u7684 canonical fingerprint \u53EF\u8BA1\u7B97\u5E76\u5DF2\u8BB0\u5F55",
      predicate_en: "each tool's inputSchema canonical fingerprint is computable and recorded",
      failure_status: "FAILED",
      requires_baseline: false,
      explain: {
        what_zh: "\u628A\u6BCF\u4E2A tool \u7684 inputSchema \u89C4\u8303\u5316\u540E\u8BA1\u7B97\u6307\u7EB9\u5E76\u5F52\u6863\u3002",
        what_en: "Canonicalizes each tool's inputSchema and computes a fingerprint, then archives it.",
        how_zh: "\u540C\u4E0A\uFF1A\u53EA\u5224\u65AD\u53EF\u8BA1\u7B97\u6027\u3002\u6309\u5DE5\u5177\u5217\u8868\u7684\u5168\u90E8\u9875\u8BA1\u7B97\uFF1B\u6CA1\u80FD\u8BFB\u5B8C\u6574\u4EFD\u5217\u8868\u65F6\u8BB0 UNVERIFIED\u3002",
        how_en: "Same as above: only judges computability. It is computed over every page of the tool list, and is UNVERIFIED when we could not read the whole list.",
        cannot_zh: "\u540C\u4E0A\u3002",
        cannot_en: "Same as above."
      }
    },
    {
      n: 14,
      check_id: "toolset_unchanged_vs_approved",
      group: "drift",
      docs_version: "v0.2.0",
      predicate_zh: "\u5DE5\u5177\u96C6\u76F8\u5BF9\u5DF2\u6279\u51C6\u53D1\u5E03\u672A\u53D8\u5316",
      predicate_en: "toolset is unchanged relative to the approved release",
      failure_status: "FAILED",
      requires_baseline: true,
      no_baseline_status: "UNVERIFIED",
      no_baseline_reason_zh: "\u8BE5 target \u6CA1\u6709\u5DF2\u6279\u51C6\u57FA\u7EBF",
      no_baseline_reason_en: "No approved baseline exists for this target.",
      explain: {
        what_zh: "\u5F53\u524D\u5DE5\u5177\u96C6\u4E0E**\u4F60\u6279\u51C6\u8FC7\u7684\u90A3\u6B21\u53D1\u5E03**\u662F\u5426\u4E00\u81F4\u3002",
        what_en: "Whether the current toolset matches the release you approved.",
        how_zh: "\u6709\u5DF2\u6279\u51C6\u57FA\u7EBF\u65F6\u624D\u6267\u884C\uFF1B\u65B0\u589E / \u5220\u9664\u5DE5\u5177\u5373 FAILED\u3002\u6CA1\u80FD\u8BFB\u5B8C\u6574\u4EFD\u5DE5\u5177\u5217\u8868\u65F6\u6CA1\u6709\u53EF\u6BD4\u5BF9\u7684\u5185\u5BB9\uFF0C\u8BB0 UNVERIFIED\u3002",
        how_en: "Only runs when an approved baseline exists; adding or removing a tool is FAILED. If we could not read the whole tool list, there is nothing to compare and this check is UNVERIFIED.",
        cannot_zh: "\u6CA1\u6709\u57FA\u7EBF\u65F6\u6C38\u8FDC\u662F UNVERIFIED\u2014\u2014\u6CA1\u4EBA\u544A\u8BC9\u8FC7\u6211\u4EEC\u6B63\u786E\u7684\u6837\u5B50\u662F\u4EC0\u4E48\u3002",
        cannot_en: "Without a baseline it is always UNVERIFIED \u2014 nobody has told us what the correct shape looks like."
      }
    },
    {
      n: 15,
      check_id: "schema_unchanged_vs_approved",
      group: "drift",
      docs_version: "v0.2.0",
      predicate_zh: "canonical schema \u76F8\u5BF9\u5DF2\u6279\u51C6\u53D1\u5E03\u672A\u53D8\u5316",
      predicate_en: "canonical schema is unchanged relative to the approved release",
      failure_status: "FAILED",
      requires_baseline: true,
      no_baseline_status: "UNVERIFIED",
      no_baseline_reason_zh: "\u8BE5 target \u6CA1\u6709\u5DF2\u6279\u51C6\u57FA\u7EBF",
      no_baseline_reason_en: "No approved baseline exists for this target.",
      explain: {
        what_zh: "\u6BCF\u4E2A tool \u7684 canonical schema \u4E0E\u5DF2\u6279\u51C6\u57FA\u7EBF\u662F\u5426\u4E00\u81F4\u3002",
        what_en: "Whether each tool's canonical schema matches the approved baseline.",
        how_zh: "\u6709\u57FA\u7EBF\u65F6\u624D\u6267\u884C\u3002**\u8FD9\u662F\u62E6 rug pull \u6700\u76F4\u63A5\u7684\u4E00\u9879\u3002**\u6CA1\u80FD\u8BFB\u5B8C\u6574\u4EFD\u5DE5\u5177\u5217\u8868\u65F6\u8BB0 UNVERIFIED\u3002",
        how_en: "Only runs when a baseline exists. **This is the most direct check against a rug pull.** If we could not read the whole tool list, it is UNVERIFIED.",
        cannot_zh: "\u540C\u4E0A\uFF1A\u672A\u8BA4\u9886\u7684 server \u4E0A\u5B83\u53EA\u80FD\u662F UNVERIFIED\u3002",
        cannot_en: "Same as above: on an unclaimed server, this can only ever be UNVERIFIED."
      }
    }
  ],
  budget: {
    max_requests: 8,
    max_duration_ms: 1e4,
    max_body_bytes: 2097152,
    max_redirects: 3,
    max_tools_list_pages: 10,
    unclaimed_max_requests: 8,
    on_exceeded: { execution_status: "ERROR", assertion_status: "UNVERIFIED" }
  },
  forbidden: [
    "\u8C03\u7528\u4E1A\u52A1\u5DE5\u5177",
    "\u5199\u64CD\u4F5C",
    "\u8BBF\u95EE\u751F\u4EA7\u6570\u636E",
    "\u63A5\u89E6\u751F\u4EA7\u51ED\u636E",
    "destructive test",
    "\u901A\u8FC7\u4EFB\u610F URL \u8BBF\u95EE\u5185\u7F51\u6216\u4E91 metadata"
  ]
};

// ../checks/src/registry.ts
var CHECKS_REGISTRY = checks_default;

// ../attestation-schema/schema/attestation.schema.json
var attestation_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://mcpcheckup.com/schema/attestation-payload-v0.4.json",
  description: "The content that goes inside a DSSE envelope's `payload` field (base64-decoded, UTF-8-decoded, then parsed as JSON) for payloadType 'application/vnd.mcpcheckup.attestation+json;version=0.4'. Every property except auth_observation is required so that no field can be silently omitted; nullable fields use an explicit null rather than an absent key, so 'we recorded nothing here' and 'we forgot to ask' are never confused with each other. auth_observation is the one key whose presence is itself the information: it is present exactly when coverage is 'auth_gated' (see the second `allOf` entry), so a 'full' payload carries exactly the v0.3 fields, under the same constraints, plus coverage and run_id.",
  type: "object",
  additionalProperties: false,
  required: [
    "canonicalization",
    "suite_id",
    "suite_version",
    "suite_digest",
    "suite_commit",
    "registry_version",
    "toolset_projection_version",
    "protocol_revision",
    "launch_config_digest",
    "target",
    "observed_at",
    "run",
    "probe_region",
    "probe_dns_answer_changed",
    "assertions",
    "toolset_fingerprint",
    "schema_fingerprint",
    "coverage",
    "run_id"
  ],
  properties: {
    canonicalization: {
      const: "nfc-jcs/v1",
      description: "Which canonicalization scheme produced toolset_fingerprint/schema_fingerprint. Currently the only value this package understands. See @mcpcheckup/canonicalizer's CANONICALIZATION_PROFILE and README for the exact three-step definition and why it is not called 'RFC 8785'."
    },
    suite_id: {
      type: "string",
      minLength: 1,
      description: "Identifies the check suite that produced these assertions, e.g. 'remote-baseline-v0.1'. Matches packages/checks/checks.json's own suite_id."
    },
    suite_version: {
      type: "string",
      pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$",
      description: "The published version of the executable check-suite package that ran these checks (semver). Distinct from registry_version, which versions the static check *definitions*, not the code that executes them."
    },
    suite_digest: {
      type: "string",
      pattern: "^sha512-[A-Za-z0-9+/]{86}==$",
      description: "A Subresource-Integrity-formatted sha512 digest identifying the exact check-suite source tree that produced these assertions. The recipe, exactly: sha512 (SRI base64) over the raw bytes of `git ls-tree -r -z --full-tree <commit> -- packages/checks`, where <commit> is this payload's own suite_commit. That command's output is the only input \u2014 no packaging step, no npm, no build \u2014 so the value is recomputable by anyone who can read the repository at that commit, with no build tooling and nothing published anywhere. suite_commit is a commit of the public repository github.com/mcpcheckup/checks, so anyone can run that command. The probe's deploy step computes this value from the commit being deployed and injects it, and the probe's committed configuration carries a deliberately invalid placeholder in its place, so a deploy that skipped that step refuses to probe rather than signing a stale value. The `-z` flag is mandatory, not stylistic: without it git renders path names through core.quotePath, a per-user git config, so the moment any file under packages/checks has a non-ASCII name the same commit produces two different byte sequences \u2014 and therefore two different digests \u2014 depending only on whose config ran the command. With `-z` the paths are emitted raw and NUL-terminated and both configurations agree. Restricted to sha512 specifically: a SHA-512 digest is always exactly 64 bytes, which standard base64 always encodes as exactly 86 characters plus '==' padding \u2014 that length is arithmetic, not a guess, so it is enforced here and a truncated or hand-typo'd digest is rejected instead of silently accepted. This is NOT npm's `dist.integrity`: v0.1 and v0.2 defined this field that way, but packages/checks is `private: true` and has never been published, so that definition was unreachable by construction and no value produced under it is reproducible \u2014 see packages/checks/README.md for what those historical values do and do not identify."
    },
    suite_commit: {
      type: "string",
      pattern: "^[0-9a-f]{40}$",
      description: "The 40-hex-character git commit sha, on `main`, at which this payload's suite_digest was computed. It is what tells a verifier which commit to run suite_digest's own command against: without it the digest names no starting point, and a third party would have to guess which tree to check out before `git ls-tree` could produce anything to compare. Lowercase hex only and exactly 40 characters, matching git's own object-name output \u2014 an uppercase, truncated, or over-long value is rejected rather than silently accepted. A SHA-256 repository would make this 64 hex characters instead; this pattern deliberately does not accept that length, and supporting SHA-256 object names is explicitly out of scope for this payload version \u2014 a later payload version would widen the pattern rather than this one quietly accepting both."
    },
    registry_version: {
      type: "string",
      pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$",
      description: "packages/checks/checks.json's own registry_version at the time these checks ran \u2014 which version of the check *definitions* (predicates, explanations, failure_status mapping) was in effect."
    },
    toolset_projection_version: {
      type: "string",
      pattern: "^v[0-9]+$",
      description: "@mcpcheckup/canonicalizer's TOOLSET_PROJECTION_VERSION at the time toolset_fingerprint/schema_fingerprint were computed \u2014 which fields of a tools/list response were allowlisted into the fingerprint."
    },
    protocol_revision: {
      description: "The MCP protocol revision the tested server was observed speaking, e.g. '2026-07-28'. One of the dates in packages/checks/checks.json's protocol_revision check's revision_matrix. format:\"date\" additionally rejects calendar-impossible values (month 13, day 40, Feb 30, ...) that the shape-only pattern alone would let through. Always a date under coverage 'full'. Under 'auth_gated' it is a date when a handshake response declared one before the authentication challenge stopped the run, and null when the challenge came first (the cross-field rule is the second `allOf` entry).",
      oneOf: [{ type: "null" }, { type: "string", format: "date", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }]
    },
    launch_config_digest: {
      description: "sha256:<64 lowercase hex> digest of the stdio launch configuration (command, args, relevant env keys) used for this run. REQUIRED (non-null) when target.transport is 'stdio', because a stdio server's toolset can vary with its launch environment (PRD \xA712.1) \u2014 comparisons across runs are only meaningful for the same launch config. MUST be null for target.transport 'remote', which has no launch config to pin. (The precise cross-field rule \u2014 which value is legal for which transport \u2014 is enforced by the top-level `allOf` below, not by this subschema alone; a bare TypeScript consumer sees `string | null` here rather than a fully narrowed type, because that specific rule spans two different parts of the object and TypeScript has no clean way to express 'this sibling field's type depends on a nested field two levels away' as a plain type alias.)",
      oneOf: [{ type: "null" }, { type: "string", pattern: "^sha256:[0-9a-f]{64}$" }]
    },
    target: {
      description: "Identifies what was tested. Mirrors the providers/targets tables' own shape and slug pattern (supabase/migrations/0001_core.sql), but as a portable identifier \u2014 never a database UUID. Expressed as two complete, mutually exclusive shapes (rather than one shape plus an if/then patch) specifically so the generated TypeScript type is a real discriminated union on `transport`, not a loosened catch-all.",
      oneOf: [
        { $ref: "#/$defs/remoteTarget" },
        { $ref: "#/$defs/stdioTarget" }
      ]
    },
    observed_at: { $ref: "#/$defs/timestamp" },
    run: {
      type: "object",
      additionalProperties: false,
      required: ["started_at", "finished_at"],
      properties: {
        started_at: { $ref: "#/$defs/timestamp" },
        finished_at: { $ref: "#/$defs/timestamp" }
      }
    },
    probe_region: {
      type: "string",
      minLength: 1,
      description: "Which probe region observed this run. A finding is only ever a claim about what was seen from this vantage point \u2014 see packages/checks/checks.json's cannot_zh notes."
    },
    probe_dns_answer_changed: {
      description: "Whether this run's outbound requests observed the target hostname's DNS answer change mid-probe (re-resolved and compared after every request by @mcpcheckup/ssrf-guard's guardedFetch \u2014 its dnsAnswerChangedDuringProbe signal). This is a condition of THIS RUN, sitting alongside probe_region \u2014 not a judgment about the target, and deliberately not surfaced as any check_id in packages/checks/checks.json or folded into any assertion's assertion_status: many healthy production endpoints legitimately return different DNS answers across requests (round-robin load balancing, CDN edge selection, active failover), so treating this as a per-check verdict would misjudge routine DNS behavior as a target defect \u2014 exactly the kind of false positive this project's >3% kill criteria exists to prevent. It is, however, real evidence worth signing into the envelope: it is the source fact behind packages/checks' ProbeResult.disqualifiedFromPublication (see that package's README), kept as a separate field here so a consumer never has to infer this specific network condition from a field whose purpose may broaden later. REQUIRED (boolean, non-null) when target.transport is 'remote'. MUST be null for 'stdio', which launches a local process and performs no DNS resolution to observe.",
      oneOf: [{ type: "null" }, { type: "boolean" }]
    },
    assertions: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/assertion" }
    },
    toolset_fingerprint: {
      description: "digest() of projectToolset(tools) from @mcpcheckup/canonicalizer, under the canonicalization scheme named in the `canonicalization` field. Always present under coverage 'full'; always null under 'auth_gated', where the tool list sits behind the authentication challenge and was never observed.",
      oneOf: [{ type: "null" }, { type: "string", pattern: "^sha256:[0-9a-f]{64}$" }]
    },
    schema_fingerprint: {
      description: "digest() of projectSchemas(tools) from @mcpcheckup/canonicalizer, under the canonicalization scheme named in the `canonicalization` field. Always present under coverage 'full'; always null under 'auth_gated', for the same reason as toolset_fingerprint.",
      oneOf: [{ type: "null" }, { type: "string", pattern: "^sha256:[0-9a-f]{64}$" }]
    },
    coverage: {
      enum: ["full", "auth_gated"],
      description: "How far the run got, and so what the assertions can speak to. 'full': the run reached the tool list, as the run behind every v0.3 payload did. 'auth_gated': the server answered the probe's credential-free request with HTTP 401 and a well-formed authentication challenge, and the probe sent no credentials in any request, before or after the challenge. Only the checks observable from outside that wall were run; every other assertion is UNVERIFIED with its reason, toolset_fingerprint and schema_fingerprint are null, and auth_observation records what the challenge said."
    },
    run_id: {
      type: "string",
      pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
      description: "Identifies the probe run that produced this payload: a UUID in lowercase hyphenated form (8-4-4-4-12 hex digits). A new one is generated for every run, a retried run included."
    },
    auth_observation: { $ref: "#/$defs/authObservation" }
  },
  allOf: [
    {
      description: "launch_config_digest and probe_dns_answer_changed both track target.transport, not just target's own internal fields: stdio requires launch_config_digest (a stdio server's toolset can vary with its launch environment, PRD \xA712.1) and forbids probe_dns_answer_changed (a local stdio launch does no DNS resolution to observe); remote is the mirror image \u2014 no launch config to pin, but DNS-answer-change observability applies.",
      if: {
        type: "object",
        properties: {
          target: {
            type: "object",
            properties: { transport: { const: "stdio" } },
            required: ["transport"]
          }
        },
        required: ["target"]
      },
      then: {
        type: "object",
        properties: {
          launch_config_digest: { type: "string" },
          probe_dns_answer_changed: { type: "null" }
        }
      },
      else: {
        type: "object",
        properties: {
          launch_config_digest: { type: "null" },
          probe_dns_answer_changed: { type: "boolean" }
        }
      }
    },
    {
      description: "protocol_revision, toolset_fingerprint, schema_fingerprint, auth_observation and the assertions all track coverage. 'auth_gated' requires auth_observation, requires both fingerprints to be null, leaves protocol_revision a date or null, requires every assertion whose check_id is not reachability, redirect_policy, transport_type or auth_metadata to be UNVERIFIED with a non-null unverified_reason, and is only possible for a remote target, since an HTTP 401 challenge needs an HTTP endpoint. 'full' keeps v0.3's rules exactly: protocol_revision and both fingerprints are strings and auth_observation is absent.",
      if: {
        type: "object",
        properties: { coverage: { const: "auth_gated" } },
        required: ["coverage"]
      },
      then: {
        type: "object",
        required: ["auth_observation"],
        properties: {
          auth_observation: { type: "object" },
          target: { type: "object", properties: { transport: { const: "remote" } } },
          toolset_fingerprint: { type: "null" },
          schema_fingerprint: { type: "null" },
          assertions: {
            type: "array",
            items: {
              if: {
                type: "object",
                properties: { check_id: { not: { enum: ["reachability", "redirect_policy", "transport_type", "auth_metadata"] } } },
                required: ["check_id"]
              },
              then: {
                type: "object",
                required: ["unverified_reason"],
                properties: { assertion_status: { const: "UNVERIFIED" }, unverified_reason: { type: "object" } }
              }
            }
          }
        }
      },
      else: {
        type: "object",
        properties: {
          protocol_revision: { type: "string" },
          toolset_fingerprint: { type: "string" },
          schema_fingerprint: { type: "string" },
          auth_observation: false
        }
      }
    }
  ],
  $defs: {
    slug: {
      type: "string",
      pattern: "^[a-z0-9][a-z0-9._-]{0,63}$"
    },
    timestamp: {
      type: "string",
      format: "date-time",
      pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
      description: `RFC 3339, always millisecond precision, always a literal 'Z' offset \u2014 exactly what Date.prototype.toISOString() produces, and nothing else. format:"date-time" alone would accept several other legal RFC 3339 spellings of the same or a nearby instant (no fractional seconds, six-digit fractional seconds, a numeric +00:00 offset instead of Z, a non-UTC offset) \u2014 every one of those is a different byte sequence and therefore canonicalizes to a different fingerprint even when it names the same moment, so exactly one spelling has to be the only legal one.`
    },
    remoteTarget: {
      title: "RemoteTarget",
      type: "object",
      additionalProperties: false,
      required: ["provider", "name", "transport", "endpoint_url", "package_ref"],
      properties: {
        provider: { $ref: "#/$defs/slug", description: "Slug identifying who publishes this target, e.g. an npm scope, a GitHub org, or a hosting operator." },
        name: { $ref: "#/$defs/slug", description: "Slug identifying this target within its provider." },
        transport: { const: "remote" },
        endpoint_url: { type: "string", format: "uri", minLength: 1, description: "The remote MCP endpoint URL." },
        package_ref: { type: "null", description: "Always null for a remote target \u2014 there is no stdio package to reference." }
      }
    },
    stdioTarget: {
      title: "StdioTarget",
      type: "object",
      additionalProperties: false,
      required: ["provider", "name", "transport", "endpoint_url", "package_ref"],
      properties: {
        provider: { $ref: "#/$defs/slug", description: "Slug identifying who publishes this target, e.g. an npm scope, a GitHub org, or a hosting operator." },
        name: { $ref: "#/$defs/slug", description: "Slug identifying this target within its provider." },
        transport: { const: "stdio" },
        endpoint_url: { type: "null", description: "Always null for a stdio target \u2014 there is no network endpoint." },
        package_ref: { type: "string", minLength: 1, description: "The stdio package identifier (e.g. an npm or PyPI package@version reference)." }
      }
    },
    assertionBase: {
      title: "AssertionBase",
      type: "object",
      additionalProperties: false,
      required: ["check_id", "docs_version", "execution_status", "assertion_status", "evidence_provenance", "reason", "unverified_reason"],
      description: "One check's result. execution_status and assertion_status are deliberately separate fields \u2014 'did the probe itself run to completion' and 'what did it conclude' are orthogonal and must never be collapsed into a single pass/fail boolean (CLAUDE.md \u4E09\u6761\u4E0D\u53EF\u8FDD\u53CD\u7684\u4EA7\u54C1\u539F\u5219 #3).",
      properties: {
        check_id: { $ref: "#/$defs/checkId" },
        docs_version: { $ref: "#/$defs/docsVersion" },
        execution_status: { $ref: "#/$defs/executionStatus" },
        assertion_status: { enum: ["VERIFIED", "FAILED", "OBSERVED_RISK", "UNVERIFIED"] },
        evidence_provenance: { $ref: "#/$defs/evidenceProvenance" },
        reason: { $ref: "#/$defs/reasonRef" },
        unverified_reason: { $ref: "#/$defs/reasonRef" }
      }
    },
    assertion: {
      title: "Assertion",
      description: "AssertionBase plus one cross-field rule ajv enforces at runtime: when assertion_status is UNVERIFIED, at least one of reason/unverified_reason must be a non-null reasonRef. That single rule is layered on via allOf/if/then below instead of folded into AssertionBase's own properties, because reason and unverified_reason's *types* (ReasonRef | null) never change based on assertion_status \u2014 only whether a value is required to be non-null does \u2014 so there is nothing for a discriminated TypeScript union to usefully express here; AssertionBase alone is already the precise type.",
      allOf: [
        { $ref: "#/$defs/assertionBase" },
        {
          if: {
            type: "object",
            properties: { assertion_status: { const: "UNVERIFIED" } },
            required: ["assertion_status"]
          },
          then: {
            type: "object",
            description: "Mirrors the database's own `unverified_needs_reason` constraint (assertion_status <> 'UNVERIFIED' OR coalesce(unverified_reason, reason) IS NOT NULL). A reasonRef is either null or a {key, params?} object whose own `required: [\"key\"]` and key pattern already rule out an empty/blank reference (see $defs.reasonRef) \u2014 so ruling out `null` here (via `\"type\": \"object\"`, since reasonRef's base schema already constrains the field to `null | {key,...}`) is sufficient to mean 'is the non-null variant', with no separate minLength/pattern check needed the way the v0.1 bare-string shape required.",
            anyOf: [
              { properties: { unverified_reason: { type: "object" } }, required: ["unverified_reason"] },
              { properties: { reason: { type: "object" } }, required: ["reason"] }
            ]
          }
        }
      ]
    },
    checkId: {
      type: "string",
      pattern: "^[a-z][a-z0-9_]*$",
      description: "References a check_id in packages/checks/checks.json."
    },
    docsVersion: {
      type: "string",
      pattern: "^v[0-9]+\\.[0-9]+\\.[0-9]+$",
      description: "Which version of that check's own docs_version (predicate/explain text) was in effect \u2014 pins down what the check even claimed to test, independent of registry_version."
    },
    executionStatus: {
      enum: ["COMPLETED", "ERROR", "SKIPPED", "BLOCKED"],
      description: "Did the probe itself run to completion? Independent of what it concluded."
    },
    evidenceProvenance: {
      enum: ["INDEPENDENTLY_OBSERVED", "SELF_ATTESTED", "STATICALLY_ANALYZED"],
      description: "How this evidence was obtained \u2014 a third, orthogonal dimension from execution_status/assertion_status."
    },
    reasonRef: {
      description: "A stable, language-neutral reference to reader-facing copy: a catalog key plus optional structured parameters. Rendered into prose by locale at read time (@mcpcheckup/checks' REASON_MESSAGES catalog, or checks.json for the no_baseline_reason special case) \u2014 never baked into the signed bytes as prose. v0.1 payloads used a bare string here; v0.2's payloadType version distinguishes the two shapes, so a consumer must branch on payloadType before parsing this field.",
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["key"],
          properties: {
            key: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
            params: {
              type: "object",
              additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }] }
            }
          }
        }
      ]
    },
    authObservation: {
      title: "AuthObservation",
      type: "object",
      additionalProperties: false,
      required: ["scheme", "param_names", "param_names_truncated", "resource_metadata_url", "resource_metadata_url_withheld", "resource_metadata_body_digest"],
      description: "What the authentication challenge that stopped an 'auth_gated' run said, reduced to names, at most one URL and at most one digest. Apart from resource_metadata_url, which is recorded only under the rules in its own description, no auth-param value is recorded: not realm, not scope, not any other. Of the RFC 9728 protected resource metadata document only a digest of its bytes is kept.",
      properties: {
        scheme: {
          type: "string",
          pattern: "^[a-z0-9!#$%&'*+.^_`|~-]{1,64}$",
          description: "The challenge's auth-scheme, lowercased, e.g. 'bearer': one HTTP token (letters, digits and ! # $ % & ' * + - . ^ _ ` | ~), at most 64 characters. When the WWW-Authenticate value carries more than one challenge, scheme and param_names describe the first one in header order and no other."
        },
        param_names: {
          type: "array",
          maxItems: 16,
          uniqueItems: true,
          items: { type: "string", pattern: "^[a-z0-9_-]{1,32}$" },
          description: "The names of the challenge's auth-params, lowercased, without duplicates and sorted in ascending code-point order: names only, never their values. Each name is 1 to 32 characters of a-z, 0-9, '_' and '-'; at most 16 names. The order is part of the format, because two orders canonicalize to different bytes, but JSON Schema cannot express it, so a schema validator does not check it."
        },
        param_names_truncated: {
          type: "boolean",
          description: "true when at least one of the challenge's auth-param names was left out of param_names: a name that, lowercased, is not 1 to 32 characters of a-z, 0-9, '_' and '-'; a name this package's credentialShapes() flags, as the challenge carries it or lowercased; or a name after the 16th in ascending code-point order. false when every name is listed. A name that appears more than once is listed once and does not count as left out."
        },
        resource_metadata_url: {
          description: "The resource_metadata URL the probe requested the RFC 9728 protected resource metadata document from: the value of the last quoted resource_metadata parameter in the WWW-Authenticate value, whichever challenge carries it, in the form WHATWG URL serialization gives it (new URL(value).href). Recorded only when that form is https, has a host of lowercase letters, digits, '.', '_' and '-' and at most a port after it, carries no userinfo, query or fragment, has a path of RFC 3986 path characters and well-formed percent-escapes only, is at most 512 characters long, and neither that form nor the value as the WWW-Authenticate value gives it has anything this package's credentialShapes() flags. null when the WWW-Authenticate value names none or an empty one, and also null when it names one that breaks any of those rules or is not a URL; resource_metadata_url_withheld tells the two apart.",
          oneOf: [{ type: "null" }, { type: "string", format: "uri", maxLength: 512, pattern: "^https://[^/?#@\\s]+(/[^?#\\s]*)?$" }]
        },
        resource_metadata_url_withheld: {
          type: "boolean",
          description: "true when the WWW-Authenticate value named a resource_metadata URL that was not recorded because it is not a URL or broke a rule stated under resource_metadata_url, which is then null. false otherwise."
        },
        resource_metadata_body_digest: {
          description: "sha256:<64 lowercase hex> over the exact bytes of the body of the HTTP 200 response, after any redirects the probe followed, to its request for the RFC 9728 protected resource metadata document at the URL described under resource_metadata_url: the body as the probe's HTTP client returned it, which is after that client has removed any Content-Encoding it supports and before any character decoding or JSON parsing. Present whenever such a response was received, also when resource_metadata_url is withheld. The document itself is never recorded. null when no such response was received, which is always the case when no resource_metadata URL was named.",
          oneOf: [{ type: "null" }, { type: "string", pattern: "^sha256:[0-9a-f]{64}$" }]
        }
      },
      if: {
        type: "object",
        properties: { resource_metadata_url_withheld: { const: true } },
        required: ["resource_metadata_url_withheld"]
      },
      then: {
        description: "A withheld URL is not recorded, so resource_metadata_url_withheld true and a non-null resource_metadata_url never occur together.",
        type: "object",
        properties: { resource_metadata_url: { type: "null" } }
      },
      else: {
        description: "Not withheld and null means the challenge named no resource_metadata URL: nothing was requested, so there is no body digest either.",
        type: "object",
        if: {
          type: "object",
          properties: { resource_metadata_url: { type: "null" } },
          required: ["resource_metadata_url"]
        },
        then: {
          type: "object",
          properties: { resource_metadata_body_digest: { type: "null" } }
        }
      }
    }
  }
};

// ../canonicalizer/src/errors.ts
var CanonicalizationError = class extends Error {
  code;
  constructor(code2, message) {
    super(message);
    this.name = "CanonicalizationError";
    this.code = code2;
  }
};

// ../canonicalizer/src/canonicalize.ts
function canonicalize(value) {
  return serialize(value, /* @__PURE__ */ new Set());
}
function canonicalBytes(value) {
  return new TextEncoder().encode(canonicalize(value));
}
function serialize(value, stack) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  switch (typeof value) {
    case "number":
      return serializeNumber(value);
    case "string":
      return serializeString(normalizeAndCheckSurrogates(value));
    case "bigint":
      throw new CanonicalizationError("UNSUPPORTED_TYPE", "bigint is not a supported JSON value");
    case "undefined":
      throw new CanonicalizationError("UNSUPPORTED_TYPE", "undefined is not a supported JSON value");
    case "function":
      throw new CanonicalizationError("UNSUPPORTED_TYPE", "function is not a supported JSON value");
    case "symbol":
      throw new CanonicalizationError("UNSUPPORTED_TYPE", "symbol is not a supported JSON value");
    case "object":
      return serializeObjectOrArray(value, stack);
    default:
      throw new CanonicalizationError("UNSUPPORTED_TYPE", `unsupported type: ${typeof value}`);
  }
}
function serializeObjectOrArray(obj, stack) {
  if (stack.has(obj)) {
    throw new CanonicalizationError("CIRCULAR_REFERENCE", "value contains a circular reference");
  }
  stack.add(obj);
  try {
    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => serialize(item, stack)).join(",") + "]";
    }
    return serializePlainObject(obj, stack);
  } finally {
    stack.delete(obj);
  }
}
function serializePlainObject(obj, stack) {
  const rawKeys = Object.keys(obj);
  const originalByNormalized = /* @__PURE__ */ new Map();
  for (const rawKey of rawKeys) {
    const normalizedKey = normalizeAndCheckSurrogates(rawKey);
    const priorRawKey = originalByNormalized.get(normalizedKey);
    if (priorRawKey !== void 0) {
      throw new CanonicalizationError(
        "DUPLICATE_KEY_AFTER_NFC",
        `keys ${JSON.stringify(priorRawKey)} and ${JSON.stringify(rawKey)} both normalize (NFC) to ${JSON.stringify(normalizedKey)}`
      );
    }
    originalByNormalized.set(normalizedKey, rawKey);
  }
  const normalizedKeys = [...originalByNormalized.keys()].sort();
  const parts = normalizedKeys.map((normalizedKey) => {
    const rawKey = originalByNormalized.get(normalizedKey);
    return serializeString(normalizedKey) + ":" + serialize(obj[rawKey], stack);
  });
  return "{" + parts.join(",") + "}";
}
function normalizeAndCheckSurrogates(s) {
  const normalized = s.normalize("NFC");
  for (const grapheme of normalized) {
    if (grapheme.length === 1) {
      const unit = grapheme.charCodeAt(0);
      if (unit >= 55296 && unit <= 57343) {
        throw new CanonicalizationError(
          "LONE_SURROGATE",
          `string contains an unpaired UTF-16 surrogate U+${unit.toString(16).toUpperCase()}, which cannot be encoded as well-formed UTF-8`
        );
      }
    }
  }
  return normalized;
}
function serializeNumber(n) {
  if (!Number.isFinite(n)) {
    throw new CanonicalizationError("NON_FINITE_NUMBER", `number must be finite, got ${String(n)}`);
  }
  if (Object.is(n, -0)) return "0";
  return String(n);
}
var SHORT_ESCAPES = {
  '"': '\\"',
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t"
};
function serializeString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const shortEscape = SHORT_ESCAPES[ch];
    if (shortEscape !== void 0) {
      out += shortEscape;
      continue;
    }
    const unit = s.charCodeAt(i);
    if (unit < 32) {
      out += "\\u" + unit.toString(16).padStart(4, "0");
    } else {
      out += ch;
    }
  }
  return out + '"';
}

// ../canonicalizer/src/digest.ts
function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function digest(value) {
  const bytes = canonicalBytes(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return "sha256:" + toHex(hashBuffer);
}

// ../canonicalizer/src/projections.ts
var TOOLSET_PROJECTION_VERSION = "v1";
function assertToolArray(tools) {
  if (!Array.isArray(tools)) {
    throw new TypeError("expected an array of tool objects");
  }
}
function requireToolName(tool, index) {
  if (typeof tool !== "object" || tool === null || !("name" in tool) || typeof tool.name !== "string") {
    throw new TypeError(`tool at index ${index} is missing a string "name"`);
  }
  return tool.name;
}
function projectToolset(tools) {
  assertToolArray(tools);
  const names = tools.map((tool, i) => requireToolName(tool, i));
  return names.sort();
}
function projectSchemas(tools) {
  assertToolArray(tools);
  const pairs = tools.map((tool, i) => {
    const name = requireToolName(tool, i);
    const inputSchema = tool.inputSchema;
    const sortKey = inputSchema === void 0 ? "" : canonicalize(inputSchema);
    return { name, inputSchema, sortKey };
  });
  pairs.sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
  });
  return pairs.map(({ name, inputSchema }) => ({ name, inputSchema }));
}

// ../attestation-schema/src/attestation.ts
var AUTH_GATED_CHECK_IDS = ["reachability", "redirect_policy", "transport_type", "auth_metadata"];

// ../attestation-schema/src/credential-shapes.ts
var CREDENTIAL_SHAPE_RULES = [
  ["jwt", (s) => /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/.test(s)],
  ["authorization header value", (s) => /\b(?:bearer|basic|token|dpop)\s+[A-Za-z0-9._~+/-]{8,}/i.test(s)],
  ["private key block", (s) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)],
  ["vendor key prefix", (s) => /(?:^|[^A-Za-z0-9])(?:(?:sk|rk|pk)_(?:live|test)_|gh[pousr]_|github_pat_|xox[abprs]-|glpat-|whsec_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20})/.test(s)],
  ["long hex run", (s) => /(?:^|[^0-9A-Za-z])[0-9a-fA-F]{32,}(?![0-9A-Za-z])/.test(s)],
  ["high-entropy token", (s) => s.split(/[^A-Za-z0-9+/=_-]+/).some((p) => p.length >= 24 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p))]
];
function percentDecoded(s) {
  let out = s;
  for (let next = decodeOnce(out); next !== out; next = decodeOnce(out)) out = next;
  return out;
}
function decodeOnce(s) {
  return s.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
var OWN_VALUE_PATHS = [
  ["suite_digest"],
  ["suite_commit"],
  ["launch_config_digest"],
  ["toolset_fingerprint"],
  ["schema_fingerprint"],
  ["run_id"],
  ["auth_observation", "resource_metadata_body_digest"]
];
function schemaPatternAt(path) {
  const schema = attestation_schema_default;
  const node = path.length === 1 ? schema.properties[path[0]] : schema.$defs.authObservation.properties[path[1]];
  const pattern = node.pattern ?? node.oneOf?.find((branch) => branch.pattern)?.pattern;
  if (typeof pattern !== "string") throw new Error(`no pattern in the schema for ${path.join(".")}`);
  return new RegExp(pattern);
}
var OWN_VALUES = OWN_VALUE_PATHS.map((path) => ({ key: path.join("."), pattern: schemaPatternAt(path) }));
function credentialShapes(value, path = []) {
  if (typeof value === "string") {
    const own = OWN_VALUES.find((d) => d.key === path.join("."));
    if (own && own.pattern.test(value)) return [];
    const decoded = percentDecoded(value);
    return CREDENTIAL_SHAPE_RULES.filter(([, matches]) => matches(value) || matches(decoded)).map(([rule]) => `${path.join(".")}: ${rule}`);
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => credentialShapes(v, [...path, String(i)]));
  if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => credentialShapes(v, [...path, k]));
  return [];
}

// ../attestation-schema/src/invariants.ts
var AssertionInvariantError = class extends Error {
  code;
  constructor(code2, message) {
    super(message);
    this.name = "AssertionInvariantError";
    this.code = code2;
  }
};
function assertUnverifiedHasReason(assertion) {
  if (assertion.assertion_status !== "UNVERIFIED") return;
  const hasUnverifiedReason = assertion.unverified_reason !== null && assertion.unverified_reason.key.length > 0;
  const hasReason = assertion.reason !== null && assertion.reason.key.length > 0;
  if (!hasUnverifiedReason && !hasReason) {
    throw new AssertionInvariantError(
      "UNVERIFIED_NEEDS_REASON",
      "assertion_status is UNVERIFIED but both reason and unverified_reason are empty \u2014 UNVERIFIED must always carry a reason (CLAUDE.md \u4E09\u6761\u4E0D\u53EF\u8FDD\u53CD\u7684\u4EA7\u54C1\u539F\u5219 #2)"
    );
  }
}

// ../ssrf-guard/src/errors.ts
var SsrfGuardError = class extends Error {
  code;
  /** Set by guardedFetch on the way out: redirects followed before this request (0 = the URL it was given). */
  hop;
  constructor(code2, message) {
    super(message);
    this.name = new.target.name;
    this.code = code2;
  }
};
var SsrfBlocked = class extends SsrfGuardError {
  detail;
  constructor(code2, detail) {
    super(code2, `blocked (${code2}): ${detail}`);
    this.detail = detail;
  }
};
var BudgetExceeded = class extends SsrfGuardError {
};
var RateLimited = class extends SsrfGuardError {
};
var UpstreamFetchFailed = class extends Error {
  /** As on SsrfGuardError. */
  hop;
  constructor(cause) {
    super("the request to the target failed before a complete response arrived", { cause });
    this.name = new.target.name;
  }
};

// ../ssrf-guard/src/url-target.ts
var SPECIAL_USE_DOMAINS = ["localhost", "local", "internal", "home.arpa"].map((d) => d.split("."));

// ../ssrf-guard/src/ip-policy.ts
function mostSpecificFirst(rows) {
  return [...rows].sort((a, b) => b.prefix - a.prefix);
}
var IPV4_ROWS = [
  // IANA IPv4 Special-Purpose Address Registry, in registry order.
  { base: "0.0.0.0", prefix: 8, code: "THIS_NETWORK", description: '"this network" (0.0.0.0/8, RFC 791)' },
  { base: "0.0.0.0", prefix: 32, code: "THIS_NETWORK", description: '"this host on this network" (0.0.0.0/32, RFC 1122)' },
  { base: "10.0.0.0", prefix: 8, code: "PRIVATE_USE", description: "private-use (10.0.0.0/8, RFC 1918)" },
  { base: "100.64.0.0", prefix: 10, code: "CGNAT", description: "shared address space / CGNAT (100.64.0.0/10, RFC 6598)" },
  { base: "127.0.0.0", prefix: 8, code: "LOOPBACK", description: "loopback (127.0.0.0/8, RFC 1122)" },
  { base: "169.254.0.0", prefix: 16, code: "LINK_LOCAL", description: "link-local (169.254.0.0/16, RFC 3927)" },
  { base: "172.16.0.0", prefix: 12, code: "PRIVATE_USE", description: "private-use (172.16.0.0/12, RFC 1918)" },
  { base: "192.0.0.0", prefix: 24, code: "PROTOCOL_ASSIGNMENT", description: "IETF protocol assignments (192.0.0.0/24, RFC 6890)" },
  { base: "192.0.0.0", prefix: 29, code: "PROTOCOL_ASSIGNMENT", description: "IPv4 service continuity prefix (192.0.0.0/29, RFC 7335)" },
  { base: "192.0.0.8", prefix: 32, code: "PROTOCOL_ASSIGNMENT", description: "IPv4 dummy address (192.0.0.8/32, RFC 7600)" },
  { base: "192.0.0.9", prefix: 32, code: null, description: "Port Control Protocol anycast (192.0.0.9/32, RFC 7723)" },
  { base: "192.0.0.10", prefix: 32, code: null, description: "TURN anycast (192.0.0.10/32, RFC 8155)" },
  { base: "192.0.0.170", prefix: 32, code: "PROTOCOL_ASSIGNMENT", description: "NAT64/DNS64 discovery (192.0.0.170/32, RFC 8880)" },
  { base: "192.0.0.171", prefix: 32, code: "PROTOCOL_ASSIGNMENT", description: "NAT64/DNS64 discovery (192.0.0.171/32, RFC 8880)" },
  { base: "192.0.2.0", prefix: 24, code: "DOCUMENTATION", description: "documentation / TEST-NET-1 (192.0.2.0/24, RFC 5737)" },
  { base: "192.31.196.0", prefix: 24, code: null, description: "AS112-v4 (192.31.196.0/24, RFC 7535)" },
  { base: "192.52.193.0", prefix: 24, code: null, description: "AMT (192.52.193.0/24, RFC 7450)" },
  // The registry gives no "Globally Reachable" value for this one: it was deprecated in 2015
  // and must not be reassigned (RFC 7526). Blocked whole.
  { base: "192.88.99.0", prefix: 24, code: "DEPRECATED", description: "deprecated 6to4 relay anycast (192.88.99.0/24, RFC 7526)" },
  { base: "192.88.99.2", prefix: 32, code: "PROTOCOL_ASSIGNMENT", description: "6a44 relay anycast (192.88.99.2/32, RFC 6751)" },
  { base: "192.168.0.0", prefix: 16, code: "PRIVATE_USE", description: "private-use (192.168.0.0/16, RFC 1918)" },
  { base: "192.175.48.0", prefix: 24, code: null, description: "direct delegation AS112 service (192.175.48.0/24, RFC 7534)" },
  { base: "198.18.0.0", prefix: 15, code: "BENCHMARKING", description: "benchmarking (198.18.0.0/15, RFC 2544)" },
  { base: "198.51.100.0", prefix: 24, code: "DOCUMENTATION", description: "documentation / TEST-NET-2 (198.51.100.0/24, RFC 5737)" },
  { base: "203.0.113.0", prefix: 24, code: "DOCUMENTATION", description: "documentation / TEST-NET-3 (203.0.113.0/24, RFC 5737)" },
  { base: "240.0.0.0", prefix: 4, code: "RESERVED", description: "reserved for future use (240.0.0.0/4, RFC 1112)" },
  { base: "255.255.255.255", prefix: 32, code: "RESERVED", description: "limited broadcast (255.255.255.255/32, RFC 919)" },
  // Not in the special-purpose registry (it has its own): never a unicast destination.
  { base: "224.0.0.0", prefix: 4, code: "MULTICAST", description: "multicast (224.0.0.0/4, RFC 5771)" }
];
var IPV4_TABLE = mostSpecificFirst(IPV4_ROWS);
var IPV6_ROWS = [
  // IANA IPv6 Special-Purpose Address Registry, in registry order. ::ffff:0:0/96
  // (IPv4-mapped) is not a row: classifyIpv6 blocks it whole, with the code the IPv4
  // table gives the embedded address, or RESERVED (see extractMappedIpv4).
  { base: "::1", prefix: 128, code: "LOOPBACK", description: "loopback (::1/128, RFC 4291)" },
  { base: "::", prefix: 128, code: "UNSPECIFIED", description: "unspecified address (::/128, RFC 4291)" },
  // The registry marks this prefix Globally Reachable = True. Blocked whole anyway: the
  // address is an IPv4 address handed to a translator on the path, and where that
  // translator forwards it is something this guard cannot see.
  { base: "64:ff9b::", prefix: 96, code: "NAT64", description: "IPv4/IPv6 translation, well-known prefix (64:ff9b::/96, RFC 6052)" },
  { base: "64:ff9b:1::", prefix: 48, code: "NAT64", description: "IPv4/IPv6 translation, local use (64:ff9b:1::/48, RFC 8215)" },
  { base: "100::", prefix: 64, code: "DISCARD_ONLY", description: "discard-only (100::/64, RFC 6666)" },
  { base: "100:0:0:1::", prefix: 64, code: "DUMMY_PREFIX", description: "dummy IPv6 prefix (100:0:0:1::/64, RFC 9780)" },
  { base: "2001::", prefix: 23, code: "PROTOCOL_ASSIGNMENT", description: "IETF protocol assignments (2001::/23, RFC 2928)" },
  // Globally Reachable is N/A for Teredo in the registry; it tunnels to an IPv4 host
  // this guard cannot see, so it is blocked like its /23 parent.
  { base: "2001::", prefix: 32, code: "TEREDO", description: "Teredo (2001::/32, RFC 4380)" },
  { base: "2001:1::1", prefix: 128, code: null, description: "Port Control Protocol anycast (2001:1::1/128, RFC 7723)" },
  { base: "2001:1::2", prefix: 128, code: null, description: "TURN anycast (2001:1::2/128, RFC 8155)" },
  { base: "2001:1::3", prefix: 128, code: null, description: "DNS-SD service registration protocol anycast (2001:1::3/128, RFC 9665)" },
  { base: "2001:2::", prefix: 48, code: "BENCHMARKING", description: "benchmarking (2001:2::/48, RFC 5180)" },
  { base: "2001:3::", prefix: 32, code: null, description: "AMT (2001:3::/32, RFC 7450)" },
  { base: "2001:4:112::", prefix: 48, code: null, description: "AS112-v6 (2001:4:112::/48, RFC 7535)" },
  // No "Globally Reachable" value in the registry: deprecated in 2014. Blocked like its /23 parent.
  { base: "2001:10::", prefix: 28, code: "DEPRECATED", description: "deprecated, previously ORCHID (2001:10::/28, RFC 4843)" },
  { base: "2001:20::", prefix: 28, code: null, description: "ORCHIDv2 (2001:20::/28, RFC 7343)" },
  { base: "2001:30::", prefix: 28, code: null, description: "drone remote ID entity tags (2001:30::/28, RFC 9374)" },
  { base: "2001:db8::", prefix: 32, code: "DOCUMENTATION", description: "documentation (2001:db8::/32, RFC 3849)" },
  // Globally Reachable is N/A for 6to4 in the registry; it tunnels to the IPv4 address
  // embedded in bits 16-47, which this guard cannot see. Blocked whole.
  { base: "2002::", prefix: 16, code: "SIX_TO_FOUR", description: "6to4 (2002::/16, RFC 3056)" },
  { base: "2620:4f:8000::", prefix: 48, code: null, description: "direct delegation AS112 service (2620:4f:8000::/48, RFC 7534)" },
  { base: "3fff::", prefix: 20, code: "DOCUMENTATION", description: "documentation (3fff::/20, RFC 9637)" },
  { base: "5f00::", prefix: 16, code: "SEGMENT_ROUTING", description: "segment routing (SRv6) SIDs (5f00::/16, RFC 9602)" },
  { base: "fc00::", prefix: 7, code: "UNIQUE_LOCAL", description: "unique local address (fc00::/7, RFC 4193)" },
  { base: "fe80::", prefix: 10, code: "LINK_LOCAL", description: "link-local (fe80::/10, RFC 4291)" },
  // Not in the special-purpose registry (they are in the IPv6 address-space registry).
  { base: "::", prefix: 96, code: "IPV4_COMPATIBLE", description: "deprecated IPv4-compatible address (::/96, RFC 4291)" },
  { base: "fec0::", prefix: 10, code: "SITE_LOCAL", description: "deprecated site-local address (fec0::/10, RFC 3879)" },
  { base: "ff00::", prefix: 8, code: "MULTICAST", description: "multicast (ff00::/8, RFC 4291)" }
];
var IPV6_TABLE = mostSpecificFirst(IPV6_ROWS);

// ../checks/src/latency.ts
var LATENCY_TIMED_TO = "response_headers";
function isLatencySampleMs(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function nearestRank(sortedMs, percent) {
  if (sortedMs.length === 0) throw new RangeError("nearestRank: no samples");
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new RangeError(`nearestRank: percent must be an integer in 1..100, got ${percent}`);
  const rank = Math.ceil(percent * sortedMs.length / 100);
  return sortedMs[rank - 1];
}
function judgeLatency(observations, credentialGated) {
  if (observations === void 0) return { execution_status: "SKIPPED", assertion_status: "UNVERIFIED", reason: { key: "latency_not_recorded" } };
  const sorted = [...observations.samplesMs].sort((a, b) => a - b);
  if (sorted.length > 0 && credentialGated) return { execution_status: "SKIPPED", assertion_status: "UNVERIFIED", reason: { key: "latency_not_signed_auth_gated" } };
  if (sorted.length > 0) {
    return {
      execution_status: "COMPLETED",
      assertion_status: "VERIFIED",
      reason: { key: "latency_measured", params: { p50_ms: nearestRank(sorted, 50), p95_ms: nearestRank(sorted, 95), n: sorted.length, timed_to: LATENCY_TIMED_TO } }
    };
  }
  if (observations.untimedResponses > 0) return { execution_status: "SKIPPED", assertion_status: "UNVERIFIED", reason: { key: "latency_not_recorded" } };
  return { execution_status: "SKIPPED", assertion_status: "UNVERIFIED", reason: { key: "latency_no_samples" } };
}

// ../checks/src/wire.ts
var ProbeAborted = class extends Error {
  code;
  details;
  /** Only ever set for code === 'RATE_LIMITED', and only when the target sent a
   *  parseable delay-seconds Retry-After. A typed field rather than a lookup in
   *  `details`: the scheduler acts on this value (it defers next_run_at), and a
   *  control signal must not be reachable only through the same stringly-keyed
   *  bag that feeds reader copy — the same reasoning that keeps it out of an
   *  assertion's reason.params (see probe.ts's params-channel comment). */
  retryAfterSeconds;
  constructor(code2, message, details, retryAfterSeconds) {
    super(message);
    this.name = "ProbeAborted";
    this.code = code2;
    this.details = details;
    if (retryAfterSeconds !== void 0) this.retryAfterSeconds = retryAfterSeconds;
  }
};
function createProbeContext(startedAtMs) {
  return { requestCount: 0, startedAtMs, redirectCrossHostObserved: false, dnsAnswerChangedObserved: false, latency: { samplesMs: [], untimedResponses: 0 } };
}
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function parseRetryAfterSeconds(raw) {
  if (raw === null) return void 0;
  const token = raw.trim();
  if (!/^[0-9]+$/.test(token)) return void 0;
  const seconds2 = Number(token);
  return Number.isSafeInteger(seconds2) ? seconds2 : void 0;
}
function rateLimitAbort(response) {
  const retryAfterRaw = response.headers.get("retry-after");
  const isRateLimited = response.status === 429 || response.status === 503 && retryAfterRaw !== null;
  if (!isRateLimited) return void 0;
  const retryAfterSeconds = parseRetryAfterSeconds(retryAfterRaw);
  return new ProbeAborted(
    "RATE_LIMITED",
    `\u76EE\u6807\u8FD4\u56DE HTTP ${response.status}\uFF0C\u8981\u6C42\u6211\u4EEC\u7A0D\u540E\u518D\u6765\uFF1B\u672C\u8F6E\u505C\u6B62\u5BF9\u8BE5\u76EE\u6807\u7684\u4E00\u5207\u540E\u7EED\u8BF7\u6C42`,
    { status: response.status, ...retryAfterSeconds !== void 0 ? { retryAfterSeconds } : {} },
    retryAfterSeconds
  );
}
function durationAbort(budget) {
  return new ProbeAborted("MAX_DURATION", `\u63A2\u6D4B\u5DF2\u8D85\u8FC7 ${budget.maxDurationMs}ms \u7684\u603B\u9884\u7B97`, { maxDurationMs: budget.maxDurationMs });
}
async function readBodyWithBudget(response, maxBodyBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (declaredBytes > maxBodyBytes) {
      throw new ProbeAborted(
        "MAX_BODY_BYTES",
        `\u54CD\u5E94\u4F53 Content-Length (${declared}) \u8D85\u8FC7 ${maxBodyBytes} \u5B57\u8282\u7684\u9884\u7B97`,
        { ...Number.isFinite(declaredBytes) ? { declaredBytes } : {}, maxBodyBytes }
      );
    }
  }
  const text = await response.text();
  const actualBytes = new TextEncoder().encode(text).length;
  if (actualBytes > maxBodyBytes) {
    throw new ProbeAborted("MAX_BODY_BYTES", `\u54CD\u5E94\u4F53\u5B9E\u9645\u5927\u5C0F (${actualBytes} \u5B57\u8282) \u8D85\u8FC7 ${maxBodyBytes} \u5B57\u8282\u7684\u9884\u7B97`, { actualBytes, maxBodyBytes });
  }
  return text;
}
var CREDENTIAL_HEADERS = ["authorization", "proxy-authorization", "cookie"];
function withoutCredentialHeaders(init) {
  if (init.headers === void 0) return init;
  const headers = new Headers(init.headers);
  if (!CREDENTIAL_HEADERS.some((name) => headers.has(name))) return init;
  for (const name of CREDENTIAL_HEADERS) headers.delete(name);
  return { ...init, headers };
}
async function sendRequest(fetchImpl, url, init, budget, ctx) {
  const originalHostname = new URL(url).hostname;
  const method = (init.method ?? "GET").toUpperCase();
  let currentUrl = url;
  let currentInit = init;
  let hop = 0;
  const deadlineAtMs = ctx.startedAtMs + budget.maxDurationMs;
  const leftMs = () => Math.min(budget.maxDurationMs, deadlineAtMs - Date.now());
  let abandoned = false;
  const timesThisCall = method === "POST";
  let callTimed = false;
  const onGuardSignal = (signals) => {
    if (abandoned) return;
    if (signals.dnsAnswerChanged) ctx.dnsAnswerChangedObserved = true;
    if (timesThisCall && !callTimed && isLatencySampleMs(signals.responseHeadersMs)) {
      callTimed = true;
      ctx.latency.samplesMs.push(signals.responseHeadersMs);
    }
  };
  const withinDeadline = async (step, left = leftMs()) => {
    if (left <= 0) {
      abandoned = true;
      throw durationAbort(budget);
    }
    const abandon = new AbortController();
    let timer;
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => {
        abandoned = true;
        reject(durationAbort(budget));
        abandon.abort();
      }, left);
    });
    try {
      return await Promise.race([step(left, abandon.signal), expiry]);
    } catch (e) {
      if (abandoned) throw durationAbort(budget);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
  for (; ; ) {
    const remainingMs = leftMs();
    if (remainingMs <= 0) throw durationAbort(budget);
    if (ctx.requestCount >= budget.maxRequests) {
      throw new ProbeAborted("MAX_REQUESTS", `\u63A2\u6D4B\u5DF2\u8FBE\u5230 ${budget.maxRequests} \u6B21\u8BF7\u6C42\u7684\u603B\u9884\u7B97`, { maxRequests: budget.maxRequests });
    }
    ctx.requestCount++;
    const response = await withinDeadline((timeoutMs, signal) => fetchImpl(currentUrl, currentInit, onGuardSignal, { timeoutMs, signal }), remainingMs);
    if (timesThisCall && !callTimed) ctx.latency.untimedResponses++;
    const rateLimited = rateLimitAbort(response);
    if (rateLimited) throw rateLimited;
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (location && method === "GET") {
        hop++;
        const overBudget = () => new ProbeAborted("MAX_REDIRECTS", `\u91CD\u5B9A\u5411\u8DF3\u6570\u8D85\u8FC7 ${budget.maxRedirects} \u7684\u9884\u7B97`, { maxRedirects: budget.maxRedirects });
        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch (e) {
          if (hop > budget.maxRedirects) throw overBudget();
          throw e;
        }
        if (nextUrl.hostname !== originalHostname) ctx.redirectCrossHostObserved = true;
        if (hop > budget.maxRedirects) throw overBudget();
        if (nextUrl.hostname !== new URL(currentUrl).hostname) currentInit = withoutCredentialHeaders(currentInit);
        currentUrl = nextUrl.href;
        continue;
      }
      if (location && method !== "GET") {
        const nextUrl = new URL(location, currentUrl);
        if (nextUrl.hostname !== originalHostname) ctx.redirectCrossHostObserved = true;
      }
    }
    const bodyText = await withinDeadline(() => readBodyWithBudget(response, budget.maxBodyBytes));
    return { status: response.status, headers: response.headers, bodyText, finalUrl: currentUrl };
  }
}

// ../checks/src/other-host-declined.ts
var OtherHostDeclined = class extends Error {
  constructor() {
    super("declined to contact a host other than the endpoint this run checks");
    this.name = "OtherHostDeclined";
  }
};

// ../checks/src/auth.ts
function parseBearerChallenge(headerValue) {
  const params = {};
  for (const m of headerValue.matchAll(/(\w+)="([^"]*)"/g)) {
    params[m[1]] = m[2];
  }
  return {
    resourceMetadataUrl: params.resource_metadata ?? null,
    scope: params.scope ?? null
  };
}
var TCHAR_CLASS = `!#$%&'*+\\-.^_\`|~0-9A-Za-z`;
var TOKEN_Y = new RegExp(`[${TCHAR_CLASS}]+`, "y");
var TOKEN68_BASE_Y = /[A-Za-z0-9\-._~+/]+/y;
var EQUALS_RUN_Y = /=*/y;
var QUOTED_STRING_Y = /"(?:[\t \x21\x23-\x5B\x5D-\x7E\u0080-\uFFFF]|\\[\t \x21-\x7E\u0080-\uFFFF])*"/y;
var MAX_SCHEME_LEN = 64;
function skipWs(v, i) {
  let j = i;
  while (j < v.length && (v[j] === " " || v[j] === "	")) j++;
  return j;
}
function matchAt(re, v, i) {
  re.lastIndex = i;
  const m = re.exec(v);
  return m !== null && m.index === i && m[0].length > 0 ? m[0] : null;
}
function consumeAuthParam(v, i) {
  const name = matchAt(TOKEN_Y, v, i);
  if (name === null) return -1;
  let j = skipWs(v, i + name.length);
  if (v[j] !== "=") return -1;
  j = skipWs(v, j + 1);
  const quoted = matchAt(QUOTED_STRING_Y, v, j);
  if (quoted !== null) return j + quoted.length;
  const bare = matchAt(TOKEN_Y, v, j);
  if (bare !== null) return j + bare.length;
  return -1;
}
function consumeToken68(v, i) {
  const base = matchAt(TOKEN68_BASE_Y, v, i);
  if (base === null) return -1;
  EQUALS_RUN_Y.lastIndex = i + base.length;
  const pad = EQUALS_RUN_Y.exec(v);
  return i + base.length + (pad !== null ? pad[0].length : 0);
}
function classifyCredentialChallenge(status, headers) {
  if (status !== 401) return null;
  const value = headers.get("www-authenticate");
  if (!value) return null;
  const scheme = matchAt(TOKEN_Y, value, 0);
  if (scheme === null) return null;
  if (scheme.length > MAX_SCHEME_LEN) return null;
  const accepted = { scheme: scheme.toLowerCase() };
  let i = scheme.length;
  if (i === value.length || value[i] === ",") return accepted;
  if (value[i] !== " " && value[i] !== "	") return null;
  const afterWs = skipWs(value, i);
  if (afterWs === value.length || value[afterWs] === ",") {
    return accepted;
  }
  for (let k = i; k < afterWs; k++) {
    if (value[k] !== " ") return null;
  }
  i = afterWs;
  const first = consumeAuthParam(value, i);
  if (first >= 0) {
    let j = first;
    for (; ; ) {
      const k = skipWs(value, j);
      if (k === value.length) return accepted;
      if (value[k] !== ",") return null;
      const next = skipWs(value, k + 1);
      const consumed = consumeAuthParam(value, next);
      if (consumed < 0) return accepted;
      j = consumed;
    }
  }
  const end = consumeToken68(value, i);
  if (end < 0) return null;
  const after = skipWs(value, end);
  if (after === value.length || value[after] === ",") return accepted;
  return null;
}
function firstChallengeParamNames(value) {
  const scheme = matchAt(TOKEN_Y, value, 0);
  if (scheme === null || value[scheme.length] !== " ") return [];
  const afterWs = skipWs(value, scheme.length);
  if (afterWs === value.length || value[afterWs] === ",") return [];
  for (let k = scheme.length; k < afterWs; k++) if (value[k] !== " ") return [];
  const names = [];
  for (let i = afterWs; ; ) {
    const end = consumeAuthParam(value, i);
    if (end < 0) return names;
    names.push(matchAt(TOKEN_Y, value, i));
    const k = skipWs(value, end);
    if (k === value.length || value[k] !== ",") return names;
    i = skipWs(value, k + 1);
  }
}
function judgeAuthChallenge(status, wwwAuthenticate) {
  if (status !== 401) {
    return { verdict: { status: "UNVERIFIED", reason: { key: "auth_no_challenge_observed" } } };
  }
  if (!wwwAuthenticate) {
    return { verdict: { status: "UNVERIFIED", reason: { key: "auth_401_no_challenge" } } };
  }
  const challenge = parseBearerChallenge(wwwAuthenticate);
  if (!challenge.resourceMetadataUrl) {
    return { verdict: { status: "UNVERIFIED", reason: { key: "auth_challenge_no_metadata_url" } } };
  }
  return { fetch: { url: challenge.resourceMetadataUrl, scope: challenge.scope } };
}
async function judgeAuthMetadata(opts) {
  const { callResult } = opts;
  return judgeAuthMetadataFrom(opts, judgeAuthChallenge(callResult.status, callResult.headers.get("www-authenticate")));
}
async function judgeAuthMetadataFromGate(opts) {
  const { challenge } = opts;
  return judgeAuthMetadataFrom(opts, judgeAuthChallenge(challenge.status, challenge.wwwAuthenticate));
}
async function judgeAuthMetadataFrom(opts, judgment) {
  if ("verdict" in judgment) {
    return judgment.verdict;
  }
  const { fetchImpl, budget, ctx } = opts;
  const challenge = judgment.fetch;
  const metaRes = await sendRequest(fetchImpl, challenge.url, { method: "GET" }, budget, ctx);
  if (metaRes.status !== 200) {
    return { status: "OBSERVED_RISK", reason: { key: "auth_metadata_http_error", params: { status: metaRes.status } } };
  }
  let metadata;
  try {
    metadata = JSON.parse(metaRes.bodyText);
  } catch {
    return { status: "OBSERVED_RISK", reason: { key: "auth_metadata_invalid_json" } };
  }
  if (typeof metadata !== "object" || metadata === null) {
    return { status: "OBSERVED_RISK", reason: { key: "auth_metadata_not_json_object" } };
  }
  const scopesSupported = metadata.scopes_supported;
  if (challenge.scope && Array.isArray(scopesSupported)) {
    const declared = challenge.scope.split(/\s+/).filter(Boolean);
    const supported = new Set(scopesSupported.filter((s) => typeof s === "string"));
    const contradicted = declared.some((s) => !supported.has(s));
    if (contradicted) {
      return { status: "OBSERVED_RISK", reason: { key: "auth_scope_contradiction" } };
    }
  }
  return { status: "VERIFIED" };
}

// ../checks/src/protocol.ts
var CLIENT_INFO = { name: "mcp-checkup-prober", version: "0.1.0" };
var MODERN_PROBE_VERSION = "2026-07-28";
var LEGACY_PROBE_VERSION = "2025-11-25";
function offeredRevision(mode) {
  return mode === "modern" ? MODERN_PROBE_VERSION : LEGACY_PROBE_VERSION;
}
function isSseContentType(contentType) {
  return (contentType ?? "").toLowerCase().includes("text/event-stream");
}
function extractSseDataPayloads(bodyText) {
  return bodyText.split(/\r?\n\r?\n/).map(
    (eventBlock) => eventBlock.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice("data:".length).replace(/^ /, "")).join("\n")
  ).filter((payload) => payload.length > 0);
}
function parseJsonRpcText(bodyText) {
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { isJsonRpc: false };
  }
  if (typeof parsed !== "object" || parsed === null) return { isJsonRpc: false };
  const obj = parsed;
  if (obj.jsonrpc !== "2.0") return { isJsonRpc: false };
  if ("result" in obj) return { isJsonRpc: true, id: obj.id, result: obj.result };
  if (typeof obj.error === "object" && obj.error !== null && typeof obj.error.code === "number" && typeof obj.error.message === "string") {
    return { isJsonRpc: true, id: obj.id, error: obj.error };
  }
  return { isJsonRpc: false };
}
function jsonRpcCandidates(bodyText, contentType) {
  return isSseContentType(contentType) ? extractSseDataPayloads(bodyText) : [bodyText];
}
function parseJsonRpcBody(bodyText, contentType) {
  for (const candidate of jsonRpcCandidates(bodyText, contentType)) {
    const parsed = parseJsonRpcText(candidate);
    if (parsed.isJsonRpc) return parsed;
  }
  return { isJsonRpc: false };
}
var RECOGNIZED_MODERN_ERROR_CODES = /* @__PURE__ */ new Set([-32020, -32021, -32022]);
function modernMeta(protocolVersion) {
  return {
    "io.modelcontextprotocol/protocolVersion": protocolVersion,
    "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
    "io.modelcontextprotocol/clientCapabilities": {}
  };
}
function modernHeaders(protocolVersion, mcpMethod, mcpName) {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": protocolVersion,
    "mcp-method": mcpMethod,
    ...mcpName ? { "mcp-name": mcpName } : {}
  };
}
function legacyHeaders(extra) {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...extra
  };
}
async function sendModern(fetchImpl, endpoint, budget, ctx, method, id, extraParams, protocolVersion, mcpName) {
  return sendRequest(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: modernHeaders(protocolVersion, method, mcpName),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...extraParams, _meta: modernMeta(protocolVersion) } })
    },
    budget,
    ctx
  );
}
function failure(key, params = {}) {
  return Object.keys(params).length > 0 ? { key, params } : { key };
}
function jsonRpcErrorCode(parsed) {
  const code2 = parsed.error?.code;
  return Number.isSafeInteger(code2) ? { jsonrpc_error_code: code2 === 0 ? 0 : code2 } : {};
}
function initializeFailure(status, parsed) {
  if (status !== 200) return failure("handshake_initialize_http_error", { status });
  if (!parsed.isJsonRpc) return failure("handshake_initialize_not_jsonrpc");
  if (parsed.error) return failure("handshake_initialize_jsonrpc_error", jsonRpcErrorCode(parsed));
  return failure("handshake_initialize_no_protocol_version");
}
function gateChallenge(status, headers) {
  const challenge = classifyCredentialChallenge(status, headers);
  const wwwAuthenticate = headers.get("www-authenticate");
  return challenge && wwwAuthenticate !== null ? { scheme: challenge.scheme, status, wwwAuthenticate } : null;
}
function credentialChallengeFrom(status, headers) {
  const challenge = gateChallenge(status, headers);
  return challenge ? { credentialChallenge: challenge } : {};
}
function discoverAnswered(status) {
  return status >= 200 && status < 300;
}
async function performHandshake(opts) {
  const { fetchImpl, endpoint, budget, ctx, newId } = opts;
  const discover = await sendModern(fetchImpl, endpoint, budget, ctx, "server/discover", newId(), {}, MODERN_PROBE_VERSION);
  const answered = discoverAnswered(discover.status);
  if (answered || discover.status >= 400 && discover.status < 500) {
    const parsed = parseJsonRpcBody(discover.bodyText, discover.headers.get("content-type"));
    const result = answered && parsed.isJsonRpc ? parsed.result : void 0;
    const supportedVersions = result?.supportedVersions;
    if (Array.isArray(supportedVersions) && typeof supportedVersions[0] === "string") {
      return { mode: "modern", handshakeOk: true, protocolVersionDeclared: supportedVersions[0], currentEndpoint: discover.finalUrl };
    }
    if (parsed.isJsonRpc && parsed.error && RECOGNIZED_MODERN_ERROR_CODES.has(parsed.error.code)) {
      return {
        mode: "modern",
        handshakeOk: false,
        protocolVersionDeclared: null,
        currentEndpoint: discover.finalUrl,
        failure: failure("handshake_discover_rejected", { status: discover.status, jsonrpc_error_code: parsed.error.code })
      };
    }
    return performLegacyHandshake(fetchImpl, discover.finalUrl, budget, ctx, newId);
  }
  return {
    mode: "modern",
    handshakeOk: false,
    protocolVersionDeclared: null,
    currentEndpoint: discover.finalUrl,
    failure: failure("handshake_discover_http_error", { status: discover.status })
  };
}
async function performLegacyHandshake(fetchImpl, endpoint, budget, ctx, newId) {
  const initRes = await sendRequest(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: legacyHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: newId(),
        method: "initialize",
        params: { protocolVersion: LEGACY_PROBE_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }
      })
    },
    budget,
    ctx
  );
  const parsed = parseJsonRpcBody(initRes.bodyText, initRes.headers.get("content-type"));
  const result = parsed.isJsonRpc ? parsed.result : void 0;
  const protocolVersion = result?.protocolVersion;
  const sessionId = initRes.headers.get("mcp-session-id") ?? void 0;
  if (initRes.status !== 200 || typeof protocolVersion !== "string") {
    return {
      mode: "legacy",
      handshakeOk: false,
      protocolVersionDeclared: null,
      currentEndpoint: initRes.finalUrl,
      failure: initializeFailure(initRes.status, parsed),
      ...credentialChallengeFrom(initRes.status, initRes.headers)
    };
  }
  const ackRes = await sendRequest(
    fetchImpl,
    initRes.finalUrl,
    {
      method: "POST",
      headers: legacyHeaders(sessionId ? { "mcp-session-id": sessionId } : void 0),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
    },
    budget,
    ctx
  );
  if (ackRes.status < 200 || ackRes.status >= 300) {
    return {
      mode: "legacy",
      handshakeOk: false,
      protocolVersionDeclared: protocolVersion,
      ...sessionId ? { sessionId } : {},
      currentEndpoint: ackRes.finalUrl,
      failure: failure("handshake_ack_http_error", { status: ackRes.status }),
      ...credentialChallengeFrom(ackRes.status, ackRes.headers)
    };
  }
  return { mode: "legacy", handshakeOk: true, protocolVersionDeclared: protocolVersion, ...sessionId ? { sessionId } : {}, currentEndpoint: ackRes.finalUrl };
}
var MAX_TOOLS_LISTED = 5e3;
function nextCursorOf(result) {
  return Object.hasOwn(result, "nextCursor") && result.nextCursor !== null ? result.nextCursor : void 0;
}
function toolsListFailure(ok, challenge, handshakeOk, status, parsed) {
  if (ok || challenge && handshakeOk) return {};
  if (challenge) return { failure: failure("tools_list_challenge_after_failed_handshake") };
  if (!parsed.isJsonRpc) return { failure: failure("tools_list_not_jsonrpc", { status }) };
  if (parsed.error) return { failure: failure("tools_list_jsonrpc_error", { status, ...jsonRpcErrorCode(parsed) }) };
  return { failure: failure("tools_list_not_array", { status }) };
}
async function performToolsList(opts) {
  const { fetchImpl, budget, ctx, newId, handshake, maxPages } = opts;
  const endpoint = handshake.currentEndpoint;
  const sendPage = (params, pageBudget) => handshake.mode === "modern" ? sendModern(fetchImpl, endpoint, pageBudget, ctx, "tools/list", newId(), params, handshake.protocolVersionDeclared ?? MODERN_PROBE_VERSION) : sendRequest(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: legacyHeaders({
        "mcp-protocol-version": handshake.protocolVersionDeclared ?? LEGACY_PROBE_VERSION,
        ...handshake.sessionId ? { "mcp-session-id": handshake.sessionId } : {}
      }),
      body: JSON.stringify({ jsonrpc: "2.0", id: newId(), method: "tools/list", params })
    },
    pageBudget,
    ctx
  );
  const res = await sendPage({}, budget);
  const challenge = gateChallenge(res.status, res.headers);
  const parsed = parseJsonRpcBody(res.bodyText, res.headers.get("content-type"));
  const result = parsed.isJsonRpc ? parsed.result : void 0;
  const tools = result?.tools;
  const ok = Array.isArray(tools) && challenge === null;
  if (!ok) {
    return {
      ok,
      tools: null,
      currentEndpoint: res.finalUrl,
      ...challenge ? { credentialChallenge: challenge } : {},
      ...toolsListFailure(ok, challenge, handshake.handshakeOk, res.status, parsed)
    };
  }
  const all = [];
  let incomplete = false;
  const keep = (pageTools) => {
    const room = MAX_TOOLS_LISTED - all.length;
    if (pageTools.length > room) incomplete = true;
    all.push(...pageTools.slice(0, room));
  };
  keep(tools);
  let cursor = nextCursorOf(result);
  let pages = 1;
  while (cursor !== void 0) {
    if (pages >= maxPages || all.length >= MAX_TOOLS_LISTED || typeof cursor !== "string") {
      incomplete = true;
      break;
    }
    const page = await readFurtherPage(cursor);
    if (page === null) {
      incomplete = true;
      break;
    }
    pages++;
    keep(page.tools);
    cursor = page.cursor;
  }
  return {
    ok,
    tools: all,
    currentEndpoint: res.finalUrl,
    ...incomplete ? { incomplete: true } : {}
  };
  async function readFurtherPage(pageCursor) {
    const counted = ctx.requestCount;
    let pageRes;
    try {
      pageRes = await sendPage({ cursor: pageCursor }, { ...budget, maxRequests: Number.MAX_SAFE_INTEGER });
    } catch (e) {
      if ((e instanceof ProbeAborted || e instanceof BudgetExceeded) && (e.code === "MAX_DURATION" || e.code === "MAX_BODY_BYTES")) return null;
      throw e;
    } finally {
      ctx.requestCount = counted;
    }
    if (gateChallenge(pageRes.status, pageRes.headers) !== null) return null;
    const pageParsed = parseJsonRpcBody(pageRes.bodyText, pageRes.headers.get("content-type"));
    const pageResult = pageParsed.isJsonRpc ? pageParsed.result : void 0;
    const pageTools = pageResult?.tools;
    if (!Array.isArray(pageTools)) return null;
    return { tools: pageTools, cursor: nextCursorOf(pageResult) };
  }
}
async function performUnknownToolCall(opts) {
  const { fetchImpl, budget, ctx, newId, handshake, toolName: toolName2 } = opts;
  const endpoint = handshake.currentEndpoint;
  const res = handshake.mode === "modern" ? await sendModern(
    fetchImpl,
    endpoint,
    budget,
    ctx,
    "tools/call",
    newId(),
    { name: toolName2, arguments: {} },
    handshake.protocolVersionDeclared ?? MODERN_PROBE_VERSION,
    toolName2
  ) : await sendRequest(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: legacyHeaders({
        "mcp-protocol-version": handshake.protocolVersionDeclared ?? LEGACY_PROBE_VERSION,
        ...handshake.sessionId ? { "mcp-session-id": handshake.sessionId } : {}
      }),
      body: JSON.stringify({ jsonrpc: "2.0", id: newId(), method: "tools/call", params: { name: toolName2, arguments: {} } })
    },
    budget,
    ctx
  );
  return { status: res.status, headers: res.headers, bodyText: res.bodyText, currentEndpoint: res.finalUrl };
}

// ../checks/src/auth-observation.ts
var PARAM_NAME = /^[a-z0-9_-]{1,32}$/;
var MAX_PARAM_NAMES = 16;
var MAX_URL_LENGTH = 512;
var RECORDABLE_URL = /^https:\/\/[a-z0-9._-]+(?::[0-9]+)?(?:\/(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-Fa-f]{2})*)*$/;
var isCredentialShaped = (s) => credentialShapes(s).length > 0;
function keepLastOkBody(fetchImpl) {
  let last = null;
  return {
    fetchImpl: async (input, init, onGuardSignal, options) => {
      const response = await fetchImpl(input, init, onGuardSignal, options);
      if (response.status !== 200) {
        last = null;
        return response;
      }
      const seen = { chunks: [], complete: response.body === null };
      last = seen;
      if (response.body === null) return response;
      const copy = new TransformStream({
        transform(chunk, controller) {
          seen.chunks.push(chunk.slice());
          controller.enqueue(chunk);
        },
        flush() {
          seen.complete = true;
        }
      });
      return new Response(response.body.pipeThrough(copy), { status: response.status, statusText: response.statusText, headers: response.headers });
    },
    lastOkBody: () => {
      if (last === null || !last.complete) return null;
      const bytes = new Uint8Array(last.chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const chunk of last.chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      return bytes;
    }
  };
}
async function authObservationOf(challenge, metadataBody) {
  if (isCredentialShaped(challenge.wwwAuthenticate.slice(0, challenge.scheme.length)) || isCredentialShaped(challenge.scheme)) return null;
  const names = firstChallengeParamNames(challenge.wwwAuthenticate);
  const recordable = (name) => PARAM_NAME.test(name.toLowerCase()) && !isCredentialShaped(name) && !isCredentialShaped(name.toLowerCase());
  const listed = [...new Set(names.filter(recordable).map((name) => name.toLowerCase()))].sort();
  const url = recordableUrl(parseBearerChallenge(challenge.wwwAuthenticate).resourceMetadataUrl);
  return {
    scheme: challenge.scheme,
    param_names: listed.slice(0, MAX_PARAM_NAMES),
    param_names_truncated: listed.length > MAX_PARAM_NAMES || !names.every(recordable),
    resource_metadata_url: url.url,
    resource_metadata_url_withheld: url.withheld,
    resource_metadata_body_digest: metadataBody === null ? null : await sha256Ref(metadataBody)
  };
}
function recordableUrl(raw) {
  if (!raw) return { url: null, withheld: false };
  let href;
  try {
    href = new URL(raw).href;
  } catch {
    return { url: null, withheld: true };
  }
  const ok = href.length <= MAX_URL_LENGTH && RECORDABLE_URL.test(href) && !isCredentialShaped(href) && !isCredentialShaped(raw);
  return ok ? { url: href, withheld: false } : { url: null, withheld: true };
}
async function sha256Ref(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return "sha256:" + Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ../checks/src/error-taxonomy.ts
function judgeErrorTaxonomy(callResult) {
  if (callResult.status === 401 || callResult.status === 403) {
    return { status: "UNVERIFIED", reason: { key: "error_shape_not_observed" } };
  }
  const contentType = callResult.headers.get("content-type");
  const parsed = parseJsonRpcBody(callResult.bodyText, contentType);
  if (parsed.isJsonRpc && parsed.error) {
    return { status: "VERIFIED" };
  }
  return { status: "OBSERVED_RISK", reason: classifyUnknownToolResponse(callResult, contentType, parsed) };
}
var SCENARIO = "tools_call_unknown_tool";
var RECORDED_MEDIA_TYPES = /* @__PURE__ */ new Set(["application/json", "text/event-stream", "text/html", "text/plain"]);
function mediaTypeParam(contentType) {
  if (contentType === null || contentType.trim() === "") return "none";
  const essence = contentType.split(";", 1)[0].trim().toLowerCase();
  return RECORDED_MEDIA_TYPES.has(essence) ? essence : "other";
}
function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function classifyUnknownToolResponse(callResult, contentType, parsed) {
  const params = {
    scenario: SCENARIO,
    status: callResult.status,
    media_type: mediaTypeParam(contentType)
  };
  const reason = (cls) => ({ key: `error_taxonomy_${cls}`, params });
  if (callResult.bodyText === "") return reason("empty_body");
  const candidates = jsonRpcCandidates(callResult.bodyText, contentType);
  if (isSseContentType(contentType) && candidates.length === 0) return reason("event_stream_no_data");
  if (parsed.isJsonRpc) {
    const result = parsed.result;
    return reason(typeof result === "object" && result !== null && result.isError === true ? "result_is_error" : "result_ok");
  }
  const values = candidates.map(parseJson);
  const selfDeclared = values.find(
    (v) => v.ok && isJsonObject(v.value) && v.value.jsonrpc === "2.0"
  );
  if (selfDeclared !== void 0) {
    const error = selfDeclared.value.error;
    const code2 = isJsonObject(error) ? error.code : void 0;
    if (Number.isSafeInteger(code2)) params.jsonrpc_error_code = code2 === 0 ? 0 : code2;
    return reason("jsonrpc_malformed");
  }
  return reason(values.some((v) => v.ok) ? "not_jsonrpc" : "not_json");
}

// ../checks/src/fingerprint.ts
function failed(e) {
  return { status: "FAILED", reason: { key: e instanceof TypeError ? "fingerprint_tool_missing_name" : "fingerprint_canonicalize_failed" } };
}
async function computeToolsetFingerprint(tools) {
  try {
    return { status: "VERIFIED", fingerprint: await digest(projectToolset(tools)) };
  } catch (e) {
    return failed(e);
  }
}
async function computeSchemaFingerprint(tools) {
  try {
    return { status: "VERIFIED", fingerprint: await digest(projectSchemas(tools)) };
  } catch (e) {
    return failed(e);
  }
}
function toolName(tool) {
  if (typeof tool === "object" && tool !== null && typeof tool.name === "string") {
    return tool.name;
  }
  return null;
}
async function buildToolSnapshot(tools, observedAt) {
  const toolsetResult = await computeToolsetFingerprint(tools);
  const schemaResult = await computeSchemaFingerprint(tools);
  const entries = [];
  for (const tool of tools) {
    const name = toolName(tool);
    const description = typeof tool?.description === "string" ? tool.description : null;
    const inputSchema = tool?.inputSchema;
    let hash = null;
    if (name !== null) {
      try {
        hash = await digest({ name, inputSchema });
      } catch {
        hash = null;
      }
    }
    entries.push({ name: name ?? "", description, inputSchema, hash });
  }
  return {
    observed_at: observedAt,
    toolset_fingerprint: toolsetResult.status === "VERIFIED" ? toolsetResult.fingerprint : null,
    schema_fingerprint: schemaResult.status === "VERIFIED" ? schemaResult.fingerprint : null,
    tools: entries
  };
}

// ../checks/src/probe.ts
var PROBE_TOOL_NAME = "__mcpcheckup_probe_nonexistent_tool__";
var NOTHING_TO_OBSERVE_KEYS = /* @__PURE__ */ new Set(["auth_no_challenge_observed", "error_shape_not_observed"]);
function executionOf(verdict) {
  return verdict.status === "UNVERIFIED" && verdict.reason != null && NOTHING_TO_OBSERVE_KEYS.has(verdict.reason.key) ? "SKIPPED" : "COMPLETED";
}
function classified(failure2, checkId) {
  if (!failure2) throw new Error(`${checkId} is FAILED but protocol.ts classified no reason`);
  return failure2;
}
var GUARD_CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,63}$/;
function guardErrorReason(e, budget, reachabilitySettled) {
  const other = () => reachabilitySettled ? { key: "probe_cascade_incomplete" } : { key: "reachability_unanswered", params: { kind: "other" } };
  if (e instanceof UpstreamFetchFailed) return other();
  if (e instanceof BudgetExceeded) {
    if (e.code === "MAX_DURATION") {
      if (reachabilitySettled) return { key: "probe_budget_exhausted_duration", params: { maxDurationMs: budget.maxDurationMs } };
      return e.hop === 0 ? { key: "reachability_unanswered", params: { kind: "timeout" } } : other();
    }
    if (e.code === "MAX_REQUESTS") return { key: "probe_budget_exhausted_requests", params: { maxRequests: budget.maxRequests } };
    if (e.code === "MAX_REDIRECTS") return { key: "probe_budget_exhausted_redirects", params: { maxRedirects: budget.maxRedirects } };
    if (e.code === "MAX_BODY_BYTES") return { key: "probe_budget_exhausted_body", params: { maxBodyBytes: budget.maxBodyBytes } };
    return void 0;
  }
  if (e instanceof RateLimited) return { key: "probe_rate_limited" };
  if (e instanceof SsrfBlocked) {
    if (e.code === "RESOLUTION_FAILED") return e.hop === 0 && !reachabilitySettled ? { key: "reachability_dns_failed" } : other();
    if (e.code === "RESOLVER_UNAVAILABLE") return { key: "probe_resolver_unavailable" };
    if (GUARD_CODE_SHAPE.test(e.code)) return { key: "probe_blocked_by_policy", params: { code: e.code } };
  }
  return void 0;
}
var ERROR_CLASS_SHAPE = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
function errorClassOf(e) {
  if (e === null || e === void 0) return String(e);
  try {
    const name = Object(e).constructor?.name;
    return typeof name === "string" && ERROR_CLASS_SHAPE.test(name) ? name : "unknown";
  } catch {
    return "unknown";
  }
}
function docsVersionFor(registry, checkId) {
  return registry.checks.find((c) => c.check_id === checkId)?.docs_version ?? "unknown";
}
function checkDef(registry, checkId) {
  return registry.checks.find((c) => c.check_id === checkId);
}
function judgeBaselineCheck(checkId, fp, baselineValue, now, registry, A, driftEvents) {
  if (fp.status !== "VERIFIED") {
    A(checkId, "SKIPPED", "UNVERIFIED", { key: "fingerprint_comparison_unavailable" });
    return;
  }
  if (baselineValue === void 0) {
    const def = checkDef(registry, checkId);
    const reason = def?.no_baseline_reason_zh ? { key: "no_baseline_reason", params: { check_id: checkId } } : { key: "no_baseline_reason_generic" };
    A(checkId, "SKIPPED", "UNVERIFIED", reason);
    return;
  }
  if (fp.fingerprint === baselineValue) {
    A(checkId, "COMPLETED", "VERIFIED");
    return;
  }
  A(checkId, "COMPLETED", "FAILED", { key: "fingerprint_baseline_mismatch" });
  driftEvents.push({ check_id: checkId, previous_fingerprint: baselineValue, current_fingerprint: fp.fingerprint, detected_at: now() });
}
async function runProbe(input) {
  const { target, fetchImpl, budget, now, newId, approvedBaseline, provenance, registry } = input;
  const assertionsByCheckId = /* @__PURE__ */ new Map();
  const driftEvents = [];
  let disqualifiedFromPublication;
  let toolSnapshot;
  let ctx;
  let protocolRevisionDeclared = null;
  let probeOfferedRevision = null;
  let rateLimited;
  let authObservation;
  let handshakeGated = false;
  const A = (check_id, execution_status, assertion_status, reason = null) => {
    const assertion = {
      check_id,
      docs_version: docsVersionFor(registry, check_id),
      execution_status,
      assertion_status,
      evidence_provenance: provenance,
      reason,
      unverified_reason: assertion_status === "UNVERIFIED" ? reason : null
    };
    assertUnverifiedHasReason(assertion);
    assertionsByCheckId.set(check_id, assertion);
  };
  const cascadeRemaining = (execution_status, reason) => {
    for (const def of registry.checks) {
      if (assertionsByCheckId.has(def.check_id)) continue;
      if (def.check_id === "latency_profile") continue;
      A(def.check_id, execution_status, "UNVERIFIED", reason);
    }
  };
  A("tls_certificate", "SKIPPED", "UNVERIFIED", { key: "tls_certificate_out_of_scope" });
  if (target.transport === "stdio") {
    cascadeRemaining("SKIPPED", { key: "stdio_out_of_scope" });
    return finalize();
  }
  const skipToolsDerivedChecks = (reason) => {
    for (const check_id of ["toolset_fingerprint", "schema_fingerprint", "tool_description_hygiene", "toolset_unchanged_vs_approved", "schema_unchanged_vs_approved"]) {
      A(check_id, "SKIPPED", "UNVERIFIED", reason);
    }
  };
  try {
    ctx = createProbeContext(Date.now());
    const handshake = await performHandshake({ fetchImpl, endpoint: target.endpointUrl, budget, ctx, newId });
    A("reachability", "COMPLETED", "VERIFIED");
    protocolRevisionDeclared = handshake.protocolVersionDeclared;
    probeOfferedRevision = offeredRevision(handshake.mode);
    const handshakeCredentialGated = !handshake.handshakeOk && handshake.credentialChallenge !== void 0;
    handshakeGated = handshakeCredentialGated;
    if (handshakeCredentialGated) {
      const reason = { key: "credential_required", params: { scheme: handshake.credentialChallenge.scheme } };
      A("discovery_handshake", "COMPLETED", "UNVERIFIED", reason);
      A("protocol_revision", "COMPLETED", "UNVERIFIED", reason);
    } else {
      if (handshake.handshakeOk) {
        A("discovery_handshake", "COMPLETED", "VERIFIED");
      } else {
        A("discovery_handshake", "COMPLETED", "FAILED", classified(handshake.failure, "discovery_handshake"));
      }
      const revisionMatrix = checkDef(registry, "protocol_revision")?.revision_matrix ?? [];
      if (handshake.protocolVersionDeclared && revisionMatrix.includes(handshake.protocolVersionDeclared)) {
        A("protocol_revision", "COMPLETED", "VERIFIED");
      } else {
        A("protocol_revision", "COMPLETED", "FAILED", { key: handshake.protocolVersionDeclared ? "protocol_revision_unknown" : "protocol_revision_missing" });
      }
    }
    A("transport_type", "COMPLETED", "VERIFIED");
    const toolsList = await performToolsList({ fetchImpl, budget, ctx, newId, handshake, maxPages: handshakeCredentialGated ? 1 : registry.budget.max_tools_list_pages });
    const listIncomplete = toolsList.ok && toolsList.incomplete ? { key: "tools_list_incomplete" } : null;
    let probeCallWithheld = !toolsList.ok ? null : toolsList.tools.some((tool) => typeof tool === "object" && tool !== null && tool.name === PROBE_TOOL_NAME) ? { key: "probe_tool_name_collision" } : listIncomplete ? { key: "probe_tool_name_unverifiable" } : null;
    let gateChallenge2;
    if (handshakeCredentialGated) {
      const reason = { key: "credential_required", params: { scheme: handshake.credentialChallenge.scheme } };
      A("tools_list", "COMPLETED", "UNVERIFIED", reason);
      skipToolsDerivedChecks(reason);
      probeCallWithheld = reason;
      gateChallenge2 = handshake.credentialChallenge;
    } else if (handshake.handshakeOk && !toolsList.ok && toolsList.credentialChallenge !== void 0) {
      const reason = { key: "credential_required", params: { scheme: toolsList.credentialChallenge.scheme } };
      A("tools_list", "COMPLETED", "UNVERIFIED", reason);
      skipToolsDerivedChecks(reason);
      probeCallWithheld = reason;
      gateChallenge2 = toolsList.credentialChallenge;
    } else if (toolsList.ok) {
      A("tools_list", "COMPLETED", "VERIFIED");
      const tools = toolsList.tools;
      if (listIncomplete) {
        A("toolset_fingerprint", "SKIPPED", "UNVERIFIED", listIncomplete);
        A("schema_fingerprint", "SKIPPED", "UNVERIFIED", listIncomplete);
        const hygiene = runHygieneCheck(tools);
        if (hygiene.assertion_status === "OBSERVED_RISK") A("tool_description_hygiene", "COMPLETED", "OBSERVED_RISK", hygiene.reason);
        else A("tool_description_hygiene", "COMPLETED", "UNVERIFIED", listIncomplete);
        A("toolset_unchanged_vs_approved", "SKIPPED", "UNVERIFIED", listIncomplete);
        A("schema_unchanged_vs_approved", "SKIPPED", "UNVERIFIED", listIncomplete);
      } else {
        toolSnapshot = await buildToolSnapshot(tools, now());
        const toolsetFp = await computeToolsetFingerprint(tools);
        A("toolset_fingerprint", "COMPLETED", toolsetFp.status, toolsetFp.status === "FAILED" ? toolsetFp.reason : null);
        const schemaFp = await computeSchemaFingerprint(tools);
        A("schema_fingerprint", "COMPLETED", schemaFp.status, schemaFp.status === "FAILED" ? schemaFp.reason : null);
        const hygiene = runHygieneCheck(tools);
        A("tool_description_hygiene", "COMPLETED", hygiene.assertion_status, hygiene.assertion_status === "OBSERVED_RISK" ? hygiene.reason : null);
        judgeBaselineCheck("toolset_unchanged_vs_approved", toolsetFp, approvedBaseline?.toolset_fingerprint, now, registry, A, driftEvents);
        judgeBaselineCheck("schema_unchanged_vs_approved", schemaFp, approvedBaseline?.schema_fingerprint, now, registry, A, driftEvents);
      }
    } else {
      A("tools_list", "COMPLETED", "FAILED", classified(toolsList.failure, "tools_list"));
      skipToolsDerivedChecks({ key: "tools_list_invalid_structure" });
      probeCallWithheld = { key: "probe_tool_name_unverifiable" };
    }
    if (probeCallWithheld) {
      A("error_taxonomy", "SKIPPED", "UNVERIFIED", probeCallWithheld);
      if (gateChallenge2) {
        const metadata = keepLastOkBody(fetchImpl);
        const authVerdict = await judgeAuthMetadataFromGate({ fetchImpl: metadata.fetchImpl, budget, ctx, challenge: gateChallenge2 });
        A("auth_metadata", "COMPLETED", authVerdict.status, authVerdict.status !== "VERIFIED" ? authVerdict.reason : null);
        authObservation = await authObservationOf(gateChallenge2, metadata.lastOkBody()) ?? void 0;
      } else {
        A("auth_metadata", "SKIPPED", "UNVERIFIED", probeCallWithheld);
      }
    } else {
      const callResult = await performUnknownToolCall({
        fetchImpl,
        budget,
        ctx,
        newId,
        handshake: { ...handshake, currentEndpoint: toolsList.currentEndpoint },
        toolName: PROBE_TOOL_NAME
      });
      const taxonomy = judgeErrorTaxonomy(callResult);
      A("error_taxonomy", executionOf(taxonomy), taxonomy.status, taxonomy.status !== "VERIFIED" ? taxonomy.reason : null);
      const authVerdict = await judgeAuthMetadata({ fetchImpl, budget, ctx, callResult });
      A("auth_metadata", executionOf(authVerdict), authVerdict.status, authVerdict.status !== "VERIFIED" ? authVerdict.reason : null);
    }
    if (ctx.redirectCrossHostObserved) {
      A("redirect_policy", "COMPLETED", "OBSERVED_RISK", { key: "redirect_cross_host_observed" });
    } else {
      A("redirect_policy", "COMPLETED", "VERIFIED");
    }
  } catch (e) {
    let reachabilityReason;
    let cascadeReason;
    const guardReason = guardErrorReason(e, budget, assertionsByCheckId.has("reachability"));
    if (e instanceof ProbeAborted) {
      const key = {
        MAX_REQUESTS: "probe_budget_exhausted_requests",
        MAX_DURATION: "probe_budget_exhausted_duration",
        MAX_REDIRECTS: "probe_budget_exhausted_redirects",
        MAX_BODY_BYTES: "probe_budget_exhausted_body",
        RATE_LIMITED: "probe_rate_limited"
      }[e.code];
      reachabilityReason = { key, params: e.details };
      cascadeReason = reachabilityReason;
      if (e.code === "RATE_LIMITED") {
        rateLimited = { retryAfterSeconds: e.retryAfterSeconds ?? null };
      }
    } else if (e instanceof OtherHostDeclined) {
      reachabilityReason = { key: "probe_declined_other_host" };
      cascadeReason = reachabilityReason;
    } else if (guardReason !== void 0) {
      reachabilityReason = guardReason;
      cascadeReason = reachabilityReason;
    } else {
      reachabilityReason = { key: "probe_aborted", params: { error_class: errorClassOf(e) } };
      cascadeReason = { key: "probe_cascade_incomplete" };
    }
    if (ctx?.redirectCrossHostObserved && !assertionsByCheckId.has("redirect_policy")) {
      A("redirect_policy", "COMPLETED", "OBSERVED_RISK", { key: "redirect_cross_host_observed" });
    }
    if (!assertionsByCheckId.has("reachability")) {
      A("reachability", "ERROR", "UNVERIFIED", reachabilityReason);
    }
    cascadeRemaining("SKIPPED", cascadeReason);
  }
  return finalize();
  function finalize() {
    const latency = judgeLatency(ctx?.latency, handshakeGated);
    A("latency_profile", latency.execution_status, latency.assertion_status, latency.reason);
    for (const def of registry.checks) {
      if (!assertionsByCheckId.has(def.check_id)) {
        A(def.check_id, "ERROR", "UNVERIFIED", { key: "check_not_implemented", params: { check_id: def.check_id } });
      }
    }
    if (ctx?.dnsAnswerChangedObserved) {
      disqualifiedFromPublication = { key: "disqualified_dns_rebind" };
    }
    const assertions = registry.checks.map((def) => assertionsByCheckId.get(def.check_id));
    return {
      assertions,
      driftEvents,
      // null for stdio (ctx is never created — no DNS resolution happens for a
      // local process launch); a real boolean for remote, regardless of
      // whether this run later aborted.
      dnsAnswerChangedObserved: ctx?.dnsAnswerChangedObserved ?? null,
      protocolRevisionDeclared,
      probeOfferedRevision,
      ...toolSnapshot ? { toolSnapshot } : {},
      ...disqualifiedFromPublication ? { disqualifiedFromPublication } : {},
      ...rateLimited ? { rateLimited } : {},
      ...authObservation ? { authObservation } : {}
    };
  }
}

// src/adapter.ts
var RELEASE_CHECK_USER_AGENT = "mcpcheckup-release-check/0.1.0";
var REQUEST_TIMEOUT_GRACE_MS = 500;
var CREDENTIAL_HEADERS2 = ["authorization", "proxy-authorization", "cookie"];
var NULL_BODY_STATUSES = /* @__PURE__ */ new Set([204, 205, 304]);
var DEFAULT_TIMEOUT_MS = 1e4;
async function readCapped(res, maxBytes) {
  if (res.body === null) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return new Uint8Array(Buffer.concat(chunks));
}
function createNodeFetchLike(endpointUrl, maxBodyBytes, deps = {}) {
  const send = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? (() => performance.now());
  const endpointHost = new URL(endpointUrl).host;
  return async (input, init, onGuardSignal, options) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.host !== endpointHost) throw new OtherHostDeclined();
    if (url.protocol !== "http:" && url.protocol !== "https:" || url.username !== "" || url.password !== "") {
      throw new TypeError("release-check adapter: only http(s) URLs without credentials are requested");
    }
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") throw new TypeError(`release-check adapter: method ${method} is never sent`);
    const body = init?.body;
    if (body !== void 0 && body !== null && typeof body !== "string") throw new TypeError("release-check adapter: only string bodies are sent");
    const headers = new Headers(init?.headers);
    for (const name of CREDENTIAL_HEADERS2) headers.delete(name);
    headers.set("user-agent", RELEASE_CHECK_USER_AGENT);
    const signals = [AbortSignal.timeout((options?.timeoutMs ?? DEFAULT_TIMEOUT_MS) + REQUEST_TIMEOUT_GRACE_MS)];
    if (options?.signal !== void 0) signals.push(options.signal);
    const sentAt = now();
    const res = await send(url.href, { method, headers, ...typeof body === "string" ? { body } : {}, redirect: "manual", signal: AbortSignal.any(signals) });
    onGuardSignal({ responseHeadersMs: Math.max(0, Math.round(now() - sentAt)) });
    const bytes = await readCapped(res, maxBodyBytes);
    return new Response(NULL_BODY_STATUSES.has(res.status) ? null : bytes, { status: res.status, headers: res.headers });
  };
}

// src/observe.ts
var OBSERVATION_FORMAT = "mcpcheckup-release-check-observation/v1";
var InputError = class extends Error {
};
var STDIO_CHECK_IDS = /* @__PURE__ */ new Set(["discovery_handshake", "protocol_revision", "tools_list", "toolset_fingerprint", "schema_fingerprint", "tool_description_hygiene", "toolset_unchanged_vs_approved", "schema_unchanged_vs_approved", "error_taxonomy"]);
var MAX_URL_LENGTH2 = 2048;
function parseEndpoint(raw) {
  if (typeof raw !== "string" || raw.trim() === "") throw new InputError('input "url" is required');
  if (raw.length > MAX_URL_LENGTH2) throw new InputError(`input "url" is longer than ${MAX_URL_LENGTH2} characters`);
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InputError('input "url" is not a valid URL');
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new InputError('input "url" must start with http:// or https://');
  if (url.username !== "" || url.password !== "") throw new InputError('input "url" must not carry a user name or password: this Action sends no credentials');
  return url;
}
var publicEndpoint = (url) => `${url.origin}${url.pathname}`;
function isCalendarDate(s) {
  if (s === null || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = /* @__PURE__ */ new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function toObservation(result, endpoint, observedAt, stdio) {
  const gated = result.assertions.some((a) => a.check_id === "discovery_handshake" && a.assertion_status === "UNVERIFIED" && a.reason?.key === "credential_required");
  const covered = new Set(AUTH_GATED_CHECK_IDS);
  const snapshot = gated ? void 0 : result.toolSnapshot;
  const declared = result.protocolRevisionDeclared;
  return {
    format: OBSERVATION_FORMAT,
    provenance: "SELF_ATTESTED",
    signed: false,
    mode: stdio === void 0 ? "remote" : "stdio",
    observed_at: observedAt,
    endpoint: endpoint === null ? null : publicEndpoint(endpoint),
    scope: gated ? "auth_gated" : "full",
    protocol_revision: isCalendarDate(declared) ? declared : null,
    offered_revision: result.probeOfferedRevision ?? null,
    suite_id: CHECKS_REGISTRY.suite_id,
    registry_version: CHECKS_REGISTRY.registry_version,
    toolset_projection_version: TOOLSET_PROJECTION_VERSION,
    toolset_fingerprint: snapshot?.toolset_fingerprint ?? null,
    schema_fingerprint: snapshot?.schema_fingerprint ?? null,
    tool_count: snapshot?.tools.length ?? null,
    tools: (snapshot?.tools ?? []).map((t) => ({ name: t.name, fingerprint: t.hash })),
    launch_config_digest: stdio?.digest ?? null,
    process: stdio?.process ?? null,
    assertions: result.assertions.filter((a) => stdio === void 0 ? !gated || covered.has(a.check_id) : STDIO_CHECK_IDS.has(a.check_id)).map((a) => ({
      check_id: a.check_id,
      execution_status: a.execution_status,
      assertion_status: a.assertion_status,
      reason: a.reason ?? a.unverified_reason ?? null
    })),
    auth_observation: gated ? result.authObservation ?? null : null
  };
}
function runChecks(endpointUrl, fetchImpl, now, maxDurationMs = CHECKS_REGISTRY.budget.max_duration_ms) {
  const b = CHECKS_REGISTRY.budget;
  return runProbe({
    target: { slug: "release-check", transport: "remote", endpointUrl },
    fetchImpl,
    budget: { maxRedirects: b.max_redirects, maxDurationMs, maxBodyBytes: b.max_body_bytes, maxRequests: b.max_requests },
    now,
    newId: () => crypto.randomUUID(),
    provenance: "SELF_ATTESTED",
    registry: CHECKS_REGISTRY
  });
}
async function observeRemote(rawUrl, deps = {}) {
  const endpoint = parseEndpoint(rawUrl);
  const now = deps.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const result = await runChecks(endpoint.href, deps.fetchImpl ?? createNodeFetchLike(endpoint.href, CHECKS_REGISTRY.budget.max_body_bytes), now);
  return toObservation(result, endpoint, now());
}

// src/stdio.ts
var import_node_child_process = require("node:child_process");
var import_node_crypto = require("node:crypto");
var STDIO_LIMITS = { startMs: 3e4, handshakeMs: 15e3, requestMs: 1e4, totalMs: 9e4, maxLineBytes: CHECKS_REGISTRY.budget.max_body_bytes };
var BASE_ENV_NAMES = ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SystemRoot", "LANG"];
var HANDSHAKE_METHODS = /* @__PURE__ */ new Set(["server/discover", "initialize", "notifications/initialized"]);
var ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
var MAX_ARGUMENTS = 64;
var MAX_ARGUMENT_LENGTH = 4096;
var MAX_ENV_NAMES = 32;
var EXIT_GRACE_MS = 250;
var TASKKILL_TIMEOUT_MS = 5e3;
var StdioFailure = class extends Error {
};
var sha256 = (text) => (0, import_node_crypto.createHash)("sha256").update(text).digest("hex");
function parseCommand(raw) {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch {
    value = null;
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ARGUMENTS || value[0] === "" || value.some((a) => typeof a !== "string" || a.length > MAX_ARGUMENT_LENGTH || a.includes("\0"))) {
    throw new InputError('input "command" must be a JSON array of strings, the program first and then its arguments, for example ["node", "server.js"]. It is started without a shell');
  }
  return value;
}
function parseEnvNames(raw) {
  const names = [...new Set(String(raw ?? "").split(/[\s,]+/).filter((name) => name !== ""))].sort();
  if (names.length > MAX_ENV_NAMES || names.some((name) => !ENV_NAME.test(name))) {
    throw new InputError(`input "env-names" must list at most ${MAX_ENV_NAMES} environment variable names, separated by commas or line breaks`);
  }
  return names;
}
function launchEnv(names, runner) {
  const env = {};
  for (const name of BASE_ENV_NAMES) {
    const value = runner[name];
    if (value !== void 0) env[name] = value;
  }
  for (const name of names) {
    const value = runner[name];
    if (value === void 0) throw new InputError(`input "env-names" lists ${name}, which is not set in this job's environment`);
    env[name] = value;
  }
  return env;
}
var launchConfigDigest = (command, names, env) => digest({ launch_config_version: 1, command: command.map(sha256), env: names.map((name) => ({ name, sha256: sha256(env[name] ?? "") })) });
function killTree(child) {
  if (child.pid === void 0) return;
  if (process.platform === "win32") {
    (0, import_node_child_process.spawnSync)("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: TASKKILL_TIMEOUT_MS });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}
function openStdio(command, env, limits = STDIO_LIMITS) {
  const pending = /* @__PURE__ */ new Map();
  const seen = { outcome: "ok", exit_code: null, signal: null, error_code: null, limit_ms: null };
  let answered = false;
  let finished = false;
  let buffer = "";
  const child = (0, import_node_child_process.spawn)(command[0], command.slice(1), { shell: false, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
  const stop = (outcome, limit = null) => {
    if (seen.outcome === "ok" && !finished) {
      seen.outcome = outcome;
      seen.limit_ms = limit;
    }
    for (const waiting of pending.values()) waiting.reject(new StdioFailure(outcome));
    pending.clear();
    killTree(child);
  };
  child.on("error", (e) => {
    seen.error_code = typeof e.code === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(e.code) ? e.code : null;
    stop("not_started");
  });
  const ended = (code2, signal) => {
    if (seen.outcome === "ok" && !finished) {
      seen.exit_code = code2;
      seen.signal = signal;
      stop("exited_early");
    }
  };
  let exitTimer;
  child.on("exit", (code2, signal) => {
    exitTimer = setTimeout(() => ended(code2, signal), EXIT_GRACE_MS);
  });
  child.on("close", (code2, signal) => {
    clearTimeout(exitTimer);
    ended(code2, signal);
  });
  child.stdin?.on("error", () => {
  });
  child.stderr?.on("data", () => {
  });
  child.stdout?.setEncoding("utf8");
  const deliver = (line) => {
    if (Buffer.byteLength(line) > limits.maxLineBytes) return stop("output_too_large", limits.maxLineBytes);
    let key;
    try {
      key = JSON.stringify(JSON.parse(line).id);
    } catch {
      return;
    }
    const waiting = pending.get(key);
    if (waiting === void 0) return;
    pending.delete(key);
    answered = true;
    waiting.resolve(line);
  };
  child.stdout?.on("data", (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf("\n"); end !== -1; end = buffer.indexOf("\n")) {
      deliver(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
    }
    if (Buffer.byteLength(buffer) > limits.maxLineBytes) stop("output_too_large", limits.maxLineBytes);
  });
  const fetchLike = async (_input, init, _onGuardSignal, options) => {
    const body = init?.body;
    if (typeof body !== "string" || (init?.method ?? "GET").toUpperCase() !== "POST") return new Response(null, { status: 405 });
    if (seen.outcome !== "ok" || finished) throw new StdioFailure(seen.outcome);
    const message = JSON.parse(body);
    if (message.id === void 0) {
      child.stdin?.write(`${body}
`);
      return new Response(null, { status: 202 });
    }
    const [outcome, stageMs] = !answered ? ["start_timeout", limits.startMs] : HANDSHAKE_METHODS.has(String(message.method)) ? ["handshake_timeout", limits.handshakeMs] : ["request_timeout", limits.requestMs];
    const leftMs = options?.timeoutMs ?? limits.totalMs;
    const line = await new Promise((resolve2, reject) => {
      const timer = setTimeout(() => stop(leftMs < stageMs ? "total_timeout" : outcome, Math.min(leftMs, stageMs)), Math.min(leftMs, stageMs));
      const abandoned = () => stop("total_timeout", leftMs);
      const settle = () => {
        clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abandoned);
      };
      options?.signal?.addEventListener("abort", abandoned, { once: true });
      pending.set(JSON.stringify(message.id), { resolve: (l) => (settle(), resolve2(l)), reject: (e) => (settle(), reject(e)) });
      child.stdin?.write(`${body}
`);
    });
    return new Response(line, { status: 200, headers: { "content-type": "application/json" } });
  };
  return {
    fetchLike,
    finish: () => {
      finished = true;
      clearTimeout(exitTimer);
      killTree(child);
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      return { ...seen };
    }
  };
}

// src/observe-stdio.ts
var NO_ENDPOINT = "http://stdio.invalid/mcp";
async function observeStdio(rawCommand, rawEnvNames, runnerEnv, deps = {}) {
  const command = parseCommand(rawCommand);
  const names = parseEnvNames(rawEnvNames);
  const env = launchEnv(names, runnerEnv);
  const limits = deps.limits ?? STDIO_LIMITS;
  const now = deps.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const launchDigest = await launchConfigDigest(command, names, env);
  const session = openStdio(command, env, limits);
  try {
    const result = await runChecks(NO_ENDPOINT, session.fetchLike, now, limits.totalMs);
    return toObservation(result, null, now(), { digest: launchDigest, process: session.finish() });
  } finally {
    session.finish();
  }
}

// src/github.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// ../checks/src/reason-messages.ts
function requireParam(params, key) {
  if (!params || !(key in params)) throw new Error(`reason-messages: missing required param "${key}"`);
  return params[key];
}
function optionalParam(params, key) {
  if (!params || !(key in params)) return void 0;
  return params[key];
}
function unansweredKind(params) {
  const kind = requireParam(params, "kind");
  if (kind !== "timeout" && kind !== "other") throw new Error(`reason-messages: unknown reachability_unanswered kind "${String(kind)}"`);
  return kind;
}
var REASON_MESSAGES = {
  tls_certificate_out_of_scope: {
    en: () => "This check requires a TLS-terminating container executor to validate the certificate chain \u2014 out of scope for this fetch-based prober.",
    zh: () => "\u6B64\u68C0\u67E5\u7531 container executor \u6821\u9A8C\u8BC1\u4E66\u94FE\uFF0C\u4E0D\u5728\u672C\u63A2\u6D4B\u5668\uFF08fetch-based prober\uFF09\u7684\u6267\u884C\u8303\u56F4\u5185"
  },
  stdio_out_of_scope: {
    en: () => "stdio transport is out of scope for this prober (remote-only \u2014 see README).",
    zh: () => "stdio \u4F20\u8F93\u4E0D\u5728\u672C\u63A2\u6D4B\u5668\u5F53\u524D\u8303\u56F4\u5185\uFF08remote-only\uFF0C\u89C1 README\uFF09"
  },
  fingerprint_comparison_unavailable: {
    en: () => "The current fingerprint could not be computed \u2014 there is nothing to compare against a baseline.",
    zh: () => "\u5BF9\u5E94\u7684\u6307\u7EB9\u672A\u80FD\u7B97\u51FA\uFF0C\u6CA1\u6709\u53EF\u6BD4\u5BF9\u7684\u5F53\u524D\u503C"
  },
  no_baseline_reason_generic: {
    en: () => "No approved baseline exists.",
    zh: () => "\u4E0D\u5B58\u5728\u5DF2\u6279\u51C6\u57FA\u7EBF"
  },
  fingerprint_baseline_mismatch: {
    en: () => "The current fingerprint does not match the approved baseline.",
    zh: () => "\u5F53\u524D\u6307\u7EB9\u4E0E\u5DF2\u6279\u51C6\u57FA\u7EBF\u4E0D\u4E00\u81F4"
  },
  tools_list_invalid_structure: {
    en: () => "tools/list returned a structurally invalid response \u2014 there is no usable tool data to compute this from.",
    zh: () => "tools/list \u8FD4\u56DE\u7684\u7ED3\u6784\u4E0D\u5408\u6CD5\uFF0C\u6CA1\u6709\u53EF\u7528\u7684\u5DE5\u5177\u6570\u636E\u53EF\u4F9B\u8BA1\u7B97"
  },
  redirect_cross_host_observed: {
    en: () => "A cross-host redirect was observed during this probe.",
    zh: () => "\u63A2\u6D4B\u8FC7\u7A0B\u4E2D\u89C2\u5BDF\u5230\u8DE8\u4E3B\u673A\u91CD\u5B9A\u5411"
  },
  // Two shapes. Suite 0.15.0 writes { error_class } (the thrown error's class,
  // e.g. TypeError, never its message). Rows written up to suite 0.14.0 carry
  // { message } and keep rendering exactly as they always did. Both params are
  // read before either is used, so a consumer that derives the read set from
  // these renderers sees both names.
  probe_aborted: {
    en: (p) => {
      const errorClass = optionalParam(p, "error_class");
      const message = optionalParam(p, "message");
      return errorClass !== void 0 ? `This run stopped on an error in our probe (${errorClass}) before it finished \u2014 later checks did not run.` : `This run was aborted before completing (budget exceeded or an error occurred) \u2014 later checks did not run: ${message ?? requireParam(p, "message")}`;
    },
    zh: (p) => {
      const errorClass = optionalParam(p, "error_class");
      const message = optionalParam(p, "message");
      return errorClass !== void 0 ? `\u672C\u6B21 run \u5728\u5B8C\u6210\u524D\u56E0\u6211\u4EEC\u63A2\u6D4B\u5668\u5185\u90E8\u7684\u9519\u8BEF\uFF08${errorClass}\uFF09\u800C\u505C\u6B62\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u6267\u884C\u3002` : `\u672C\u6B21 run \u56E0\u9884\u7B97\u8017\u5C3D\u6216\u63A2\u6D4B\u4E2D\u6B62\u800C\u672A\u80FD\u5B8C\u6574\u5B8C\u6210\uFF0C\u540E\u7EED\u68C0\u67E5\u672A\u6267\u884C\uFF1A${message ?? requireParam(p, "message")}`;
    }
  },
  probe_cascade_incomplete: {
    en: () => "This run was aborted before completing (budget exceeded or an error occurred) \u2014 this check did not run.",
    zh: () => "\u672C\u6B21 run \u56E0\u9884\u7B97\u8017\u5C3D\u6216\u63A2\u6D4B\u4E2D\u6B62\u800C\u672A\u80FD\u5B8C\u6574\u5B8C\u6210\uFF0C\u540E\u7EED\u68C0\u67E5\u672A\u6267\u884C"
  },
  probe_budget_exhausted_requests: {
    en: (p) => `This run was aborted after reaching its budget of ${requireParam(p, "maxRequests")} requests \u2014 later checks did not run.`,
    zh: (p) => `\u672C\u6B21 run \u56E0\u8FBE\u5230 ${requireParam(p, "maxRequests")} \u6B21\u8BF7\u6C42\u7684\u9884\u7B97\u800C\u4E2D\u6B62\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u6267\u884C`
  },
  probe_budget_exhausted_duration: {
    en: (p) => `This run was aborted after exceeding its ${requireParam(p, "maxDurationMs")}ms time budget \u2014 later checks did not run.`,
    zh: (p) => `\u672C\u6B21 run \u56E0\u8D85\u8FC7 ${requireParam(p, "maxDurationMs")}ms \u7684\u65F6\u95F4\u9884\u7B97\u800C\u4E2D\u6B62\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u6267\u884C`
  },
  probe_budget_exhausted_redirects: {
    en: (p) => `This run was aborted after exceeding its budget of ${requireParam(p, "maxRedirects")} redirects \u2014 later checks did not run.`,
    zh: (p) => `\u672C\u6B21 run \u56E0\u91CD\u5B9A\u5411\u8DF3\u6570\u8D85\u8FC7 ${requireParam(p, "maxRedirects")} \u7684\u9884\u7B97\u800C\u4E2D\u6B62\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u6267\u884C`
  },
  probe_budget_exhausted_body: {
    en: (p) => `This run was aborted after a response body exceeded its ${requireParam(p, "maxBodyBytes")}-byte budget \u2014 later checks did not run.`,
    zh: (p) => `\u672C\u6B21 run \u56E0\u54CD\u5E94\u4F53\u8D85\u8FC7 ${requireParam(p, "maxBodyBytes")} \u5B57\u8282\u7684\u9884\u7B97\u800C\u4E2D\u6B62\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u6267\u884C`
  },
  // Deliberately renders no params, even though this reason's params do carry
  // the observed status (and the parsed Retry-After, when there was one): the
  // approved sentence names both triggers in prose, and the numbers are
  // evidence for the signed record rather than something the reader is asked
  // to interpret. Keeping the renderer param-free also keeps this key in the
  // "renders without params" group every consumer already handles.
  probe_rate_limited: {
    en: () => "The server told us to come back later (HTTP 429, or 503 with Retry-After), so we stopped this round before finishing the checks.",
    zh: () => "\u5BF9\u65B9\u8981\u6C42\u6211\u4EEC\u7A0D\u540E\u518D\u6765\uFF08HTTP 429\uFF0C\u6216\u5E26 Retry-After \u7684 503\uFF09\uFF0C\u6211\u4EEC\u5728\u5B8C\u6210\u68C0\u67E5\u524D\u505C\u6B62\u4E86\u672C\u8F6E\u3002"
  },
  // T85 (suite 0.9.0): probe.ts's reasons for an ssrf-guard error, classified
  // by class and code (never message). Params are only `kind` / `code`.
  reachability_unanswered: {
    en: (p) => unansweredKind(p) === "timeout" ? "No complete response arrived from the endpoint within the probe's time budget \u2014 later checks did not run." : "The request failed before a complete response arrived \u2014 later checks did not run.",
    zh: (p) => unansweredKind(p) === "timeout" ? "\u63A2\u6D4B\u65F6\u95F4\u9884\u7B97\u5185\u6CA1\u6709\u6536\u5230 endpoint \u7684\u5B8C\u6574\u54CD\u5E94\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u8FD0\u884C\u3002" : "\u8BF7\u6C42\u5728\u6536\u5230\u5B8C\u6574\u54CD\u5E94\u524D\u5931\u8D25\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u8FD0\u884C\u3002"
  },
  reachability_dns_failed: {
    en: () => "The endpoint's host name did not resolve \u2014 later checks did not run.",
    zh: () => "endpoint \u7684\u57DF\u540D\u65E0\u6CD5\u89E3\u6790\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u8FD0\u884C\u3002"
  },
  probe_blocked_by_policy: {
    en: (p) => `Our probe declined to connect to this address under its own policy (${requireParam(p, "code")}) \u2014 later checks did not run.`,
    zh: (p) => `\u6211\u4EEC\u7684\u63A2\u6D4B\u5668\u6309\u81EA\u8EAB\u7B56\u7565\u62D2\u7EDD\u8FDE\u63A5\u8BE5\u5730\u5740\uFF08${requireParam(p, "code")}\uFF09\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u8FD0\u884C\u3002`
  },
  probe_resolver_unavailable: {
    en: () => "Our own DNS resolver did not answer \u2014 later checks did not run.",
    zh: () => "\u6211\u4EEC\u81EA\u5DF1\u7684 DNS \u89E3\u6790\u5668\u6CA1\u6709\u5E94\u7B54\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u8FD0\u884C\u3002"
  },
  // Suite 0.11.0: a host other than the endpoint's (a redirect hop, a
  // resource_metadata URL) that the run declined to contact. Deliberately names
  // neither the host nor why it was declined, and renders no params.
  probe_declined_other_host: {
    en: () => "Our probe did not connect to another host the server pointed to \u2014 later checks did not run.",
    zh: () => "\u6211\u4EEC\u7684\u63A2\u6D4B\u5668\u6CA1\u6709\u8FDE\u63A5\u8BE5\u670D\u52A1\u5668\u6307\u5411\u7684\u53E6\u4E00\u4E2A\u4E3B\u673A\u2014\u2014\u540E\u7EED\u68C0\u67E5\u672A\u8FD0\u884C\u3002"
  },
  // Suite 0.12.0: three checks that used to be VERIFIED without observing what
  // their predicate names. Each renders no params.
  latency_not_recorded: {
    en: () => "Not measured: this run recorded no request latency.",
    zh: () => "\u672A\u6D4B\u91CF\uFF1A\u672C\u8F6E\u6CA1\u6709\u8BB0\u5F55\u8BF7\u6C42\u5EF6\u8FDF\u3002"
  },
  // Suite 0.16.0 (latency.ts). latency_measured is the one VERIFIED row whose
  // reason renders numbers: n always with p50 and p95. Its params also carry
  // timed_to ('response_headers'), signed evidence that no sentence reads.
  latency_measured: {
    en: (p) => `Measured from our probe node: p50 ${requireParam(p, "p50_ms")} ms, p95 ${requireParam(p, "p95_ms")} ms (n = ${requireParam(p, "n")}).`,
    zh: (p) => `\u4ECE\u6211\u4EEC\u63A2\u6D4B\u8282\u70B9\u6D4B\u5F97\uFF1Ap50 ${requireParam(p, "p50_ms")} ms\uFF0Cp95 ${requireParam(p, "p95_ms")} ms\uFF08n = ${requireParam(p, "n")}\uFF09\u3002`
  },
  latency_no_samples: {
    en: () => "Not measured: no request in this run got an HTTP response.",
    zh: () => "\u672A\u6D4B\u91CF\uFF1A\u672C\u8F6E\u6CA1\u6709\u4EFB\u4F55\u8BF7\u6C42\u6536\u5230 HTTP \u56DE\u5E94\u3002"
  },
  latency_not_signed_auth_gated: {
    en: () => "Not recorded: this run stopped at an authentication challenge during the handshake, and the signature of such a run does not cover response time.",
    zh: () => "\u672A\u8BB0\u5F55\uFF1A\u672C\u8F6E\u5728\u63E1\u624B\u9636\u6BB5\u505C\u5728\u8BA4\u8BC1\u8D28\u8BE2\u5904\uFF0C\u8FD9\u7C7B\u8FD0\u884C\u7684\u7B7E\u540D\u4E0D\u6DB5\u76D6\u54CD\u5E94\u65F6\u95F4\u3002"
  },
  auth_no_challenge_observed: {
    en: () => "Not observed: the endpoint did not ask for credentials, so there was no auth challenge or metadata to check.",
    zh: () => "\u672A\u89C2\u5BDF\u5230\uFF1A\u8BE5\u7AEF\u70B9\u6CA1\u6709\u8981\u6C42\u51ED\u636E\uFF0C\u56E0\u6B64\u6CA1\u6709\u53EF\u68C0\u67E5\u7684\u8BA4\u8BC1\u8D28\u8BE2\u6216\u5143\u6570\u636E\u3002"
  },
  error_shape_not_observed: {
    en: () => "Not observed: the request was rejected at the HTTP layer (401/403) before any protocol error was returned.",
    zh: () => "\u672A\u89C2\u5BDF\u5230\uFF1A\u8BF7\u6C42\u5728 HTTP \u5C42\u5C31\u88AB\u62D2\u7EDD\uFF08401/403\uFF09\uFF0C\u6CA1\u6709\u8FD4\u56DE\u4EFB\u4F55\u534F\u8BAE\u5C42\u9519\u8BEF\u3002"
  },
  check_not_implemented: {
    en: (p) => `This prober has not implemented check_id=${requireParam(p, "check_id")} \u2014 this is an implementation gap, not a probe result.`,
    zh: (p) => `\u672C\u63A2\u6D4B\u5668\u672A\u5B9E\u73B0 check_id=${requireParam(p, "check_id")}\uFF0C\u8FD9\u662F\u5B9E\u73B0\u7F3A\u53E3\uFF0C\u4E0D\u662F\u63A2\u6D4B\u7ED3\u679C`
  },
  disqualified_dns_rebind: {
    en: () => "This run observed the target hostname's DNS resolution change mid-probe (possible DNS rebinding) \u2014 the result cannot enter the publication flow and is recorded as risk evidence only.",
    zh: () => "\u63A2\u6D4B\u8FC7\u7A0B\u4E2D\u89C2\u5BDF\u5230\u76EE\u6807\u4E3B\u673A\u540D\u7684 DNS \u89E3\u6790\u7ED3\u679C\u53D1\u751F\u53D8\u5316\uFF08\u53EF\u80FD\u7684 DNS rebinding\uFF09\uFF0C\u672C\u6B21\u7ED3\u679C\u4E0D\u5F97\u8FDB\u5165\u53D1\u5E03\u6D41\u7A0B\uFF0C\u4EC5\u4F5C\u4E3A\u98CE\u9669\u8BC1\u636E\u8BB0\u5F55"
  },
  hygiene_risk_detected: {
    // totalCount is optional, not required-via-requireParam, for one specific
    // reason: legacy pre-migration rows (backfilled by
    // scripts/backfill-reason-keys.mjs) only ever encoded hitCount in their
    // flat-text reason — the old Chinese sentence never included the tool
    // total, and assertions.details (the only other place a total could in
    // principle have been recovered from) is confirmed dead/always [] (see
    // that script's report). So totalCount truly cannot be recovered for
    // those rows, and requiring it unconditionally would make every
    // backfilled hygiene_risk_detected row throw at render time. New rows
    // (post-migration) always pass both hitCount and totalCount (see
    // packages/checks/src/hygiene.ts) — this branch only ever actually omits
    // the "of M" clause for legacy-backfilled data.
    en: (p) => {
      const hitCount = requireParam(p, "hitCount");
      const totalCount = optionalParam(p, "totalCount");
      return totalCount === void 0 ? `Suspicious patterns were observed in ${hitCount} tools' names or descriptions; this does not mean the server is malicious.` : `Suspicious patterns were observed in ${hitCount} of ${totalCount} tools' names or descriptions; this does not mean the server is malicious.`;
    },
    zh: (p) => `${requireParam(p, "hitCount")} \u4E2A\u5DE5\u5177\u7684\u540D\u79F0\u6216\u63CF\u8FF0\u4E2D\u89C2\u5BDF\u5230\u53EF\u7591\u6A21\u5F0F\uFF1B\u8FD9\u4E0D\u610F\u5473\u7740\u8BE5 server \u6709\u6076\u610F`
  },
  hygiene_no_risk: {
    en: (p) => `No hidden characters or injection patterns were observed across ${requireParam(p, "totalCount")} tools' names and descriptions.`,
    zh: (p) => `${requireParam(p, "totalCount")} \u4E2A\u5DE5\u5177\u7684\u540D\u79F0\u4E0E\u63CF\u8FF0\u672A\u89C2\u5BDF\u5230\u9690\u85CF\u5B57\u7B26\u6216\u6CE8\u5165\u6A21\u5F0F`
  },
  // No longer emitted since T73 (the seven error_taxonomy_* keys below replaced
  // it); kept because historical rows and signed envelopes still carry it.
  error_taxonomy_risk: {
    en: () => "The triggered safety error scenario did not return a protocol-shaped JSON-RPC error.",
    zh: () => "\u89E6\u53D1\u7684\u5B89\u5168\u9519\u8BEF\u573A\u666F\u6CA1\u6709\u8FD4\u56DE\u534F\u8BAE\u5B9A\u4E49\u5F62\u72B6\u7684 JSON-RPC \u9519\u8BEF"
  },
  // T73: the bounded classification of the unknown-tool response
  // (packages/checks/src/error-taxonomy.ts classifyUnknownToolResponse). Every
  // one of these reasons carries scenario / status / media_type (and, for
  // jsonrpc_malformed only, sometimes jsonrpc_error_code) as signed evidence;
  // like probe_rate_limited above, the renderers deliberately read only what
  // the approved sentence names — `status` for five keys, nothing for the two
  // result_* keys. The other params are for the signed record, not the reader.
  error_taxonomy_result_is_error: {
    en: () => "We called tools/call with a tool name that does not exist. The server answered with an ordinary result marked isError instead of a JSON-RPC error object.",
    zh: () => "\u6211\u4EEC\u7528\u4E00\u4E2A\u4E0D\u5B58\u5728\u7684\u5DE5\u5177\u540D\u8C03\u7528\u4E86 tools/call\u3002\u670D\u52A1\u5668\u8FD4\u56DE\u7684\u662F\u5E26 isError \u6807\u8BB0\u7684\u666E\u901A result\uFF0C\u800C\u4E0D\u662F JSON-RPC error \u5BF9\u8C61\u3002"
  },
  error_taxonomy_result_ok: {
    en: () => "We called tools/call with a tool name that does not exist. The server answered with a successful result.",
    zh: () => "\u6211\u4EEC\u7528\u4E00\u4E2A\u4E0D\u5B58\u5728\u7684\u5DE5\u5177\u540D\u8C03\u7528\u4E86 tools/call\u3002\u670D\u52A1\u5668\u8FD4\u56DE\u4E86\u4E00\u4E2A\u6210\u529F\u7684 result\u3002"
  },
  error_taxonomy_jsonrpc_malformed: {
    en: (p) => `We called tools/call with a tool name that does not exist. The server answered HTTP ${requireParam(p, "status")} with a JSON-RPC message that has neither a result nor a well-formed error object.`,
    zh: (p) => `\u6211\u4EEC\u7528\u4E00\u4E2A\u4E0D\u5B58\u5728\u7684\u5DE5\u5177\u540D\u8C03\u7528\u4E86 tools/call\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u6D88\u606F\u81EA\u79F0 JSON-RPC\uFF0C\u4F46\u65E2\u6CA1\u6709 result\uFF0C\u4E5F\u6CA1\u6709\u683C\u5F0F\u6B63\u786E\u7684 error \u5BF9\u8C61\u3002`
  },
  error_taxonomy_not_jsonrpc: {
    en: (p) => `We called tools/call with a tool name that does not exist. The server answered HTTP ${requireParam(p, "status")} with JSON that is not a JSON-RPC message.`,
    zh: (p) => `\u6211\u4EEC\u7528\u4E00\u4E2A\u4E0D\u5B58\u5728\u7684\u5DE5\u5177\u540D\u8C03\u7528\u4E86 tools/call\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u5185\u5BB9\u662F JSON\uFF0C\u4F46\u4E0D\u662F JSON-RPC \u6D88\u606F\u3002`
  },
  error_taxonomy_not_json: {
    en: (p) => `We called tools/call with a tool name that does not exist. The server answered HTTP ${requireParam(p, "status")} with a body that is not JSON.`,
    zh: (p) => `\u6211\u4EEC\u7528\u4E00\u4E2A\u4E0D\u5B58\u5728\u7684\u5DE5\u5177\u540D\u8C03\u7528\u4E86 tools/call\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u54CD\u5E94\u4F53\u4E0D\u662F JSON\u3002`
  },
  error_taxonomy_empty_body: {
    en: (p) => `We called tools/call with a tool name that does not exist. The server answered HTTP ${requireParam(p, "status")} with an empty body.`,
    zh: (p) => `\u6211\u4EEC\u7528\u4E00\u4E2A\u4E0D\u5B58\u5728\u7684\u5DE5\u5177\u540D\u8C03\u7528\u4E86 tools/call\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u54CD\u5E94\u4F53\u4E3A\u7A7A\u3002`
  },
  // Phrased as "we found no data events", not "it carried none": protocol.ts's
  // extractSseDataPayloads splits lines only on \r?\n, so a stream framed with
  // lone CR (legal in WHATWG SSE) can carry data we do not see. Fixing the
  // extractor would change verdicts, so the sentence states only our finding;
  // and it says the Content-Type "names" an event stream because detection is
  // isSseContentType, a substring match (e.g. `application/json;
  // profile=text/event-stream` also qualifies); and it says "non-empty" data
  // events because extractSseDataPayloads drops zero-length payloads, while
  // WHATWG still dispatches an event whose data is empty (e.g. `data:\n\n`).
  error_taxonomy_event_stream_no_data: {
    en: (p) => `We called tools/call with a tool name that does not exist. The server answered HTTP ${requireParam(p, "status")} with a response whose Content-Type names an event stream, in which we found no non-empty data events.`,
    zh: (p) => `\u6211\u4EEC\u7528\u4E00\u4E2A\u4E0D\u5B58\u5728\u7684\u5DE5\u5177\u540D\u8C03\u7528\u4E86 tools/call\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u54CD\u5E94\u7684 Content-Type \u58F0\u660E\u4E3A\u4E8B\u4EF6\u6D41\uFF0C\u4F46\u6211\u4EEC\u5728\u5176\u4E2D\u6CA1\u6709\u627E\u5230\u4EFB\u4F55\u975E\u7A7A\u7684 data \u4E8B\u4EF6\u3002`
  },
  // T73b: why a FAILED discovery_handshake / protocol_revision / tools_list /
  // toolset_fingerprint / schema_fingerprint failed (protocol.ts's
  // FailureReason, probe.ts's protocol_revision split, fingerprint.ts's error
  // class). Some of these reasons also carry `status` and/or a safe-integer
  // `jsonrpc_error_code` as signed evidence; as with T73, the renderers read
  // only what the approved sentence names — `status` for seven keys, never
  // jsonrpc_error_code.
  handshake_discover_not_jsonrpc: {
    en: () => "We sent a server/discover request. The server answered HTTP 200 with a body we could not read as a JSON-RPC message.",
    zh: () => "\u6211\u4EEC\u53D1\u9001\u4E86 server/discover \u8BF7\u6C42\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP 200\uFF0C\u4F46\u54CD\u5E94\u4F53\u65E0\u6CD5\u6309 JSON-RPC \u6D88\u606F\u8BFB\u53D6\u3002"
  },
  handshake_discover_jsonrpc_error: {
    en: () => "We sent a server/discover request. The server answered HTTP 200 with a JSON-RPC error instead of a discovery result. At the time, our probe tried the older initialize handshake only after a 4xx answer, so it was not tried. From suite 0.10.0 on, the probe tries it in this situation unless the error is a protocol error defined by the current MCP specification.",
    zh: () => "\u6211\u4EEC\u53D1\u9001\u4E86 server/discover \u8BF7\u6C42\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP 200\uFF0C\u5185\u5BB9\u662F JSON-RPC error\uFF0C\u800C\u4E0D\u662F discover \u7ED3\u679C\u3002\u5F53\u65F6\u6211\u4EEC\u7684\u63A2\u6D4B\u5668\u53EA\u5728\u6536\u5230 4xx \u65F6\u624D\u6539\u7528\u65E7\u7248 initialize \u63E1\u624B\uFF0C\u6240\u4EE5\u6CA1\u6709\u6539\u7528\u3002\u4ECE\u5957\u4EF6 0.10.0 \u8D77\uFF0C\u8FD9\u79CD\u60C5\u51B5\u4E0B\u63A2\u6D4B\u5668\u4F1A\u6539\u7528\uFF0C\u9664\u975E\u8FD9\u4E2A\u9519\u8BEF\u662F\u5F53\u524D MCP \u89C4\u8303\u5B9A\u4E49\u7684\u534F\u8BAE\u9519\u8BEF\u3002"
  },
  handshake_discover_no_supported_versions: {
    en: () => "We sent a server/discover request. The server answered HTTP 200 with a JSON-RPC result, but its supportedVersions field is missing, is not an array, or does not start with a version string.",
    zh: () => "\u6211\u4EEC\u53D1\u9001\u4E86 server/discover \u8BF7\u6C42\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP 200 \u548C JSON-RPC result\uFF0C\u4F46\u5176\u4E2D\u7684 supportedVersions \u7F3A\u5931\u3001\u4E0D\u662F\u6570\u7EC4\uFF0C\u6216\u7B2C\u4E00\u9879\u4E0D\u662F\u7248\u672C\u5B57\u7B26\u4E32\u3002"
  },
  handshake_discover_rejected: {
    en: (p) => `We sent a server/discover request. The server answered HTTP ${requireParam(p, "status")} with a protocol error defined by the current MCP specification, rejecting this request, so we did not fall back to the older initialize handshake.`,
    zh: (p) => `\u6211\u4EEC\u53D1\u9001\u4E86 server/discover \u8BF7\u6C42\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u9644\u5E26\u5F53\u524D MCP \u89C4\u8303\u5B9A\u4E49\u7684\u534F\u8BAE\u9519\u8BEF\uFF0C\u62D2\u7EDD\u4E86\u8FD9\u6B21\u8BF7\u6C42\uFF1B\u56E0\u6B64\u6211\u4EEC\u6CA1\u6709\u6539\u7528\u65E7\u7248 initialize \u63E1\u624B\u3002`
  },
  handshake_discover_http_error: {
    en: (p) => `We sent a server/discover request. The server answered HTTP ${requireParam(p, "status")}. The probe version that ran this check did not treat that status as a discovery result or as a reason to try the older initialize handshake, so the handshake stopped there.`,
    zh: (p) => `\u6211\u4EEC\u53D1\u9001\u4E86 server/discover \u8BF7\u6C42\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\u3002\u8FD0\u884C\u8FD9\u6B21\u68C0\u67E5\u7684\u63A2\u6D4B\u5668\u7248\u672C\u65E2\u6CA1\u6709\u628A\u8FD9\u4E2A\u72B6\u6001\u5F53\u4F5C discover \u7ED3\u679C\uFF0C\u4E5F\u6CA1\u6709\u636E\u6B64\u6539\u7528\u65E7\u7248 initialize \u63E1\u624B\uFF0C\u6240\u4EE5\u63E1\u624B\u5230\u6B64\u4E3A\u6B62\u3002`
  },
  handshake_initialize_http_error: {
    en: (p) => `Our server/discover request got neither a discovery result we could use nor a protocol error defined by the current MCP specification, so we tried the older initialize handshake. The server answered initialize with HTTP ${requireParam(p, "status")} instead of 200.`,
    zh: (p) => `\u6211\u4EEC\u7684 server/discover \u8BF7\u6C42\u65E2\u6CA1\u6709\u5F97\u5230\u53EF\u7528\u7684 discover \u7ED3\u679C\uFF0C\u4E5F\u6CA1\u6709\u5F97\u5230\u5F53\u524D MCP \u89C4\u8303\u5B9A\u4E49\u7684\u534F\u8BAE\u9519\u8BEF\uFF0C\u56E0\u6B64\u6211\u4EEC\u6539\u7528\u65E7\u7248 initialize \u63E1\u624B\u3002\u670D\u52A1\u5668\u5BF9 initialize \u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u800C\u4E0D\u662F 200\u3002`
  },
  handshake_initialize_not_jsonrpc: {
    en: () => "Our server/discover request got neither a discovery result we could use nor a protocol error defined by the current MCP specification, so we tried the older initialize handshake. The server answered initialize with HTTP 200, but with a body we could not read as a JSON-RPC message.",
    zh: () => "\u6211\u4EEC\u7684 server/discover \u8BF7\u6C42\u65E2\u6CA1\u6709\u5F97\u5230\u53EF\u7528\u7684 discover \u7ED3\u679C\uFF0C\u4E5F\u6CA1\u6709\u5F97\u5230\u5F53\u524D MCP \u89C4\u8303\u5B9A\u4E49\u7684\u534F\u8BAE\u9519\u8BEF\uFF0C\u56E0\u6B64\u6211\u4EEC\u6539\u7528\u65E7\u7248 initialize \u63E1\u624B\u3002\u670D\u52A1\u5668\u5BF9 initialize \u8FD4\u56DE HTTP 200\uFF0C\u4F46\u54CD\u5E94\u4F53\u65E0\u6CD5\u6309 JSON-RPC \u6D88\u606F\u8BFB\u53D6\u3002"
  },
  handshake_initialize_jsonrpc_error: {
    en: () => "Our server/discover request got neither a discovery result we could use nor a protocol error defined by the current MCP specification, so we tried the older initialize handshake. The server answered initialize with HTTP 200 and a JSON-RPC error instead of an initialize result.",
    zh: () => "\u6211\u4EEC\u7684 server/discover \u8BF7\u6C42\u65E2\u6CA1\u6709\u5F97\u5230\u53EF\u7528\u7684 discover \u7ED3\u679C\uFF0C\u4E5F\u6CA1\u6709\u5F97\u5230\u5F53\u524D MCP \u89C4\u8303\u5B9A\u4E49\u7684\u534F\u8BAE\u9519\u8BEF\uFF0C\u56E0\u6B64\u6211\u4EEC\u6539\u7528\u65E7\u7248 initialize \u63E1\u624B\u3002\u670D\u52A1\u5668\u5BF9 initialize \u8FD4\u56DE HTTP 200\uFF0C\u5185\u5BB9\u662F JSON-RPC error\uFF0C\u800C\u4E0D\u662F initialize \u7ED3\u679C\u3002"
  },
  handshake_initialize_no_protocol_version: {
    en: () => "Our server/discover request got neither a discovery result we could use nor a protocol error defined by the current MCP specification, so we tried the older initialize handshake. The server answered initialize with HTTP 200 and a JSON-RPC result that has no protocolVersion string.",
    zh: () => "\u6211\u4EEC\u7684 server/discover \u8BF7\u6C42\u65E2\u6CA1\u6709\u5F97\u5230\u53EF\u7528\u7684 discover \u7ED3\u679C\uFF0C\u4E5F\u6CA1\u6709\u5F97\u5230\u5F53\u524D MCP \u89C4\u8303\u5B9A\u4E49\u7684\u534F\u8BAE\u9519\u8BEF\uFF0C\u56E0\u6B64\u6211\u4EEC\u6539\u7528\u65E7\u7248 initialize \u63E1\u624B\u3002\u670D\u52A1\u5668\u5BF9 initialize \u8FD4\u56DE HTTP 200 \u548C JSON-RPC result\uFF0C\u4F46\u5176\u4E2D\u6CA1\u6709\u5B57\u7B26\u4E32\u7C7B\u578B\u7684 protocolVersion\u3002"
  },
  handshake_ack_http_error: {
    en: (p) => `The server accepted our initialize request (older handshake), but answered the notifications/initialized message that completes the handshake with HTTP ${requireParam(p, "status")} instead of a 2xx.`,
    zh: (p) => `\u670D\u52A1\u5668\u63A5\u53D7\u4E86\u6211\u4EEC\u7684 initialize \u8BF7\u6C42\uFF08\u65E7\u7248\u63E1\u624B\uFF09\uFF0C\u4F46\u5BF9\u5B8C\u6210\u63E1\u624B\u6240\u9700\u7684 notifications/initialized \u901A\u77E5\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u800C\u4E0D\u662F 2xx\u3002`
  },
  protocol_revision_missing: {
    en: () => "The handshake did not yield a usable protocol version, so there is nothing to compare against the protocol revisions this check recognizes.",
    zh: () => "\u63E1\u624B\u6CA1\u6709\u5F97\u5230\u53EF\u7528\u7684\u534F\u8BAE\u7248\u672C\uFF0C\u56E0\u6B64\u6CA1\u6709\u53EF\u4E0E\u672C\u68C0\u67E5\u8BA4\u53EF\u7684\u534F\u8BAE\u4FEE\u8BA2\u7248\u672C\u6BD4\u5BF9\u7684\u503C\u3002"
  },
  protocol_revision_unknown: {
    en: () => "The server declared a protocol version that is not one of the protocol revisions this check recognizes. This can also mean the server speaks a newer revision than this check knows about.",
    zh: () => "\u670D\u52A1\u5668\u58F0\u660E\u7684\u534F\u8BAE\u7248\u672C\u4E0D\u5728\u672C\u68C0\u67E5\u8BA4\u53EF\u7684\u534F\u8BAE\u4FEE\u8BA2\u7248\u672C\u4E4B\u5217\u3002\u8FD9\u4E5F\u53EF\u80FD\u610F\u5473\u7740\u670D\u52A1\u5668\u4F7F\u7528\u7684\u662F\u6BD4\u672C\u68C0\u67E5\u6240\u77E5\u66F4\u65B0\u7684\u4FEE\u8BA2\u7248\u672C\u3002"
  },
  tools_list_challenge_after_failed_handshake: {
    en: () => "tools/list was answered with a 401 and an authentication challenge. Because the handshake itself had already failed, this is recorded as a failure rather than as a credential gate.",
    zh: () => "tools/list \u6536\u5230 401 \u548C\u8BA4\u8BC1 challenge\u3002\u7531\u4E8E\u63E1\u624B\u672C\u8EAB\u5DF2\u7ECF\u5931\u8D25\uFF0C\u8FD9\u91CC\u8BB0\u4E3A\u5931\u8D25\uFF0C\u800C\u4E0D\u662F\u51ED\u636E\u95E8\u63A7\u3002"
  },
  tools_list_not_jsonrpc: {
    en: (p) => `We called tools/list. The server answered HTTP ${requireParam(p, "status")} with a body we could not read as a JSON-RPC message.`,
    zh: (p) => `\u6211\u4EEC\u8C03\u7528\u4E86 tools/list\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u4F46\u54CD\u5E94\u4F53\u65E0\u6CD5\u6309 JSON-RPC \u6D88\u606F\u8BFB\u53D6\u3002`
  },
  tools_list_jsonrpc_error: {
    en: (p) => `We called tools/list. The server answered HTTP ${requireParam(p, "status")} with a JSON-RPC error instead of a tool list.`,
    zh: (p) => `\u6211\u4EEC\u8C03\u7528\u4E86 tools/list\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u5185\u5BB9\u662F JSON-RPC error\uFF0C\u800C\u4E0D\u662F\u5DE5\u5177\u5217\u8868\u3002`
  },
  tools_list_not_array: {
    en: (p) => `We called tools/list. The server answered HTTP ${requireParam(p, "status")} with a JSON-RPC result that does not contain a tools array.`,
    zh: (p) => `\u6211\u4EEC\u8C03\u7528\u4E86 tools/list\u3002\u670D\u52A1\u5668\u8FD4\u56DE HTTP ${requireParam(p, "status")} \u548C JSON-RPC result\uFF0C\u4F46\u5176\u4E2D\u6CA1\u6709 tools \u6570\u7EC4\u3002`
  },
  fingerprint_tool_missing_name: {
    en: () => "At least one tool in the tools/list response has no string name, so this fingerprint could not be computed.",
    zh: () => "tools/list \u54CD\u5E94\u4E2D\u81F3\u5C11\u6709\u4E00\u4E2A\u5DE5\u5177\u6CA1\u6709\u5B57\u7B26\u4E32\u7C7B\u578B\u7684 name\uFF0C\u56E0\u6B64\u65E0\u6CD5\u8BA1\u7B97\u6B64\u6307\u7EB9\u3002"
  },
  fingerprint_canonicalize_failed: {
    en: () => "The tool data could not be converted into the canonical JSON form this fingerprint is computed from.",
    zh: () => "\u5DE5\u5177\u6570\u636E\u65E0\u6CD5\u8F6C\u6362\u4E3A\u8BA1\u7B97\u6B64\u6307\u7EB9\u6240\u7528\u7684\u89C4\u8303\u5316 JSON \u5F62\u5F0F\u3002"
  },
  auth_401_no_challenge: {
    en: () => "A 401 was received with no credentials, but no WWW-Authenticate challenge was observable.",
    zh: () => "\u65E0\u51ED\u636E\u65F6\u6536\u5230 401\uFF0C\u4F46\u6CA1\u6709 WWW-Authenticate challenge \u53EF\u4F9B\u89C2\u5BDF"
  },
  auth_challenge_no_metadata_url: {
    en: () => "The WWW-Authenticate challenge does not point to any verifiable resource metadata document.",
    zh: () => "WWW-Authenticate challenge \u672A\u6307\u5411\u4EFB\u4F55\u53EF\u6838\u5B9E\u7684 resource metadata \u6587\u6863"
  },
  auth_metadata_http_error: {
    en: (p) => `The metadata document referenced by the challenge returned HTTP ${requireParam(p, "status")}, not a usable 200.`,
    zh: (p) => `challenge \u6307\u5411\u7684 metadata \u6587\u6863\u8FD4\u56DE HTTP ${requireParam(p, "status")}\uFF0C\u4E0D\u662F\u53EF\u7528\u7684 200`
  },
  auth_metadata_invalid_json: {
    en: () => "The metadata document referenced by the challenge is not valid JSON.",
    zh: () => "challenge \u6307\u5411\u7684 metadata \u6587\u6863\u4E0D\u662F\u5408\u6CD5 JSON"
  },
  auth_metadata_not_json_object: {
    en: () => "The metadata document referenced by the challenge is not a JSON object.",
    zh: () => "challenge \u6307\u5411\u7684 metadata \u6587\u6863\u4E0D\u662F\u4E00\u4E2A JSON \u5BF9\u8C61"
  },
  auth_scope_contradiction: {
    en: () => "The scope claimed by WWW-Authenticate contradicts its own metadata document's scopes_supported.",
    zh: () => "WWW-Authenticate \u58F0\u660E\u7684 scope \u4E0E\u5176\u81EA\u8EAB metadata \u6587\u6863\u7684 scopes_supported \u77DB\u76FE"
  },
  credential_required: {
    en: (p) => `This check requires credentials to complete \u2014 the server responded 401 with a "${requireParam(p, "scheme")}" authentication challenge. We never send credentials of our own, so we can't verify what's behind it; this looks like a deliberate access-control choice, not a broken implementation.`,
    zh: (p) => `\u6B64\u68C0\u67E5\u9700\u8981\u51ED\u636E\u624D\u80FD\u5B8C\u6210\u2014\u2014\u670D\u52A1\u7AEF\u8FD4\u56DE 401 \u5E76\u9644\u5E26 "${requireParam(p, "scheme")}" \u8BA4\u8BC1 challenge\u3002\u6211\u4EEC\u4ECE\u4E0D\u53D1\u9001\u4EFB\u4F55\u51ED\u636E\uFF0C\u56E0\u6B64\u65E0\u6CD5\u9A8C\u8BC1\u80CC\u540E\u7684\u884C\u4E3A\uFF1B\u8FD9\u770B\u8D77\u6765\u662F\u6709\u610F\u7684\u8BBF\u95EE\u63A7\u5236\u9009\u62E9\uFF0C\u4E0D\u662F\u5B9E\u73B0\u6545\u969C\u3002`
  },
  // T86: why error_taxonomy and auth_metadata did not run — probe.ts withheld
  // the tools/call carrying its reserved tool name. Shared by both rows; no
  // params.
  probe_tool_name_collision: {
    en: () => "Your server lists a tool with the exact name our probe reserves for a tool that should not exist, so we did not send that call, and nothing that depends on it was observed.",
    zh: () => "\u670D\u52A1\u5668\u7684\u5DE5\u5177\u5217\u8868\u91CC\u6709\u4E00\u4E2A\u4E0E\u6211\u4EEC\u63A2\u6D4B\u7528\u7684\u300C\u4E0D\u5E94\u5B58\u5728\u7684\u5DE5\u5177\u300D\u540C\u540D\u7684\u5DE5\u5177\uFF0C\u56E0\u6B64\u6211\u4EEC\u6CA1\u6709\u53D1\u9001\u8FD9\u6B21\u8C03\u7528\uFF0C\u4F9D\u8D56\u5B83\u7684\u89C2\u6D4B\u90FD\u6CA1\u6709\u8FDB\u884C\u3002"
  },
  // Suite 0.15.0: tools/list was not read to its end (more than 10 pages or
  // 5,000 tools, or a later page that could not be read). No params.
  tools_list_incomplete: {
    en: () => "We could not read your server's whole tool list in this run (it was longer than 10 pages or 5,000 tools, or a later page could not be read), so nothing that depends on the whole list is recorded as verified.",
    zh: () => "\u672C\u6B21 run \u6CA1\u80FD\u8BFB\u5B8C\u8BE5\u670D\u52A1\u5668\u7684\u5B8C\u6574\u5DE5\u5177\u5217\u8868\uFF08\u8D85\u8FC7 10 \u9875\u6216 5,000 \u4E2A\u5DE5\u5177\uFF0C\u6216\u540E\u9762\u67D0\u4E00\u9875\u8BFB\u4E0D\u51FA\u6765\uFF09\uFF0C\u56E0\u6B64\u4F9D\u8D56\u5B8C\u6574\u5217\u8868\u7684\u7ED3\u8BBA\u90FD\u4E0D\u8BB0\u4E3A\u5DF2\u9A8C\u8BC1\u3002"
  },
  // T86: produced when tools/list failed, or when the list was not read to its
  // end (suite 0.15.0: tools_list_incomplete; up to suite 0.14.0, which read
  // the first page only, a nextCursor on it). No params.
  probe_tool_name_unverifiable: {
    en: () => "We could not see your server's full tool list, so we could not rule out that it has a tool with the name our probe reserves, and did not send that call; nothing that depends on it was observed.",
    zh: () => "\u6211\u4EEC\u6CA1\u80FD\u770B\u5230\u5B8C\u6574\u7684\u5DE5\u5177\u5217\u8868\uFF0C\u65E0\u6CD5\u6392\u9664\u5176\u4E2D\u6709\u4E0E\u63A2\u6D4B\u4FDD\u7559\u540D\u540C\u540D\u7684\u5DE5\u5177\uFF0C\u56E0\u6B64\u6CA1\u6709\u53D1\u9001\u8FD9\u6B21\u8C03\u7528\uFF0C\u4F9D\u8D56\u5B83\u7684\u89C2\u6D4B\u90FD\u6CA1\u6709\u8FDB\u884C\u3002"
  },
  disqualified_no_protocol_revision: {
    en: () => "No usable protocol_revision was observed, so a schema-valid attestation payload could not be assembled.",
    zh: () => "\u672A\u89C2\u5BDF\u5230\u53EF\u7528\u7684 protocol_revision\uFF0C\u65E0\u6CD5\u7EC4\u88C5\u7B26\u5408 schema \u7684 attestation payload"
  },
  disqualified_no_fingerprint: {
    en: () => "toolset_fingerprint/schema_fingerprint could not be computed \u2014 an attestation payload could not be assembled.",
    zh: () => "toolset_fingerprint/schema_fingerprint \u672A\u80FD\u8BA1\u7B97\uFF0C\u65E0\u6CD5\u7EC4\u88C5 attestation payload"
  },
  disqualified_protocol_revision_not_a_date: {
    en: () => "The server declared a protocol version that is not a calendar date, so a schema-valid attestation payload could not be assembled.",
    zh: () => "\u670D\u52A1\u5668\u58F0\u660E\u7684\u534F\u8BAE\u7248\u672C\u4E0D\u662F\u65E5\u5386\u65E5\u671F\uFF0C\u65E0\u6CD5\u7EC4\u88C5\u7B26\u5408 schema \u7684 attestation payload"
  },
  disqualified_signer_call_failed: {
    en: (p) => `The signer call failed \u2014 this result could not be signed: ${requireParam(p, "message")}`,
    zh: (p) => `signer \u8C03\u7528\u5931\u8D25\uFF0C\u672C\u6B21\u7ED3\u679C\u65E0\u6CD5\u7B7E\u540D\uFF1A${requireParam(p, "message")}`
  }
};

// src/messages.ts
var NOT_COMPARED = { en: "Not compared: this Action does not read a baseline.", zh: "\u672A\u6BD4\u8F83\uFF1A\u8FD9\u4E2A Action \u4E0D\u8BFB\u53D6\u57FA\u7EBF\u3002" };
var ACTION_REASONS = { no_baseline_reason: NOT_COMPARED, no_baseline_reason_generic: NOT_COMPARED };
var NO_TOOLS_CALL = { en: "No tools/call was sent in this run.", zh: "\u8FD9\u6B21\u8FD0\u884C\u6CA1\u6709\u53D1\u9001 tools/call\u3002" };
var STDIO_NOT_REPORTED = { en: "The checks that observe an HTTP endpoint (reachability, redirects, transport type, authorization metadata, TLS and latency) are not reported for a server on stdio.", zh: "\u89C2\u5BDF HTTP \u7AEF\u70B9\u7684\u68C0\u67E5\uFF08\u53EF\u8FBE\u6027\u3001\u91CD\u5B9A\u5411\u3001\u4F20\u8F93\u7C7B\u578B\u3001\u6388\u6743\u5143\u6570\u636E\u3001TLS \u548C\u5EF6\u8FDF\uFF09\u4E0D\u4F1A\u4E3A stdio \u7684 server \u62A5\u544A\u3002" };

// src/render.ts
var SUMMARY_HEADING = "Observed in this runner \xB7 unsigned";
var COMMENT_MARKER = "<!-- mcpcheckup-release-check:v1 -->";
var UNKNOWN_TOOL_NAME = "__mcpcheckup_probe_nonexistent_tool__";
var WITHHELD_KEYS = /* @__PURE__ */ new Set(["probe_tool_name_collision", "probe_tool_name_unverifiable", "credential_required"]);
var plain = (v) => typeof v === "number" ? v : v.replace(/[^A-Za-z0-9._~+-]/g, "?");
var cell = (text) => text.replace(/\s+/g, " ").replaceAll("|", "\\|");
var code = (text, none) => text === null ? none : `\`${text}\``;
function reasonText(reason) {
  if (reason === null) return "";
  const { key, params } = reason;
  if (Object.hasOwn(ACTION_REASONS, key)) return ACTION_REASONS[key].en;
  if (key === "latency_measured" && typeof params?.p50_ms === "number" && typeof params.p95_ms === "number" && typeof params.n === "number") {
    return `Measured from this runner: p50 ${params.p50_ms} ms, p95 ${params.p95_ms} ms (n = ${params.n}).`;
  }
  const fallback = `(reason ${plain(key)})`;
  if (!Object.hasOwn(REASON_MESSAGES, key)) return fallback;
  try {
    const safe = Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, plain(v)]));
    return REASON_MESSAGES[key].en(safe);
  } catch {
    return fallback;
  }
}
var row = (a) => `| \`${a.check_id}\` | ${a.assertion_status} | ${cell(reasonText(a.reason))} |`;
var seconds = (ms) => `${(ms ?? 0) / 1e3} s`;
function processText(p) {
  switch (p.outcome) {
    case "ok":
      return "Started, and stopped by this Action when the checks ended.";
    case "not_started":
      return `Could not be started${p.error_code === null ? "" : ` (${plain(p.error_code)})`}.`;
    case "exited_early":
      return `Exited before the checks ended (${p.signal === null ? `exit code ${p.exit_code ?? "unknown"}` : `signal ${plain(p.signal)}`}).`;
    case "start_timeout":
      return `Gave no answer within ${seconds(p.limit_ms)} of being started; stopped by this Action.`;
    case "handshake_timeout":
      return `Did not finish the handshake within ${seconds(p.limit_ms)}; stopped by this Action.`;
    case "request_timeout":
      return `Did not answer a request within ${seconds(p.limit_ms)}; stopped by this Action.`;
    case "total_timeout":
      return `The checks did not end within ${seconds(p.limit_ms)} in total; the server was stopped by this Action.`;
    case "output_too_large":
      return `Wrote a line longer than ${p.limit_ms ?? 0} bytes; stopped by this Action.`;
  }
}
function factsSection(o) {
  return [
    "| Observation | Value |",
    "| --- | --- |",
    `| Protocol revision the server declared | ${code(o.protocol_revision, "none observed")} |`,
    `| Tools listed | ${o.tool_count ?? "not read"} |`,
    `| Toolset fingerprint | ${code(o.toolset_fingerprint, "not computed")} |`,
    `| Schema fingerprint | ${code(o.schema_fingerprint, "not computed")} |`,
    ...o.process === null ? [] : [`| Server process | ${processText(o.process)} |`, `| Launch configuration digest | ${code(o.launch_config_digest, "not computed")} |`]
  ];
}
function gatedSection(o) {
  const a = o.auth_observation;
  const lines = [
    "The server answered the handshake with HTTP 401 and an authentication challenge. This Action sends no credentials, so it reports only the four checks that can be observed without them. The other checks were not run."
  ];
  if (a === null) return lines;
  const names = a.param_names.map((n) => `\`${plain(n)}\``).join(", ");
  const metadataUrl = a.resource_metadata_url_withheld ? "named, not shown" : code(a.resource_metadata_url, "none named");
  return [
    ...lines,
    "",
    "| Challenge | Value |",
    "| --- | --- |",
    `| Scheme | \`${plain(a.scheme)}\` |`,
    `| Parameter names | ${names === "" ? "none" : names}${a.param_names_truncated ? " (some not shown)" : ""} |`,
    `| Resource metadata URL | ${metadataUrl} |`,
    `| Resource metadata document digest | ${code(a.resource_metadata_body_digest, "none")} |`
  ];
}
function renderSummary(o) {
  const taxonomy = o.assertions.find((a) => a.check_id === "error_taxonomy");
  const key = taxonomy?.reason?.key ?? "";
  const call = taxonomy?.execution_status === "COMPLETED" || key === "error_shape_not_observed" ? ` The \`error_taxonomy\` row comes from one tools/call to a tool name the server did not list, \`${UNKNOWN_TOOL_NAME}\`.` : WITHHELD_KEYS.has(key) ? ` ${NO_TOOLS_CALL.en}` : "";
  const intro = o.process === null ? `Release Check read \`${o.endpoint}\` from this runner at ${o.observed_at}. Everything below was observed here and is unsigned: it is not an MCP Checkup attestation. This run sent no credentials to the server and made no request to MCP Checkup.` : `Release Check started the server command from the \`command\` input in this runner, without a shell, at ${o.observed_at}. Everything below was observed here and is unsigned: it is not an MCP Checkup attestation. The server was given only the environment variables named in \`env-names\` and a small fixed set that a process needs to start; their values are not shown or stored. This run made no request to MCP Checkup.`;
  return [
    `## ${SUMMARY_HEADING}`,
    "",
    intro,
    "",
    ...o.scope === "auth_gated" ? gatedSection(o) : factsSection(o),
    "",
    "### Checks",
    "",
    "| Check | State | Detail |",
    "| --- | --- | --- |",
    ...o.assertions.map(row),
    "",
    `Each state is VERIFIED, FAILED, OBSERVED_RISK or UNVERIFIED, with its reason. There is no score and no verdict here.${call}${o.process === null ? "" : ` ${STDIO_NOT_REPORTED.en}`}`,
    ""
  ].join("\n");
}
var renderComment = (o) => `${COMMENT_MARKER}
${renderSummary(o)}`;

// src/github.ts
var GithubError = class extends Error {
  status;
  constructor(status) {
    super(`GitHub API answered HTTP ${status}`);
    this.status = status;
  }
};
var MAX_COMMENT_PAGES = 10;
var COMMENTS_PER_PAGE = 100;
var GITHUB_TIMEOUT_MS = 15e3;
var isPathSegment = (s) => s !== "" && s !== "." && s !== ".." && encodeURIComponent(s) === s;
function pullRequestContext(env, token, read = (p) => (0, import_node_fs.readFileSync)(p, "utf8")) {
  if (env.GITHUB_EVENT_NAME !== "pull_request" && env.GITHUB_EVENT_NAME !== "pull_request_target") return null;
  const [owner, name, ...rest] = (env.GITHUB_REPOSITORY ?? "").split("/");
  if (owner === void 0 || name === void 0 || rest.length > 0 || !isPathSegment(owner) || !isPathSegment(name)) return null;
  if (env.GITHUB_API_URL === void 0 || env.GITHUB_EVENT_PATH === void 0 || token === "") return null;
  let api;
  let number;
  try {
    api = new URL(env.GITHUB_API_URL);
    number = JSON.parse(read(env.GITHUB_EVENT_PATH)).pull_request?.number;
  } catch {
    return null;
  }
  if (api.protocol !== "https:" || typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) return null;
  return { api: `${api.origin}${api.pathname.replace(/\/+$/, "")}`, repository: `${owner}/${name}`, pullNumber: number, token };
}
async function githubRequest(t, method, path, body, deps) {
  const send = deps.fetch ?? ((input, init) => fetch(input, init));
  const res = await send(`${t.api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${t.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": RELEASE_CHECK_USER_AGENT,
      ...body === void 0 ? {} : { "content-type": "application/json" }
    },
    ...body === void 0 ? {} : { body: JSON.stringify(body) },
    redirect: "error",
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS)
  });
  if (!res.ok) throw new GithubError(res.status);
  return res.json();
}
function isOwnComment(c) {
  const x = c;
  return typeof x === "object" && x !== null && Number.isSafeInteger(x.id) && typeof x.body === "string" && x.body.includes(COMMENT_MARKER) && x.user?.type === "Bot";
}
async function upsertComment(t, body, deps = {}) {
  const issues = `/repos/${t.repository}/issues`;
  for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
    const list = await githubRequest(t, "GET", `${issues}/${t.pullNumber}/comments?per_page=${COMMENTS_PER_PAGE}&page=${page}`, void 0, deps);
    if (!Array.isArray(list)) throw new GithubError(200);
    const own = list.find(isOwnComment);
    if (own !== void 0) {
      await githubRequest(t, "PATCH", `${issues}/comments/${own.id}`, { body }, deps);
      return "updated";
    }
    if (list.length < COMMENTS_PER_PAGE) break;
  }
  await githubRequest(t, "POST", `${issues}/${t.pullNumber}/comments`, { body }, deps);
  return "created";
}
function resolveOutputPath(workspace, name) {
  const abs = (0, import_node_path.resolve)(workspace, name);
  const rel = (0, import_node_path.relative)(workspace, abs);
  if (rel === "" || rel.startsWith("..") || (0, import_node_path.isAbsolute)(rel) || /[\r\n]/.test(name)) throw new InputError('input "output-file" must be a file path inside the workspace');
  return abs;
}
function writeObservationFile(path, json) {
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(path), { recursive: true });
  (0, import_node_fs.writeFileSync)(path, json);
}
function appendSummary(env, markdown) {
  if (env.GITHUB_STEP_SUMMARY) (0, import_node_fs.appendFileSync)(env.GITHUB_STEP_SUMMARY, markdown);
}
function setOutputs(env, outputs) {
  if (!env.GITHUB_OUTPUT) return;
  const lines = Object.entries(outputs).map(([k, v]) => {
    if (/[\r\n]/.test(v)) throw new Error(`step output ${k} holds a line break`);
    return `${k}=${v}
`;
  });
  (0, import_node_fs.appendFileSync)(env.GITHUB_OUTPUT, lines.join(""));
}

// src/run.ts
var DEFAULT_OUTPUT_FILE = "release-check-observation.json";
var outputsOf = (o, file) => ({
  "observation-file": file,
  scope: o.scope,
  "protocol-revision": o.protocol_revision ?? "",
  "tool-count": o.tool_count === null ? "" : String(o.tool_count),
  "toolset-fingerprint": o.toolset_fingerprint ?? "",
  "schema-fingerprint": o.schema_fingerprint ?? ""
});
function readComment(raw) {
  const value = (raw ?? "true").trim().toLowerCase();
  if (value !== "true" && value !== "false") throw new InputError('input "comment" must be true or false');
  return value === "true";
}
async function runAction(env, deps = {}) {
  const log = deps.log ?? ((line) => console.log(line));
  try {
    const comment = readComment(env.INPUT_COMMENT);
    const file = resolveOutputPath(env.GITHUB_WORKSPACE ?? process.cwd(), env["INPUT_OUTPUT-FILE"] || DEFAULT_OUTPUT_FILE);
    const url = env.INPUT_URL ?? "";
    const command = env.INPUT_COMMAND ?? "";
    if (url.trim() === "" === (command.trim() === "")) throw new InputError('give exactly one of input "url" (a server that is already running) and input "command" (a server this Action starts)');
    if (url.trim() !== "" && (env["INPUT_ENV-NAMES"] ?? "").trim() !== "") throw new InputError('input "env-names" is used only with input "command"');
    const observation = await (url.trim() !== "" ? (deps.observe ?? observeRemote)(url) : (deps.observeStdio ?? observeStdio)(command, env["INPUT_ENV-NAMES"], env));
    writeObservationFile(file, `${JSON.stringify(observation, null, 2)}
`);
    appendSummary(env, renderSummary(observation));
    setOutputs(env, outputsOf(observation, file));
    const target = comment ? pullRequestContext(env, env["INPUT_GITHUB-TOKEN"] ?? "") : null;
    if (target === null) {
      log('Release Check: no pull request comment was posted (input "comment" is false, this is not a pull request event, or no token was given). The observation is in the job summary.');
    } else {
      try {
        log(`Release Check: pull request comment ${await upsertComment(target, renderComment(observation), deps.github)}.`);
      } catch (e) {
        log(`::warning::Release Check could not post the pull request comment (${e instanceof GithubError ? `HTTP ${e.status}` : "request failed"}). The observation is in the job summary.`);
      }
    }
    return 0;
  } catch (e) {
    log(`::error::Release Check could not run: ${e instanceof InputError ? e.message : "unexpected error"}`);
    return 1;
  }
}

// src/index.ts
void runAction(process.env).then((status) => {
  process.exitCode = status;
});
