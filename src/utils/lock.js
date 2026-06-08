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
  const rpId = window.location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Planner Full', id: rpId },
      user: { id: userId, name: 'planner-full', displayName: 'Planner Full' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      // residentKey 'required' = passkey descoberta (essencial p/ Face ID no iOS standalone)
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required', requireResidentKey: true },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('failed');
  return { credentialId: buf2b64(cred.rawId), rpId };
};

export const verifyBiometric = async (cfg) => {
  if (!biometricSupported() || !navigator.credentials.get) {
    return { ok: false, error: 'Sem suporte a biometria neste navegador' };
  }
  const credentialIdB64 = typeof cfg === 'string' ? cfg : cfg?.credentialId;
  const rpId = (cfg && typeof cfg === 'object' && cfg.rpId) ? cfg.rpId : window.location.hostname;

  // 1ª tentativa: passkey DESCOBERTA (sem allowCredentials) — padrão confiável no iOS
  try {
    const assertion = await navigator.credentials.get({
      publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId, userVerification: 'required', timeout: 60000 },
    });
    if (assertion) return { ok: true };
  } catch (e1) {
    // 2ª tentativa: com a credencial específica (caso a descoberta não funcione)
    if (credentialIdB64) {
      try {
        const assertion2 = await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rpId,
            allowCredentials: [{ type: 'public-key', id: b642buf(credentialIdB64), transports: ['internal'] }],
            userVerification: 'required',
            timeout: 60000,
          },
        });
        return { ok: !!assertion2 };
      } catch (e2) {
        return { ok: false, error: `${e2?.name || 'Erro'}: ${e2?.message || 'falha'}` };
      }
    }
    return { ok: false, error: `${e1?.name || 'Erro'}: ${e1?.message || 'falha'}` };
  }
  return { ok: false, error: 'Nenhuma credencial encontrada' };
};
