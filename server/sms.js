function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function last10Digits(value) {
  const digits = digitsOnly(value);
  return digits.slice(-10);
}

function isValidPhMobile(value) {
  const digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith('09')) return true;
  if (digits.length === 12 && digits.startsWith('639')) return true;
  if (digits.length === 10 && digits.startsWith('9')) return true;
  return false;
}

function toE164(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.startsWith('63') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `+63${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

function toLocalPh(value) {
  const last10 = last10Digits(value);
  if (!last10) return '';
  return `0${last10}`;
}

function maskPhone(value) {
  const local = toLocalPh(value);
  if (local.length < 7) return 'your registered number';
  return `${local.slice(0, 4)} *** **${local.slice(-2)}`;
}

function isSmsDevMode() {
  const flag = (process.env.SMS_DEV_MODE || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function isSmsConfigured() {
  if (isSmsDevMode()) return true;
  const twilioReady = Boolean(
    (process.env.TWILIO_ACCOUNT_SID || '').trim()
    && (process.env.TWILIO_AUTH_TOKEN || '').trim()
    && (process.env.TWILIO_PHONE_NUMBER || '').trim()
  );
  const semaphoreReady = Boolean((process.env.SEMAPHORE_API_KEY || '').trim());
  return twilioReady || semaphoreReady;
}

function getSmsProvider() {
  if ((process.env.SEMAPHORE_API_KEY || '').trim()) return 'semaphore';
  if ((process.env.TWILIO_ACCOUNT_SID || '').trim()) return 'twilio';
  return null;
}

async function sendViaTwilio(to, body) {
  const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = (process.env.TWILIO_PHONE_NUMBER || '').trim();
  const params = new URLSearchParams({ To: toE164(to), From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error_message || 'Twilio could not send the text message.');
    err.code = 'SMS_SEND_FAILED';
    throw err;
  }
  return data;
}

async function sendViaSemaphore(to, body) {
  const apikey = (process.env.SEMAPHORE_API_KEY || '').trim();
  const sendername = (process.env.SEMAPHORE_SENDER_NAME || 'LSSTI').trim();
  const params = new URLSearchParams({
    apikey,
    number: toLocalPh(to),
    message: body,
    sendername,
  });
  const res = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error' || (Array.isArray(data) && data[0]?.status === 'Error')) {
    const message = data.message
      || data[0]?.message
      || 'Semaphore could not send the text message.';
    const err = new Error(message);
    err.code = 'SMS_SEND_FAILED';
    throw err;
  }
  return data;
}

async function sendTextMessage({ to, message }) {
  if (isSmsDevMode()) {
    console.log('[SMS_DEV_MODE] Text to', toLocalPh(to) || to, ':', message);
    return { dev: true };
  }
  if (!isSmsConfigured()) {
    const err = new Error('SMS is not configured. Set Semaphore or Twilio credentials in .env');
    err.code = 'SMS_NOT_CONFIGURED';
    throw err;
  }
  if (!isValidPhMobile(to) && !digitsOnly(to)) {
    const err = new Error('Enter a valid mobile number.');
    err.code = 'SMS_INVALID_NUMBER';
    throw err;
  }

  const provider = getSmsProvider();
  try {
    if (provider === 'semaphore') return await sendViaSemaphore(to, message);
    return await sendViaTwilio(to, message);
  } catch (err) {
    if (err.code) throw err;
    const wrapped = new Error(err.message || 'Could not send the text message.');
    wrapped.code = 'SMS_SEND_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }
}

async function sendPasswordResetSms({ to, name, code }) {
  const minutes = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES || 15);
  const greeting = name ? `Hi ${String(name).split(' ')[0]},` : 'Hi,';
  const message = `${greeting} Your LSSTI Portal password reset code is ${code}. It expires in ${minutes} minutes. Do not share this code.`;
  return sendTextMessage({ to, message });
}

module.exports = {
  digitsOnly,
  last10Digits,
  isValidPhMobile,
  toE164,
  toLocalPh,
  maskPhone,
  isSmsDevMode,
  isSmsConfigured,
  sendTextMessage,
  sendPasswordResetSms,
};
