import React from 'react';
import { Loader2, ShieldAlert, WifiOff, LogOut, RefreshCw } from 'lucide-react';
import type { AcessoAoPainel } from '../../services/databaseService';

/**
 * O que aparece entre o login e o painel: conferindo, sem acesso ou sem como conferir.
 *
 * O painel só abre para quem está na lista de profissionais (ver `conferirAcessoAoPainel`). Uma
 * conta criada por fora — o cadastro de contas do Firebase é aberto — para aqui, sem ver nada.
 */
export const AcessoAoPainelView: React.FC<{
  acesso: Exclude<AcessoAoPainel, 'liberado'>;
  email: string | null;
  onTentarDeNovo: () => void;
  onSair: () => void;
}> = ({ acesso, email, onTentarDeNovo, onSair }) => {
  if (acesso === 'verificando') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  const negado = acesso === 'negado';
  const Icone = negado ? ShieldAlert : WifiOff;

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-surface border border-[rgba(26,26,26,.1)] flex items-center justify-center mx-auto">
          <Icone className="w-6 h-6 text-brand" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">
            {negado ? 'Login sem acesso ao painel' : 'Não foi possível conferir seu acesso'}
          </h1>
          <p className="text-[13px] text-muted leading-relaxed">
            {negado ? (
              <>
                {email ? <strong className="text-ink">{email}</strong> : 'Este login'} não está na equipe da
                clínica. Peça à administradora para criar o seu acesso em Configurações → Equipe.
              </>
            ) : (
              'Verifique sua conexão com a internet e tente de novo.'
            )}
          </p>
        </div>
        {!negado && (
          <button
            type="button"
            onClick={onTentarDeNovo}
            className="w-full h-[50px] rounded-xl bg-brand text-white text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover active:scale-97 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar de novo
          </button>
        )}
        <button
          type="button"
          onClick={onSair}
          className="w-full h-[46px] rounded-xl border border-[rgba(26,26,26,.12)] text-ink text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-surface transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );
};
