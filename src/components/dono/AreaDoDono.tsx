import React, { useEffect, useState } from 'react';
import type { TotpSecret, User } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import {
  cadastrarAutenticador,
  entrouComSegundoFator,
  gerarSegredoDoAutenticador,
  mensagemDoSegundoFator,
  temSegundoFator,
} from '../../services/authService';
import { usaEmuladores } from '../../lib/projetoFirebase';
import { MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { PainelDoDono } from './PainelDoDono';

/**
 * O login do dono da plataforma (claim `donoDaPlataforma`, sem clínica).
 *
 * A verificação em duas etapas é obrigatória (docs/zulia-plataforma.md, "Painel do dono"):
 *   - sem aplicativo autenticador cadastrado: a tela de cadastrar (QR + código);
 *   - cadastrado, mas a sessão entrou só com a senha (antes do cadastro): pede para entrar de novo;
 *   - entrou com o código: o painel.
 * O servidor confere o mesmo (`server/dono.ts`). Nos emuladores não há autenticador, e as duas
 * pontas pulam essa exigência.
 */

type Estado = 'conferindo' | 'cadastrar' | 'entrar-de-novo' | 'liberado';

const Cartao: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
    <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 space-y-4">{children}</div>
  </div>
);

const botao =
  'w-full h-[50px] rounded-xl bg-brand text-white text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover transition-all disabled:opacity-60';
const botaoSecundario =
  'w-full h-[46px] rounded-xl border border-[rgba(26,26,26,.12)] text-ink text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-surface transition-all';

/** O segredo em grupos de 4, para digitar à mão no aplicativo. */
const emGrupos = (segredo: string) => segredo.replace(/(.{4})/g, '$1 ').trim();

const CadastroDoAutenticador: React.FC<{ user: User; onSair: () => void }> = ({ user, onSair }) => {
  const [segredo, setSegredo] = useState<TotpSecret | null>(null);
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const comecar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      setSegredo(await gerarSegredoDoAutenticador(user));
    } catch (e) {
      setErro(mensagemDoSegundoFator(e));
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segredo) return;
    setErro(null);
    setOcupado(true);
    try {
      await cadastrarAutenticador(user, segredo, codigo);
      setPronto(true);
    } catch (falha) {
      setErro(mensagemDoSegundoFator(falha));
    } finally {
      setOcupado(false);
    }
  };

  if (pronto) {
    return (
      <Cartao>
        <div className="text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Autenticador cadastrado</h1>
          <p className="text-[13px] text-muted leading-relaxed">
            A partir de agora, o seu login pede a senha e o código do aplicativo. Entre de novo para abrir o painel.
          </p>
        </div>
        <button type="button" onClick={onSair} className={botao}>
          Entrar de novo
        </button>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-surface border border-[rgba(26,26,26,.1)] flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6 text-brand" />
        </div>
        <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Verificação em duas etapas</h1>
        <p className="text-[13px] text-muted leading-relaxed">
          O painel do dono da {MARCA_DA_PLATAFORMA} vê todas as clínicas: ele só abre com a senha <strong>e</strong> um
          código do aplicativo autenticador do seu celular (Google Authenticator, Microsoft Authenticator ou outro).
        </p>
      </div>

      {!segredo ? (
        <button type="button" onClick={comecar} disabled={ocupado} className={botao}>
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Cadastrar o aplicativo autenticador
        </button>
      ) : (
        <form onSubmit={confirmar} className="space-y-4">
          <ol className="text-[13px] text-ink-soft space-y-1.5 list-decimal pl-5">
            <li>No aplicativo, toque em adicionar e leia o código QR abaixo.</li>
            <li>Digite aqui o código de 6 dígitos que aparecer.</li>
          </ol>
          <div className="flex justify-center p-3 bg-white rounded-2xl border border-[rgba(26,26,26,.08)]">
            <QRCodeSVG value={segredo.generateQrCodeUrl(user.email || 'dono', MARCA_DA_PLATAFORMA)} size={184} />
          </div>
          <p className="text-[12px] text-muted text-center">
            Sem como ler o QR? Digite esta chave no aplicativo:
            <br />
            <code data-testid="chave-do-autenticador" className="text-[13px] text-ink font-semibold tracking-wider break-all">
              {emGrupos(segredo.secretKey)}
            </code>
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Código de 6 dígitos"
            aria-label="Código do aplicativo autenticador"
            required
            className="w-full h-[50px] px-4 text-[18px] tracking-[0.3em] text-center rounded-xl border border-[rgba(26,26,26,.12)] focus:outline-hidden focus:border-brand placeholder:tracking-normal placeholder:text-[14px]"
          />
          <button type="submit" disabled={ocupado || codigo.length !== 6} className={botao}>
            {ocupado && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar e ativar
          </button>
        </form>
      )}
      {erro && (
        <p role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
          {erro}
        </p>
      )}
      <button type="button" onClick={onSair} className={botaoSecundario}>
        <LogOut className="w-4 h-4" />
        Sair
      </button>
    </Cartao>
  );
};

export const AreaDoDono: React.FC<{ user: User; onSair: () => void }> = ({ user, onSair }) => {
  const [estado, setEstado] = useState<Estado>('conferindo');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      let proximo: Estado;
      if (usaEmuladores) proximo = 'liberado';
      else if (!temSegundoFator(user)) proximo = 'cadastrar';
      else proximo = (await entrouComSegundoFator(user).catch(() => false)) ? 'liberado' : 'entrar-de-novo';
      if (!cancelado) setEstado(proximo);
    })();
    return () => {
      cancelado = true;
    };
  }, [user]);

  if (estado === 'conferindo') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }
  if (estado === 'cadastrar') return <CadastroDoAutenticador user={user} onSair={onSair} />;
  if (estado === 'entrar-de-novo') {
    return (
      <Cartao>
        <div className="text-center space-y-2">
          <ShieldCheck className="w-10 h-10 text-brand mx-auto" />
          <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Entre com o código</h1>
          <p className="text-[13px] text-muted leading-relaxed">
            Esta sessão começou antes do autenticador ser cadastrado. Saia e entre de novo com a senha e o código.
          </p>
        </div>
        <button type="button" onClick={onSair} className={botao}>
          Entrar de novo
        </button>
      </Cartao>
    );
  }
  return <PainelDoDono email={user.email} onSair={onSair} />;
};
