import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { AlertTriangle, CalendarCheck, Loader2, LogOut, ShieldCheck } from 'lucide-react';

/**
 * "Conectar o Claude à agenda?" — a tela entre o login do painel e o Claude.
 *
 * O Claude, ao adicionar o conector (`/api/mcp`), manda a pessoa para
 * `<site>/?autorizar-claude=<pedido>` (ver `server/conectorClaudeLogin.ts`). O App mostra o login
 * de sempre e, com o painel liberado, esta tela no lugar do painel. Permitir manda o pedido e o
 * login para o servidor, que devolve o endereço de volta ao Claude com o código; recusar volta
 * ao Claude sem nada.
 *
 * O que é mostrado vem do servidor, que leu o pedido: quem pede (a identidade verificada do
 * Claude, ou o nome que um app registrado sozinho escolheu) e para onde volta. Um pedido que não
 * volta para o Claude ganha um aviso — é o caminho de quem tentasse obter acesso mandando um link
 * de conexão para alguém da clínica. Pelo mesmo motivo, Permitir exige ter entrado com a senha há
 * pouco: sessão antiga pede para entrar de novo (o servidor confere de novo no `/decidir`).
 */

interface Pedido {
  aplicativo: string;
  destino: string;
  verificado: boolean;
}

type Estado =
  | { fase: 'carregando' }
  | ({ fase: 'pergunta' } & Pedido)
  | ({ fase: 'enviando' } & Pedido)
  | { fase: 'entrar-de-novo' }
  | { fase: 'erro'; mensagem: string };

const DESTINOS_DO_CLAUDE = /(^|\.)claude\.(ai|com)$/i;

const mensagemDoErro = (status: number): string => {
  if (status === 410 || status === 404) {
    return 'Este pedido de conexão venceu (ele vale 10 minutos) ou já foi usado. Volte ao Claude e conecte de novo.';
  }
  if (status === 403) return 'Este login não está na equipe de uma clínica, e por isso não pode conectar o Claude.';
  if (status === 401) return 'Seu login expirou. Saia e entre de novo.';
  return 'Não foi possível falar com o servidor agora. Tente de novo em instantes.';
};

export const AutorizarClaudeView: React.FC<{
  pedido: string;
  user: User;
  nomeDaClinica: string;
  onSair: () => void;
  /** Quando já se sabe que este login não pode conectar (o dono da plataforma, por exemplo). */
  erroInicial?: string;
}> = ({ pedido, user, nomeDaClinica, onSair, erroInicial }) => {
  const [estado, setEstado] = useState<Estado>(
    erroInicial ? { fase: 'erro', mensagem: erroInicial } : { fase: 'carregando' }
  );

  const chamar = async (caminho: string, corpo?: unknown): Promise<Response> => {
    const token = await user.getIdToken();
    return fetch(caminho, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  };

  useEffect(() => {
    if (erroInicial) return;
    let cancelado = false;
    (async () => {
      try {
        const resposta = await chamar(`/api/claude/oauth/pedido/${encodeURIComponent(pedido)}`);
        if (cancelado) return;
        if (!resposta.ok) {
          setEstado({ fase: 'erro', mensagem: mensagemDoErro(resposta.status) });
          return;
        }
        const dados = await resposta.json();
        if (dados.entrarDeNovo) {
          setEstado({ fase: 'entrar-de-novo' });
          return;
        }
        setEstado({
          fase: 'pergunta',
          aplicativo: String(dados.aplicativo || ''),
          destino: String(dados.destino || ''),
          verificado: dados.verificado === true,
        });
      } catch {
        if (!cancelado) setEstado({ fase: 'erro', mensagem: mensagemDoErro(0) });
      }
    })();
    return () => {
      cancelado = true;
    };
    // O pedido e o login não mudam enquanto esta tela existe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, user.uid]);

  const decidir = async (permitir: boolean) => {
    if (estado.fase !== 'pergunta') return;
    setEstado({ ...estado, fase: 'enviando' });
    try {
      const resposta = await chamar('/api/claude/oauth/decidir', { pedido, permitir });
      if (resposta.status === 401 && (await resposta.clone().json().catch(() => ({})))?.erro === 'login-recente') {
        setEstado({ fase: 'entrar-de-novo' });
        return;
      }
      if (!resposta.ok) {
        setEstado({ fase: 'erro', mensagem: mensagemDoErro(resposta.status) });
        return;
      }
      const { redirecionar } = await resposta.json();
      if (typeof redirecionar !== 'string' || !/^https?:\/\//i.test(redirecionar)) {
        setEstado({ fase: 'erro', mensagem: mensagemDoErro(0) });
        return;
      }
      window.location.assign(redirecionar);
    } catch {
      setEstado({ fase: 'erro', mensagem: mensagemDoErro(0) });
    }
  };

  const voltarAoPainel = () => window.location.assign(window.location.pathname);

  if (estado.fase === 'carregando') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  const cartao = 'w-full max-w-sm bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 space-y-4';
  const icone =
    'w-12 h-12 rounded-full bg-surface border border-[rgba(26,26,26,.1)] flex items-center justify-center mx-auto';
  const botaoPrincipal =
    'w-full h-[50px] rounded-xl bg-brand text-white text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover active:scale-97 transition-all disabled:opacity-60';
  const botaoSecundario =
    'w-full h-[46px] rounded-xl border border-[rgba(26,26,26,.12)] text-ink text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-surface transition-all disabled:opacity-60';

  if (estado.fase === 'entrar-de-novo') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className={`${cartao} text-center`}>
          <div className={icone}>
            <ShieldCheck className="w-6 h-6 text-brand" />
          </div>
          <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Entre de novo para conectar</h1>
          <p className="text-[13px] text-muted leading-relaxed">
            Por segurança, conectar o Claude à agenda pede que você tenha digitado a senha há pouco. Entre de novo e a
            conexão continua daqui.
          </p>
          <button type="button" onClick={onSair} className={botaoPrincipal}>
            <LogOut className="w-4 h-4" />
            Entrar de novo
          </button>
        </div>
      </div>
    );
  }

  if (estado.fase === 'erro') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className={`${cartao} text-center`}>
          <div className={icone}>
            <AlertTriangle className="w-6 h-6 text-brand" />
          </div>
          <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Não foi possível conectar o Claude</h1>
          <p className="text-[13px] text-muted leading-relaxed">{estado.mensagem}</p>
          <button type="button" onClick={voltarAoPainel} className={botaoPrincipal}>
            Ir para o painel
          </button>
          <button type="button" onClick={onSair} className={botaoSecundario}>
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    );
  }

  const enviando = estado.fase === 'enviando';
  const doClaude = DESTINOS_DO_CLAUDE.test(estado.destino);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
      <div className={cartao}>
        <div className={icone}>
          <CalendarCheck className="w-6 h-6 text-brand" />
        </div>
        <div className="space-y-2 text-center">
          <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Conectar o Claude à agenda?</h1>
          <p className="text-[13px] text-muted leading-relaxed">
            {estado.verificado ? (
              <>
                <strong className="text-ink">{estado.aplicativo}</strong> (identidade verificada de {estado.destino})
              </>
            ) : (
              <>
                Um aplicativo registrado automaticamente como <strong className="text-ink">“{estado.aplicativo}”</strong>
              </>
            )}{' '}
            quer acessar a agenda da{' '}
            <strong className="text-ink">{nomeDaClinica}</strong> com o seu login
            {user.email ? (
              <>
                {' '}(<strong className="text-ink">{user.email}</strong>)
              </>
            ) : null}
            .
          </p>
        </div>

        <ul className="text-[13px] text-ink leading-relaxed space-y-1.5 bg-surface rounded-2xl px-4 py-3">
          <li>• Ver a agenda e os horários livres</li>
          <li>• Buscar e cadastrar pacientes</li>
          <li>• Criar agendamentos e gerar o link de confirmação</li>
        </ul>
        <p className="text-[12px] text-muted leading-relaxed">
          O Claude não apaga nem altera agendamentos. A conexão vale até 90 dias. Para desconectar, remova o conector
          no Claude; trocar a senha deste login ou desativá-lo na Equipe também corta o acesso.
        </p>
        <p className="text-[12px] text-ink font-medium leading-relaxed">
          Só permita se foi você quem acabou de tocar em “Conectar” no Claude.
        </p>

        {!doClaude && (
          <div className="flex gap-2 items-start text-[12px] leading-relaxed text-[#7F1D1D] bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
            <span>
              Este pedido volta para <strong>{estado.destino}</strong>, que não é o site do Claude. Só permita se foi você
              quem começou esta conexão.
            </span>
          </div>
        )}

        <button type="button" disabled={enviando} onClick={() => decidir(true)} className={botaoPrincipal}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Permitir
        </button>
        <button type="button" disabled={enviando} onClick={() => decidir(false)} className={botaoSecundario}>
          Cancelar
        </button>
        <p className="text-[11px] text-muted text-center">Depois de decidir, você volta para {estado.destino}.</p>
      </div>
    </div>
  );
};
