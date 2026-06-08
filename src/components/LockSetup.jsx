import React, { useState } from 'react';
import { Lock, Fingerprint, X, ShieldCheck } from 'lucide-react';
import {
  getLockConfig, setLockConfig, isLockEnabled, randomSalt, hashPin, verifyPin,
  biometricSupported, registerBiometric,
} from '../utils/lock';
import { hapticFeedback } from '../utils/notifications';

export const LockSetup = ({ onClose }) => {
  const enabled = isLockEnabled();
  const cfg = getLockConfig() || {};

  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [useBio, setUseBio] = useState(false);
  const [pinAtual, setPinAtual] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const soDigitos = (v) => v.replace(/\D/g, '').slice(0, 8);

  const ativar = async () => {
    setMsg('');
    if (pin.length < 4) { setMsg('O PIN precisa ter ao menos 4 dígitos.'); return; }
    if (pin !== pin2) { setMsg('Os PINs não coincidem.'); return; }
    setBusy(true);
    try {
      const salt = randomSalt();
      const pinHash = await hashPin(pin, salt);
      let biometric = false, credentialId = null, rpId = null;
      if (useBio && biometricSupported()) {
        try { const r = await registerBiometric(); credentialId = r.credentialId; rpId = r.rpId; biometric = true; }
        catch { setMsg('Não foi possível ativar a biometria — o PIN foi configurado mesmo assim.'); }
      }
      setLockConfig({ enabled: true, salt, pinHash, biometric, credentialId, rpId });
      hapticFeedback([40, 30, 60]);
      setMsg('✓ Bloqueio ativado.');
      setTimeout(onClose, 700);
    } finally { setBusy(false); }
  };

  const desativar = async () => {
    setMsg('');
    const ok = await verifyPin(pinAtual);
    if (!ok) { setMsg('PIN incorreto.'); hapticFeedback([30, 30, 30]); return; }
    setLockConfig(null);
    hapticFeedback(50);
    setMsg('✓ Bloqueio desativado.');
    setTimeout(onClose, 600);
  };

  const ativarBiometria = async () => {
    setMsg('');
    const ok = await verifyPin(pinAtual);
    if (!ok) { setMsg('Confirme o PIN atual para ativar a biometria.'); return; }
    if (!biometricSupported()) { setMsg('Este aparelho/navegador não suporta biometria.'); return; }
    setBusy(true);
    try {
      const r = await registerBiometric();
      setLockConfig({ ...getLockConfig(), biometric: true, credentialId: r.credentialId, rpId: r.rpId });
      hapticFeedback(50);
      setMsg('✓ Biometria ativada.');
    } catch { setMsg('Não foi possível ativar a biometria.'); }
    finally { setBusy(false); }
  };

  const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none text-center text-lg tracking-[0.4em] font-semibold";

  return (
    <div className="absolute inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 w-full max-w-[360px] border border-slate-300 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Lock className="w-5 h-5 text-blue-500" /> Bloqueio do app</h3>
          <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        {!enabled ? (
          <>
            <p className="text-xs text-slate-500 mb-4">Crie um PIN (mín. 4 dígitos). Ele é a sua chave garantida — você nunca fica trancado fora.</p>
            <div className="space-y-3">
              <input type="password" inputMode="numeric" placeholder="• • • •" value={pin}
                onChange={e => setPin(soDigitos(e.target.value))} className={inputCls} />
              <input type="password" inputMode="numeric" placeholder="Confirmar PIN" value={pin2}
                onChange={e => setPin2(soDigitos(e.target.value))} className={inputCls} />
              {biometricSupported() && (
                <button onClick={() => setUseBio(v => !v)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${useBio ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
                  <Fingerprint className={`w-5 h-5 ${useBio ? 'text-blue-500' : 'text-slate-400'}`} />
                  <span className="text-sm font-medium text-slate-900 dark:text-white flex-1 text-left">Ativar Face ID / Touch ID</span>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${useBio ? 'border-blue-500 bg-blue-500' : 'border-slate-400'}`}>{useBio && <ShieldCheck className="w-3 h-3 text-white" />}</span>
                </button>
              )}
              {msg && <p className="text-xs text-center text-slate-500">{msg}</p>}
              <button onClick={ativar} disabled={busy} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">Ativar bloqueio</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">Bloqueio ativo{cfg.biometric ? ' · biometria ligada' : ''}. Para alterar, confirme o PIN atual.</p>
            <div className="space-y-3">
              <input type="password" inputMode="numeric" placeholder="PIN atual" value={pinAtual}
                onChange={e => setPinAtual(soDigitos(e.target.value))} className={inputCls} />
              {msg && <p className="text-xs text-center text-slate-500">{msg}</p>}
              {!cfg.biometric && biometricSupported() && (
                <button onClick={ativarBiometria} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold disabled:opacity-50">
                  <Fingerprint className="w-5 h-5" /> Ativar biometria
                </button>
              )}
              <button onClick={desativar} className="w-full py-3 rounded-xl bg-rose-600 text-white font-bold">Desativar bloqueio</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
