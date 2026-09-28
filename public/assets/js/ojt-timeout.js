document.addEventListener('DOMContentLoaded', () => {
  if (typeof initOjtCamera !== 'function' || !document.getElementById('ojtTimeOutCaptureBtn')) return;
  initOjtCamera({
    panelId: 'ojtTimeOutPanel',
    startBtnId: 'ojtTimeOutStartBtn',
    captureFlowId: 'ojtTimeOutCaptureFlow',
    statusId: 'ojtTimeOutStatus',
    refreshBtnId: 'ojtTimeOutRefreshBtn',
    cameraSectionId: 'ojtTimeOutCameraSection',
    videoId: 'ojtTimeOutPreview',
    canvasId: 'ojtTimeOutCanvas',
    capturedPreviewId: 'ojtTimeOutCapturedPreview',
    captureBtnId: 'ojtTimeOutCaptureBtn',
    retakeBtnId: 'ojtTimeOutRetakeBtn',
    verifyUrl: '/student/time-out/verify',
    submitUrl: '/student/time-out',
    captureLabel: 'Capture & Time Out',
    successTitle: 'Timed Out',
    lockMessage: 'Camera locked — return to your OJT site to time out',
    requireProgress: true,
  });
});

function initOjtCamera(config) {
  const panel = document.getElementById(config.panelId);
  if (!panel) return;

  if (config.requireProgress && panel.dataset.progressReady === 'false') {
    return;
  }

  const startBtn = config.startBtnId ? document.getElementById(config.startBtnId) : null;
  const captureFlow = config.captureFlowId ? document.getElementById(config.captureFlowId) : null;
  const statusEl = document.getElementById(config.statusId);
  const refreshBtn = document.getElementById(config.refreshBtnId);
  const cameraSection = document.getElementById(config.cameraSectionId);
  const video = document.getElementById(config.videoId);
  const canvas = document.getElementById(config.canvasId);
  const capturedPreview = document.getElementById(config.capturedPreviewId);
  const captureBtn = document.getElementById(config.captureBtnId);
  const retakeBtn = document.getElementById(config.retakeBtnId);

  let cameraStream = null;
  let currentPosition = null;
  let inGeofence = false;

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const earthRadius = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function isWithinClientGeofence(position) {
    if (window.OJT_TEST_BYPASS) return true;
    const site = window.OJT_SITE;
    if (!site || !position) return false;
    const distance = haversineMeters(
      position.latitude,
      position.longitude,
      Number(site.latitude),
      Number(site.longitude)
    );
    return distance <= Number(site.radius_meters || 150);
  }

  function clientDistanceMeters(position) {
    const site = window.OJT_SITE;
    if (!site || !position) return null;
    return haversineMeters(
      position.latitude,
      position.longitude,
      Number(site.latitude),
      Number(site.longitude)
    );
  }

  function setCameraActive(active) {
    inGeofence = active;
    if (!cameraSection) return;
    cameraSection.classList.toggle('inactive', !active);
    cameraSection.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (captureBtn) captureBtn.disabled = !active;
  }

  async function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    if (video) video.srcObject = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !video) return;
    await stopCamera();
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = cameraStream;
      await video.play();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = 'Could not open camera. Allow camera access at your OJT site.';
      }
      setCameraActive(false);
    }
  }

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS is not supported on this device.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
    });
  }

  async function parseJsonResponse(res, fallbackMessage) {
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(
        res.status === 404
          ? 'Service not found. Restart the app server (npm start) and reload.'
          : fallbackMessage
      );
    }
  }

  async function verifyLocation() {
    if (refreshBtn) refreshBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Checking your location…';
    setCameraActive(false);
    await stopCamera();

    try {
      const pos = await getLocation();
      currentPosition = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };

      const res = await fetch(config.verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(currentPosition),
      });
      const data = await parseJsonResponse(res, 'Server returned an invalid response.');

      if (data.type !== 'success') {
        if (statusEl) statusEl.textContent = data.message || 'Location check failed.';
        setCameraActive(false);
        return;
      }

      const distance = clientDistanceMeters(currentPosition);
      const within = Boolean(data.within_geofence) && isWithinClientGeofence(currentPosition);

      if (statusEl) {
        if (within) {
          statusEl.textContent = data.message;
        } else if (distance != null && window.OJT_SITE) {
          statusEl.textContent = `Your OJT site is ${window.OJT_SITE.name}. You are ${Math.round(distance)}m away — move within ${window.OJT_SITE.radius_meters}m to time in.`;
        } else {
          statusEl.textContent = data.message || 'You must be at your OJT site to continue.';
        }
      }
      if (refreshBtn) refreshBtn.hidden = false;

      if (within) {
        setCameraActive(true);
        await startCamera();
      } else {
        setCameraActive(false);
      }
    } catch (err) {
      const msg = err.code === 1
        ? 'Location permission denied. Allow GPS to verify you are at your OJT site.'
        : (err.message || 'Could not verify location.');
      if (statusEl) statusEl.textContent = msg;
      setCameraActive(false);
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  async function submitCapture(blob) {
    if (!currentPosition || !inGeofence) return;

    captureBtn.disabled = true;
    captureBtn.textContent = 'Submitting…';

    const formData = new FormData();
    formData.append('photo', blob, 'attendance.jpg');
    formData.append('latitude', String(currentPosition.latitude));
    formData.append('longitude', String(currentPosition.longitude));
    formData.append('accuracy', String(currentPosition.accuracy));

    try {
      const res = await fetch(config.submitUrl, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
        credentials: 'same-origin',
      });
      const data = await parseJsonResponse(res, 'Invalid server response while submitting.');

      if (data.type === 'success') {
        await stopCamera();
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'success',
            title: data.title || config.successTitle,
            text: data.message,
            confirmButtonColor: '#15803d',
          }).then(() => location.reload());
        } else {
          alert(data.message);
          location.reload();
        }
        return;
      }

      captureBtn.disabled = false;
      captureBtn.textContent = config.captureLabel;
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: data.title || 'Failed',
          text: data.message,
          confirmButtonColor: '#15803d',
        });
      } else {
        alert(data.message);
      }

      if (data.message && data.message.includes('within')) {
        await verifyLocation();
      }
    } catch (err) {
      captureBtn.disabled = false;
      captureBtn.textContent = config.captureLabel;
      alert(err.message || 'Could not submit. Try again.');
    }
  }

  if (captureBtn && video && canvas) {
    captureBtn.addEventListener('click', async () => {
      if (!currentPosition || !isWithinClientGeofence(currentPosition)) {
        alert('You must be at your OJT site to capture a photo.');
        setCameraActive(false);
        await verifyLocation();
        return;
      }
      if (!inGeofence) {
        alert('You must be at your OJT site to capture a photo.');
        return;
      }

      const isTimeOut = (config.submitUrl || '').includes('time-out');
      const confirmMsg = isTimeOut
        ? 'Are you sure you want to time out?'
        : 'Are you sure you want to time in?';
      const confirmFn = typeof window.showSubmitConfirm === 'function'
        ? window.showSubmitConfirm
        : (msg) => Promise.resolve(window.confirm(msg));
      const confirmed = await confirmFn(confirmMsg);
      if (!confirmed) return;

      await verifyLocation();
      if (!inGeofence) {
        alert('You moved outside the OJT area. Camera is disabled.');
        return;
      }

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (capturedPreview) {
        capturedPreview.src = canvas.toDataURL('image/jpeg', 0.9);
        capturedPreview.classList.remove('hidden');
        video.classList.add('hidden');
      }

      captureBtn.classList.add('hidden');
      if (retakeBtn) retakeBtn.classList.remove('hidden');

      canvas.toBlob((blob) => {
        if (blob) submitCapture(blob);
      }, 'image/jpeg', 0.9);
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener('click', async () => {
      if (capturedPreview) {
        capturedPreview.classList.add('hidden');
        capturedPreview.src = '';
      }
      if (video) video.classList.remove('hidden');
      captureBtn.classList.remove('hidden');
      retakeBtn.classList.add('hidden');
      captureBtn.disabled = !inGeofence;
      captureBtn.textContent = config.captureLabel;
      if (inGeofence) await startCamera();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', verifyLocation);
  }

  function beginCaptureFlow() {
    if (startBtn) startBtn.classList.add('hidden');
    if (captureFlow) captureFlow.classList.remove('hidden');
    verifyLocation();
  }

  if (startBtn) {
    startBtn.addEventListener('click', beginCaptureFlow);
  } else {
    beginCaptureFlow();
  }

  window.addEventListener('beforeunload', () => {
    stopCamera();
  });
}

if (typeof window !== 'undefined') {
  window.initOjtCamera = initOjtCamera;
}
