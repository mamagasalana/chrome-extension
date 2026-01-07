console.log("[VCloud Saver] Service worker started");

// -------------------------
// Config
// -------------------------
const PLAYER_HOSTS = ["god-ys.com", "sdys123.xyz"];
const PLAYER_HOST_SET = new Set(PLAYER_HOSTS);

// NOTE: You had MEDIA_HOSTS but you aren't using it below.
// Keep it if used elsewhere, otherwise safe to remove.
const MEDIA_HOSTS = [
  "gdtelecom-jxncfy-gd-person.shusheng1.mini189.cn",
  "media-qhxn-fj-person.qh6oss.ctyunxs.cn",
  "cloudcube.wuxi.cn"
];

const MEDIA_HOST_SET = new Set(MEDIA_HOSTS);
const DNR_RULE_ID = 1;

// -------------------------
// Helpers
// -------------------------
function vcloudKey(tabId) {
  return `vcloud_${tabId}`;
}

function mp4Key(tabId) {
  return `mp4_${tabId}`;
}

function isMp4Url(url) {
  return typeof url === "string" && /\.mp4(\?|$)/i.test(url);
}

function isExtensionUrl(url) {
  return typeof url === "string" && url.startsWith("chrome-extension://");
}

function makeDownloadPageUrl(mp4Url) {
  return chrome.runtime.getURL("download.html") + "?url=" + encodeURIComponent(mp4Url);
}

function isOurDownloadPage(url) {
  if (!isExtensionUrl(url)) return false;
  try {
    return new URL(url).pathname.endsWith("/download.html");
  } catch {
    return false;
  }
}

// Accept both god-ys.com and sdys123.xyz
function isVcloudFUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    if (!PLAYER_HOST_SET.has(u.hostname)) return false;
    return u.pathname === "/artplayer/index.html";
  } catch {
    return false;
  }
}

// Extract & normalize the vcloud "f" URL using the SAME host as the player page.
function extract_url(fullUrl) {
  try {
    const u = new URL(fullUrl);

    if (!PLAYER_HOST_SET.has(u.hostname)) return null;
    if (u.pathname !== "/artplayer/index.html") return null;

    const inner = u.searchParams.get("url"); // e.g. "/vcloud/f/.../.../"
    if (!inner) return null;

    // allow absolute or relative forms
    const path = inner.startsWith("http") ? new URL(inner).pathname : inner;

    const m = path.match(/^\/vcloud\/f\/[^\/]+\/[^\/]+\/?$/i);
    if (!m) return null;

    // normalize to host that served the artplayer page
    const normalizedPath = m[0].replace(/\/?$/, "/");
    return `https://${u.hostname}${normalizedPath}`;
  } catch {
    return null;
  }
}

// -------------------------
// A) Capture MP4 URLs (observe only)
//    Works even if DNR blocks the request.
// -------------------------
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    console.log("found", url);
    if (!isVcloudFUrl(url)) return;

    const extracted = extract_url(url);
    if (!extracted) return;

    chrome.storage.session.set({ [vcloudKey(details.tabId)]: extracted });
    console.log("[VCloud Saver] Captured VCloud URL:", extracted, "tabId:", details.tabId, "frameId:", details.frameId);
  },
  {
    urls: [
      "https://god-ys.com/artplayer/index.html?*",
      "https://sdys123.xyz/artplayer/index.html?*",
    ],
    types: ["sub_frame", "main_frame", "xmlhttprequest", "other"],
  }
);

// -------------------------
// B) If user directly opens MP4 URL (top-level or iframe nav),
//    redirect the entire tab to download.html?url=...
// -------------------------
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // only main page nav

  chrome.storage.session.remove(vcloudKey(details.tabId), () => {
    console.log("[VCloud Saver] Cleared vcloud for tab", details.tabId, "new url:", details.url);
  });
});

// -------------------------
// C) DNR: Block site-initiated playback (extend to sdys123.xyz)
// -------------------------
async function ensureRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: DNR_RULE_IDS,
      addRules: [
        {
          id: 1,
          priority: 1,
          action: { type: "block" },
          condition: {
            urlFilter: "||god-ys.com/artplayer/index.html",
            initiatorDomains: ["god-ys.com", "sdys123.xyz"],
            resourceTypes: ["main_frame", "sub_frame", "media", "xmlhttprequest"],
          },
        },
        {
          id: 2,
          priority: 1,
          action: { type: "block" },
          condition: {
            urlFilter: "||sdys123.xyz/artplayer/index.html",
            initiatorDomains: ["god-ys.com", "sdys123.xyz"],
            resourceTypes: ["main_frame", "sub_frame", "media", "xmlhttprequest"],
          },
        },
      ],
    });

    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log("[VCloud Saver] DNR rules active:", JSON.stringify(rules.map((r) => r.id)));
  } catch (e) {
    console.error("[VCloud Saver] ensureRules() failed:", e);
  }
}

chrome.runtime.onInstalled.addListener(() => ensureRules());
chrome.runtime.onStartup.addListener(() => ensureRules());
ensureRules(); // ensure on service worker wake

// -------------------------
// D) Messages from content.js / download.html
// -------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  // content.js asks for the last captured MP4 URL for this tab
  if (msg.type === "GET_LAST_MP4") {
    const tabId = sender?.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "No tabId" });
      return;
    }

    chrome.storage.session.get(mp4Key(tabId), (data) => {
      sendResponse({ ok: true, url: data[mp4Key(tabId)] || null });
    });
    return true; // async
  }

  if (msg.type === "DOWNLOAD_URL") {
    const url = msg.url;
    if (!isMp4Url(url)) {
      sendResponse({ ok: false, error: "Not an mp4 url" });
      return;
    }

    chrome.downloads.download({ url, saveAs: true }, (downloadId) => {
      const err = chrome.runtime.lastError;
      if (err) sendResponse({ ok: false, error: err.message });
      else sendResponse({ ok: true, downloadId });
    });
    return true; // async
  }

  if (msg.type === "OPEN_DOWNLOAD_PAGE") {
    const url = msg.url;
    if (!url) {
      sendResponse({ ok: false, error: "Missing url" });
      return;
    }

    const pageUrl = makeDownloadPageUrl(url);
    chrome.tabs.create({ url: pageUrl }, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "OPEN_URL_NEW_TAB") {
    const url = msg.url;
    if (!url) return sendResponse({ ok: false, error: "Missing url" });

    chrome.tabs.create({ url }, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_LAST_VCLOUD") {
    const tabId = sender?.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "No tabId" });
      return;
    }

    chrome.storage.session.get(vcloudKey(tabId), (data) => {
      sendResponse({ ok: true, url: data[vcloudKey(tabId)] || null });
    });
    return true;
  }
});
