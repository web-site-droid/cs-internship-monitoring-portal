document.addEventListener('DOMContentLoaded', () => {
  if (typeof initOjtCamera !== 'function' || !document.getElementById('ojtCaptureBtn')) return;
  initOjtCamera({
    panelId: 'ojtTimeInPanel',
    startBtnId: 'ojtTimeInStartBtn',
    captureFlowId: 'ojtTimeInCaptureFlow',
    statusId: 'ojtTimeInStatus',
    refreshBtnId: 'ojtRefreshLocationBtn',
    cameraSectionId: 'ojtCameraSection',
    videoId: 'ojtCameraPreview',
    canvasId: 'ojtCameraCanvas',
    capturedPreviewId: 'ojtCapturedPreview',
    captureBtnId: 'ojtCaptureBtn',
    retakeBtnId: 'ojtRetakeBtn',
    verifyUrl: '/student/time-in/verify',
    submitUrl: '/student/time-in',
    captureLabel: 'Capture & Time In',
    successTitle: 'Timed In',
    lockMessage: 'Camera locked — move to your OJT site to activate',
  });
});
