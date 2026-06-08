import React, { useState, useEffect, useRef } from 'react';
import { Lock, Fingerprint, Delete } from 'lucide-react';
import { verifyPin, verifyBiometric, getLockConfig } from '../utils/lock';
import { hapticFeedback } from '../utils/notifications';

export const LockScreen = ({ onUnlock }) => {
  const cfg = getLockConfig() || {};
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [tentandoBio, setTentandoBio] = useState(false);
  const biometriaIniciada = useRef(false);

  const tentarBiometria = async (manual = false) => {
    if (!cfg.biometric || !cfg.credentialId) return;
    setTentandoBio(true);
    setErro('');
    const res = await verifyBiometric(cfg);
    setTentandoBio(false);
    if (res.ok) { hapticFeedback(50); onUnlock(); return; }
    // Na tentativa automática (sem gesto), iOS bloqueia: não assusta o usuário, só pede o toque.
    if (manual) setErro(res.error || 'Biometria não reconhecida. Use o PIN.');
    else setErro('Toque no ícone 👆 para usar o Face ID, ou digite o PIN.');
  };

  // Tenta biometria automaticamente ao abrir (uma vez)
  useEffect(() => {
    if (cfg.biometric && cfg.credentialId && !biometriaIniciada.current) {
      biometriaIniciada.current = true;
      tentarBiometria(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const digitar = async (d) => {
    setErro('');
    const novo = (pin + d).slice(0, 8);
    setPin(novo);
    hapticFeedback(10);
    if (novo.length >= 4) {
      const ok = await verifyPin(novo);
      if (ok) { hapticFeedback(50); onUnlock(); }
      else if (novo.length >= 8) { setErro('PIN incorreto.'); setPin(''); hapticFeedback([30, 30, 30]); }
    }
  };

  const apagar = () => { setPin(p => p.slice(0, -1)); setErro(''); };

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="min-h-[100dvh] bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(59,130,246,0.4)] mb-5">
        <Lock className="w-7 h-7 text-white" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Planner Full</h1>
      <p className="text-sm text-slate-500 mb-6">Digite seu PIN para desbloquear</p>

      {/* Indicadores do PIN */}
      <div className="flex gap-3 mb-2">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full transition-all ${i < pin.length ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
        ))}
      </div>
      <div className="min-h-[2.5rem] mb-2 px-6 max-w-[320px] text-center">
        {erro && <p className="text-xs text-rose-500 break-words">{erro}</p>}
        {tentandoBio && <p className="text-xs text-slate-500">Aguardando biometria…</p>}
      </div>

      {/* Teclado */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {teclas.map(t => (
          <button key={t} onClick={() => digitar(t)}
            className="aspect-square rounded-full bg-slate-100 dark:bg-slate-800 text-2xl font-semibold text-slate-900 dark:text-white active:scale-90 active:bg-slate-200 dark:active:bg-slate-700 transition-all">
            {t}
          </button>
        ))}
        {cfg.biometric && cfg.credentialId ? (
          <button onClick={() => tentarBiometria(true)} className="aspect-square rounded-full flex items-center justify-center text-blue-500 active:scale-90 transition-all">
            <Fingerprint className="w-8 h-8" />
          </button>
        ) : <div />}
        <button onClick={() => digitar('0')}
          className="aspect-square rounded-full bg-slate-100 dark:bg-slate-800 text-2xl font-semibold text-slate-900 dark:text-white active:scale-90 transition-all">
          0
        </button>
        <button onClick={apagar} className="aspect-square rounded-full flex items-center justify-center text-slate-500 active:scale-90 transition-all">
          <Delete className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
};
