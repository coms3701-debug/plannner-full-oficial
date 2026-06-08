// Bloqueio do app: PIN (garantia) + biometria opcional (Face ID / Touch ID via WebAuthn).
// O PIN é sempre a saída de emergência — a biometria é só um atalho.

const LOCK_KEY = 'planner_v4_lock';

const buf2b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b642buf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const getLockConfig = () => {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || null; } catch { return null; }
};

export const setLockConfig = (cfg) => {
  try {
    if (cfg) localStorage.setItem(LOCK_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LOCK_KEY);
  } catch (e) { console.warn('Falha ao salvar config de bloqueio:', e); }
};

export const isLockEnabled = () => {
  const c = getLockConfig();
  return !!(c && c.enabled && c.pinHash);
};

export const randomSalt = () => buf2b64(crypto.getRandomValues(new Uint8Array(16)));

export const hashPin = async (pin, salt) => {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return buf2b64(digest);
};

export const verifyPin = async (pin) => {
  const c = getLockConfig();
  if (!c || !c.pinHash) return false;
  try {
    const h = await hashPin(pin, c.salt);
    return h === c.pinHash;
  } catch { return false; }
};

// ── Biometria (WebAuthn, melhor-esforço) ──
export const biometricSupported = () =>
  !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);

export const registerBiometric = async () => {
  if (!biometricSupported()) throw new Error('not-supported');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Planner Full', id: window.location.hostname },
      user: { id: userId, name: 'planner-full', displayName: 'Planner Full' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('failed');
  return buf2b64(cred.rawId);
};

export const verifyBiometric = async (credentialIdB64) => {
  if (!biometricSupported() || !credentialIdB64) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [{ type: 'public-key', id: b642buf(credentialIdB64) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (e) {
    console.warn('Biometria falhou:', e);
    return false;
  }
};
