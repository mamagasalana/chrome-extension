(() => {
  const eventsToBlock = [
    "visibilitychange",
    "webkitvisibilitychange",
    "mozvisibilitychange",
    "hasFocus",
    "blur",
    "focus",
    "mouseleave"
  ];

  // Capture listeners in the capture phase to intercept early
  for (const eventName of eventsToBlock) {
    // document listeners
    document.addEventListener(eventName, function (event) {
      try {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      } catch (e) {}
    }, true);

    // window listeners
    window.addEventListener(eventName, function (event) {
      try {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      } catch (e) {}
    }, true);
  }

  // Force hasFocus() to always return true
  try {
    document.hasFocus = function () { return true; };
  } catch (e) {}

  // Clear onvisibilitychange handler if set after load
  try {
    document.onvisibilitychange = null;
  } catch (e) {}

  // Helper to define read-only properties safely
  const safeDefine = (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, {
        get: () => value,
        set: () => true,
        configurable: true
      });
    } catch (e) {}
  };

  // Visibility/focus related properties
  safeDefine(document, "visibilityState", "visible");
  safeDefine(document, "hidden", false);
  safeDefine(document, "mozHidden", false);
  safeDefine(document, "webkitHidden", false);
  safeDefine(document, "webkitVisibilityState", "visible");

  // Optional: also patch on pages that read directly from document.hidden via descriptor
  // (already handled by getters above)

  // Note: Some sites attach listeners late; since we use capture + stopImmediatePropagation,
  // most will be blocked. If a site uses Shadow DOM or dynamically created iframes,
  // all_frames + document_start helps, but cross-origin iframes can’t be scripted.
})();
