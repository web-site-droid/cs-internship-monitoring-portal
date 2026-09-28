document.addEventListener('DOMContentLoaded', () => {
  const gpsBtn = document.getElementById('ojtLocationGpsBtn');
  const latInput = document.getElementById('ojtLocationLat');
  const lngInput = document.getElementById('ojtLocationLng');
  const siteInput = document.getElementById('ojtLocationSiteName');
  if (!gpsBtn || !latInput || !lngInput || !siteInput) return;

  let geocodeTimer = null;
  let geocodeRequestId = 0;

  function parseCoord(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function refreshPreview() {
    if (typeof updateOjtLocationMapPreview === 'function') {
      updateOjtLocationMapPreview(latInput.value, lngInput.value);
    }
  }

  async function fetchSiteName(lat, lng, { force = false } = {}) {
    if (!force && siteInput.dataset.userEdited === '1') return;
    if (!force && siteInput.value.trim()) return;

    const requestId = ++geocodeRequestId;

    try {
      const res = await fetch(
        `/supervisor/students/ojt-location/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
        { credentials: 'same-origin', headers: { Accept: 'application/json' } }
      );
      const data = await res.json();
      if (requestId !== geocodeRequestId) return;
      if (!res.ok || !data.name) return;
      if (force || siteInput.dataset.userEdited !== '1') {
        siteInput.value = data.name;
        siteInput.dataset.userEdited = '';
      }
    } catch {
      // User can enter the site name manually.
    }
  }

  function scheduleSiteNameLookup(force = false) {
    const lat = parseCoord(latInput.value);
    const lng = parseCoord(lngInput.value);
    if (lat == null || lng == null) return;

    clearTimeout(geocodeTimer);
    geocodeTimer = setTimeout(() => fetchSiteName(lat, lng, { force }), force ? 0 : 800);
  }

  siteInput.addEventListener('input', () => {
    if (siteInput.value.trim()) {
      siteInput.dataset.userEdited = '1';
    } else {
      delete siteInput.dataset.userEdited;
      scheduleSiteNameLookup(false);
    }
  });

  latInput.addEventListener('input', () => {
    refreshPreview();
    scheduleSiteNameLookup(false);
  });

  lngInput.addEventListener('input', () => {
    refreshPreview();
    scheduleSiteNameLookup(false);
  });

  document.addEventListener('ojt-location-open', (e) => {
    const detail = e.detail || {};
    siteInput.dataset.userEdited = (detail.siteName || '').trim() ? '1' : '';
    if (!(detail.siteName || '').trim() && detail.lat && detail.lng) {
      scheduleSiteNameLookup(false);
    }
  });

  refreshPreview();

  gpsBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('GPS is not available on this device.');
      return;
    }

    gpsBtn.disabled = true;
    const originalHtml = gpsBtn.innerHTML;
    gpsBtn.textContent = 'Getting GPS…';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latInput.value = pos.coords.latitude.toFixed(7);
        lngInput.value = pos.coords.longitude.toFixed(7);
        refreshPreview();
        fetchSiteName(pos.coords.latitude, pos.coords.longitude, { force: true });
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = originalHtml;
      },
      () => {
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = originalHtml;
        alert('Could not get GPS. Allow location access or enter coordinates manually.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
});
