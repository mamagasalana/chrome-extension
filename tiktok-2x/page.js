(() => {
  'use strict';

  const MAX_RATE = 2.0;
  let currentRate = 1.4;      // default target
  let lockRate = true;        // keep forcing our rate

  // Style for the mini controller
  const style = `
    .tt-2x-box {
      position: fixed; right: 14px; bottom: 14px; z-index: 999999;
      display: flex; gap: 6px; align-items: center;
      padding: 8px 10px; background: rgba(0,0,0,.7);
      color: #fff; font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      border-radius: 10px; user-select: none; backdrop-filter: blur(2px);
    }
    .tt-2x-btn {
      border: 0; padding: 6px 8px; border-radius: 8px; cursor: pointer;
      background: rgba(255,255,255,.15); color: #fff;
    }
    .tt-2x-btn:active { transform: translateY(1px); }
    .tt-2x-rate { min-width: 36px; text-align: center; }
  `;

  function injectStyle() {
    const s = document.createElement('style');
    s.textContent = style;
    document.documentElement.appendChild(s);
  }

  function setRateOn(el, rate) {
    try { el.playbackRate = Math.min(MAX_RATE, Math.max(0.0625, rate)); } catch {}
  }

  function clampToTarget(el) {
    if (!el || typeof el.playbackRate !== 'number') return;
    if (!lockRate) return;
    if (Math.abs(el.playbackRate - currentRate) > 0.001) {
      setRateOn(el, currentRate);
    }
  }

  function getAllVideos(root = document) {
    return Array.from(root.querySelectorAll('video'));
  }

  function applyToAll(rate = currentRate) {
    getAllVideos().forEach(v => setRateOn(v, rate));
  }

  // Mutation observer: new videos / re-renders
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach(n => {
        if (n.nodeType === 1) {
          if (n.tagName === 'VIDEO') {
            setRateOn(n, currentRate);
            hookRateSetter(n);
          } else {
            getAllVideos(n).forEach(v => {
              setRateOn(v, currentRate);
              hookRateSetter(v);
            });
          }
        }
      });
    }
  });

  function startObserving() {
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // Patch attempts by the site to change playbackRate on existing videos
  function hookRateSetter(video) {
    if (!video || video.__ttRateHooked) return;
    video.__ttRateHooked = true;

    const origDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
    if (!origDesc || !origDesc.set || !origDesc.get) return;

    // Per-element guard: re-apply on 'ratechange'
    video.addEventListener('ratechange', () => clampToTarget(video), true);
  }

  // Global safety net: keep rate consistent
  const interval = setInterval(() => {
    if (!lockRate) return;
    getAllVideos().forEach(clampToTarget);
  }, 500);

  // Build floating UI
  function buildUI() {
    if (document.querySelector('.tt-2x-box')) return;
    const box = document.createElement('div');
    box.className = 'tt-2x-box';
    box.innerHTML = `
      <button class="tt-2x-btn" data-act="dec">−</button>
      <div class="tt-2x-rate" aria-label="rate">${currentRate.toFixed(2)}×</div>
      <button class="tt-2x-btn" data-act="inc">+</button>
      <button class="tt-2x-btn" data-act="2x">2×</button>
      <button class="tt-2x-btn" data-act="1x">1×</button>
      <button class="tt-2x-btn" data-act="lock">${lockRate ? '🔒' : '🔓'}</button>
    `;
    box.addEventListener('click', (e) => {
      const act = e.target && e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'inc') currentRate = Math.min(MAX_RATE, +(currentRate + 0.25).toFixed(2));
      if (act === 'dec') currentRate = Math.max(0.25, +(currentRate - 0.25).toFixed(2));
      if (act === '2x') currentRate = 2.0;
      if (act === '1x') currentRate = 1.0;
      if (act === 'lock') lockRate = !lockRate, e.target.textContent = lockRate ? '🔒' : '🔓';
      box.querySelector('.tt-2x-rate').textContent = `${currentRate.toFixed(2)}×`;
      applyToAll(currentRate);
    });
    document.documentElement.appendChild(box);
  }

  // Hotkeys (active when a video or page has focus)
  // ] increase, [ decrease, \ reset, 2 set to 2x, 1 set to 1x, L toggle lock
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.isContentEditable) return;

    if (e.key === ']') { currentRate = Math.min(MAX_RATE, +(currentRate + 0.25).toFixed(2)); applyToAll(currentRate); uiUpdate(); }
    else if (e.key === '[') { currentRate = Math.max(0.25, +(currentRate - 0.25).toFixed(2)); applyToAll(currentRate); uiUpdate(); }
    else if (e.key === '\\') { currentRate = 1.0; applyToAll(currentRate); uiUpdate(); }
    else if (e.key === '2') { currentRate = 2.0; applyToAll(currentRate); uiUpdate(); }
    else if (e.key === '1') { currentRate = 1.0; applyToAll(currentRate); uiUpdate(); }
    else if (e.key.toLowerCase() === 'l') { lockRate = !lockRate; uiUpdate(); }
  }

  function uiUpdate() {
    const rateEl = document.querySelector('.tt-2x-rate');
    const lockBtn = document.querySelector('.tt-2x-btn[data-act="lock"]');
    if (rateEl) rateEl.textContent = `${currentRate.toFixed(2)}×`;
    if (lockBtn) lockBtn.textContent = lockRate ? '🔒' : '🔓';
  }

  // Init
  function init() {
    injectStyle();
    buildUI();
    startObserving();

    // Apply to existing videos
    applyToAll(currentRate);
    getAllVideos().forEach(hookRateSetter);

    // Keyboard
    window.addEventListener('keydown', onKey, true);

    // Also react when TikTok swaps virtual DOM routes
    window.addEventListener('popstate', () => setTimeout(() => applyToAll(currentRate), 200), true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Cleanup on unload (optional)
  window.addEventListener('beforeunload', () => {
    try { mo.disconnect(); } catch {}
    try { clearInterval(interval); } catch {}
  });
})();
