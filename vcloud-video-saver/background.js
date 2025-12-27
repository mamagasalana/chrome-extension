console.log("[VCloud Saver] Service worker started");

// -------------------------
// Config
// -------------------------
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

function extract_url(fullUrl) {
  try {
    const u = new URL(fullUrl);

    // Ensure it's the page you expect
    if (u.hostname !== "god-ys.com") return null;
    if (u.pathname !== "/artplayer/index.html") return null;

    // Pull query param `url`
    const inner = u.searchParams.get("url"); // e.g. "/vcloud/f/.../.../"
    if (!inner) return null;

    // Normalize + validate it
    // allow absolute or relative forms just in case
    const path = inner.startsWith("http")
      ? new URL(inner).pathname
      : inner;

    // Extract the vcloud key path
    const m = path.match(/^\/vcloud\/f\/[^\/]+\/[^\/]+\/?$/i);
    if (!m) return null;

    // Return without leading slash if you want
    return 'https://god-ys.com/' +  m[0].replace(/^\//, "").replace(/\/?$/, "/");
  } catch {
    return null;
  }
}

function isMp4Url(url) {
  return typeof url === "string" && /\.mp4(\?|$)/i.test(url);
}
function isVcloudFUrl(url) {
  return typeof url === "string" &&
    /^https:\/\/god-ys\.com\/artplayer\/index\.html(?:[/?#].*)?$/i.test(url);
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

function mp4Key(tabId) {
  return `mp4_${tabId}`;
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

    chrome.storage.session.set({ [vcloudKey(details.tabId)] : extract_url(url) });
    console.log("[VCloud Saver] Captured VCloud iframe URL:", url, "tabId:", details.tabId, "frameId:", details.frameId);
  },
  {
    urls: ["https://god-ys.com/artplayer/index.html?*"],
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
// C) DNR: Block site-initiated MP4 playback (iframe/video player)
// -------------------------
async function ensureRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [
        {
          id: DNR_RULE_ID,
          priority: 1,
          action: { type: "block" },
          condition: {
            urlFilter: "||god-ys.com/artplayer/index.html",
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

    // if (sender?.tab?.id != null) {
    //   chrome.tabs.update(sender.tab.id, { url: pageUrl }, () => sendResponse({ ok: true }));
    //   return true;
    // }

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
