// Inject page.js into the page's main world
(() => {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page.js');
    s.onload = () => s.remove();
    (document.documentElement || document.head || document.body).appendChild(s);
  } catch (e) {}
})();
