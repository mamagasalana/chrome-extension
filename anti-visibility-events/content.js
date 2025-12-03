// Inject page.js into the main world as early as possible
(function inject() {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page.js');
    // Make sure it executes as soon as possible
    s.onload = () => s.remove();
    (document.documentElement || document.head || document.body).appendChild(s);
  } catch (e) {
    // Swallow silently; some about:blank or special pages may block injection
  }
})();
