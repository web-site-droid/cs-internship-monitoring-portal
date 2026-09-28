(function initSessionTimeout() {
  const idleMs = Number(window.SESSION_IDLE_MS);
  if (!idleMs || idleMs < 60000) return;

  const logoutUrl = window.SESSION_LOGOUT_URL || '/logout?reason=timeout';
  let lastActivity = Date.now();

  function markActive() {
    lastActivity = Date.now();
  }

  ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((eventName) => {
    document.addEventListener(eventName, markActive, { passive: true });
  });

  setInterval(function () {
    if (Date.now() - lastActivity >= idleMs) {
      window.location.href = logoutUrl;
    }
  }, 30000);

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = async function sessionAwareFetch(...args) {
      const response = await nativeFetch.apply(this, args);
      if (response.status === 401) {
        try {
          const data = await response.clone().json();
          if (data.sessionExpired) {
            window.location.href = logoutUrl;
          }
        } catch {
          /* ignore non-json 401 responses */
        }
      }
      return response;
    };
  }
})();
