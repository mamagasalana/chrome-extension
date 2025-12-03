console.log("[VCloud Saver] Service worker started");

// Simple helper: detect MP4 URLs
function isVideoUrl(url) {
  return /\.mp4(\?|$)/i.test(url);
}

// --- 1) Hook: capture redirect from vcloud -> mp4 ---
chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    console.log("[VCloud Saver] onBeforeRedirect:", details);

    const redirectUrl = details.redirectUrl;
    if (!redirectUrl) return;

    if (!isVideoUrl(redirectUrl)) {
      console.log("[VCloud Saver] Redirect (non-mp4), ignoring:", redirectUrl);
      return;
    }

    console.log("[VCloud Saver] Detected video redirect to:", redirectUrl);

    chrome.downloads.download(
      {
        url: redirectUrl,
        saveAs: true // ask where to save
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("[VCloud Saver] Download error:", chrome.runtime.lastError);
        } else {
          console.log("[VCloud Saver] Download started, id:", downloadId);
        }
      }
    );
  },
  {
    urls: ["https://god-ys.com/vcloud/*", "https://sdys123.xyz/vcloud/*"],
    types: ["media", "xmlhttprequest", "other", "main_frame", "sub_frame"]
  }
);

// --- 2) Backup hook: directly catch mp4 from the media host ---
chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log("[VCloud Saver] onCompleted:", details);

    const url = details.url;
    if (!isVideoUrl(url)) return;

    // Avoid re-catching our own downloads (initiator will be extension)
    if (details.initiator && details.initiator.startsWith("chrome-extension://")) {
      console.log("[VCloud Saver] Skipping extension-initiated download:", url);
      return;
    }

    console.log("[VCloud Saver] Detected completed mp4 request:", url);
    // You can auto-download here too if you want, but to avoid duplicates,
    // you might leave this as pure logging for now.
    // chrome.downloads.download({ url, saveAs: true });
  },
  {
    urls: ["https://media-qhxn-fj-person.qh6oss.ctyunxs.cn/*"],
    types: ["media", "xmlhttprequest", "other"]
  }
);
