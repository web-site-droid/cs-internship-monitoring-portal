function buildOjtMapEmbedUrl(lat, lng) {
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return '';
  const coords = `${latN.toFixed(7)},${lngN.toFixed(7)}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(coords)}&ll=${encodeURIComponent(coords)}&z=17&hl=en&output=embed`;
}

function updateOjtLocationMapPreview(lat, lng) {
  const frame = document.getElementById('ojtLocationMapPreview');
  if (!frame) return;
  const url = buildOjtMapEmbedUrl(lat, lng);
  if (!url) {
    frame.removeAttribute('src');
    return;
  }
  if (frame.src !== url) frame.src = url;
}

if (typeof window !== 'undefined') {
  window.buildOjtMapEmbedUrl = buildOjtMapEmbedUrl;
  window.updateOjtLocationMapPreview = updateOjtLocationMapPreview;
}
