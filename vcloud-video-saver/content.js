(() => {
  const TAG = "[VCloud Saver]";
  const state = { mp4: null };

  // Show UI only in the top frame (avoid button inside iframe)
  if (window.top !== window.self) return;

  function isMp4(url) {
    return typeof url === "string" && /\.mp4(\?|$)/i.test(url);
  }

  function setMp4(url) {
    if (!isMp4(url)) return;
    if (state.mp4 === url) return;

    state.mp4 = url;
    console.log(TAG, "MP4 ready:", url);
    updateBtn();
  }

  // -------------------------
  // UI Button (avoid duplicates)
  // -------------------------
  const BTN_ID = "vcloud-saver-download-btn";
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement("button");
  btn.id = BTN_ID;

  Object.assign(btn.style, {
    position: "fixed",
    zIndex: "999999",
    top: "12px",
    right: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #999",
    background: "white",
    cursor: "pointer",
    fontSize: "14px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
    opacity: "0.7",
  });

  function updateBtn() {
    if (state.mp4) {
        btn.style.background = "#2ecc71"; // green
        btn.style.borderColor = "#27ae60";
        btn.style.color = "#ffffff";
        btn.style.cursor = "pointer";
        btn.disabled = false;
        btn.textContent = "Download video";
        btn.style.opacity = "1";
    } else {
        btn.style.background = "#f1f1f1";
        btn.style.borderColor = "#999";
        btn.style.color = "#666";
        btn.style.cursor = "not-allowed";
        btn.disabled = true;
        btn.textContent = "Waiting for video URL...";
        btn.style.opacity = "0.7";
    }
  }

    btn.addEventListener("click", () => {
    if (!state.mp4) return;

    chrome.runtime.sendMessage({ type: "DOWNLOAD_URL", url: state.mp4 });
    });

  (document.body || document.documentElement).appendChild(btn);
  updateBtn();

  // -------------------------
  // Best-effort stop playback
  // -------------------------
  function stopVideoPlayback() {
    document.querySelectorAll("video").forEach((v) => {
      try {
        v.pause();
        v.autoplay = false;
      } catch {}
    });
  }
  setInterval(stopVideoPlayback, 500);

  // -------------------------
  // Pull MP4 URL from background (captured via webRequest)
  // -------------------------
  function refreshFromBackground() {
    chrome.runtime.sendMessage({ type: "GET_LAST_MP4" }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp?.ok && resp.url) setMp4(resp.url);
    });
  }

  refreshFromBackground();
  setInterval(refreshFromBackground, 800);
})();
