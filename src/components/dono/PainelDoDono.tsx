import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Building2, Loader2, LogOut, PlayCircle, RefreshCw } from 'lucide-react';
import {
  listarClinicasDoDono,
  mensagemDoDono,
  mudarPlanoDaClinica,
  mudarSituacaoDaClinica,
  type ClinicaParaODono,
  type TotaisDoDono,
} from '../../services/donoApi';
import { LIMITES_DO_GRATUITO } from '../../utils/planos';
import { MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { ConfirmDialog, type ConfirmRequest } from '../ConfirmDialog';

/**
 * O painel do dono da plataforma: todas as clínicas, com plano, uso, logins, último acesso e espaço
 * das fotos, e as ações de mudar o plano, dar cortesia, suspender e reativar. Tudo pelo servidor
 * (`/api/dono`); nenhum dado de paciente — só números e a conta da clínica.
 */

type OpcaoDePlano = 'gratuito' | 'completo' | 'cortesia';

const opcaoDe = (c: ClinicaParaODono): OpcaoDePlano => (c.cortesia ? 'cortesia' : c.plano);

const ROTULO_DO_PLANO: Record<OpcaoDePlano, string> = {
  gratuito: 'Gratuito',
  completo: 'Completo (pago)',
  cortesia: 'Completo — cortesia',
};

const megabytes = (bytes: number | null): string =>
  bytes === null
    ? '—'
    : bytes === 0
      ? '0 KB'
      : bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** "hoje", "ontem", "há 5 dias" ou a data. */
function quando(iso: string | null): string {
  if (!iso) return 'nunca';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const Numero: React.FC<{ rotulo: string; valor: React.ReactNode; destaque?: boolean }> = ({ rotulo, valor, destaque }) => (
  <div className={`rounded-2xl p-3.5 border ${destaque ? 'bg-brand/5 border-brand/30' : 'bg-white border-[rgba(26,26,26,.06)]'}`}>
    <p className="text-[11.5px] text-muted font-medium">{rotulo}</p>
    <p className="text-[22px] font-semibold text-ink leading-tight mt-0.5">{valor}</p>
  </div>
);

/**
 * Uso contra o limite (no gratuito): vermelho quando passou, âmbar quando cheio — menos o login do
 * gratuito, que é sempre 1 de 1 (o da admin).
 */
const Uso: React.FC<{ rotulo: string; valor: number; limite: number | null; alarme?: boolean }> = ({
  rotulo,
  valor,
  limite,
  alarme = true,
}) => {
  const acima = alarme && limite !== null && valor > limite;
  const cheio = alarme && limite !== null && valor >= limite;
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted">{rotulo} </span>
      <span className={`font-semibold ${acima ? 'text-red-700' : cheio ? 'text-amber-700' : 'text-ink'}`}>
        {valor}
        {limite !== null && <span className="font-normal text-muted">/{limite}</span>}
      </span>
    </span>
  );
};

const CartaoDaClinica: React.FC<{
  clinica: ClinicaParaODono;
  ocupado: boolean;
  onPlano: (c: ClinicaParaODono, opcao: OpcaoDePlano) => void;
  onSituacao: (c: ClinicaParaODono) => void;
}> = ({ clinica: c, ocupado, onPlano, onSituacao }) => {
  const gratuito = c.plano === 'gratuito';
  const suspensa = c.situacao === 'suspensa';
  return (
    <li
      data-clinica={c.id}
      className={`rounded-3xl bg-white p-4 sm:p-5 shadow-[0_3px_14px_rgba(0,0,0,.04)] border ${suspensa ? 'border-red-200' : 'border-transparent'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-ink truncate">{c.nome}</p>
          <p className="text-[12px] text-muted">
            {c.id} · {c.dona || 'sem dona'} · criada {quando(c.criadaEm)}
            {c.criadaPor === 'cadastro' ? ' pelo cadastro' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suspensa && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">Suspensa</span>}
          {!c.aceiteEmDia && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Termos pendentes</span>
          )}
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              gratuito ? 'bg-surface-2 text-ink' : c.cortesia ? 'bg-brand/15 text-brand-deep' : 'bg-brand text-white'
            }`}
          >
            {ROTULO_DO_PLANO[opcaoDe(c)]}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <Uso rotulo="Clientes" valor={c.uso.clientes} limite={gratuito ? LIMITES_DO_GRATUITO.clientes : null} />
        <Uso rotulo="Procedimentos" valor={c.uso.procedimentos} limite={gratuito ? LIMITES_DO_GRATUITO.procedimentos : null} />
        <Uso rotulo="Logins" valor={c.logins} limite={gratuito ? LIMITES_DO_GRATUITO.logins : null} alarme={c.logins > LIMITES_DO_GRATUITO.logins} />
        <span className="whitespace-nowrap">
          <span className="text-muted">Fotos </span>
          <span className="font-semibold text-ink">{megabytes(c.espacoBytes)}</span>
        </span>
        <span className="whitespace-nowrap">
          <span className="text-muted">Último acesso </span>
          <span className="font-semibold text-ink">{quando(c.ultimoAcesso)}</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <label className="flex-1 flex items-center gap-2 text-[13px] text-ink-soft">
          <span className="shrink-0">Plano</span>
          <select
            value={opcaoDe(c)}
            disabled={ocupado}
            onChange={(e) => onPlano(c, e.target.value as OpcaoDePlano)}
            aria-label={`Plano de ${c.nome}`}
            className="flex-1 h-[42px] px-3 rounded-xl border border-[rgba(26,26,26,.12)] bg-white text-ink text-[13.5px] font-medium focus:outline-hidden focus:border-brand"
          >
            {(Object.keys(ROTULO_DO_PLANO) as OpcaoDePlano[]).map((o) => (
              <option key={o} value={o}>
                {ROTULO_DO_PLANO[o]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onSituacao(c)}
          className={`h-[42px] px-4 rounded-xl text-[13.5px] font-semibold flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-60 ${
            suspensa ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-50' : 'border-red-200 text-red-700 hover:bg-red-50'
          }`}
        >
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : suspensa ? <PlayCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
          {suspensa ? 'Reativar' : 'Suspender'}
        </button>
      </div>
    </li>
  );
};

export const PainelDoDono: React.FC<{ email: string | null; onSair: () => void }> = ({ email, onSair }) => {
  const [dados, setDados] = useState<{ clinicas: ClinicaParaODono[]; totais: TotaisDoDono } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await listarClinicasDoDono());
    } catch (e) {
      setErro(mensagemDoDono(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (clinica: ClinicaParaODono, acao: () => Promise<unknown>, feito: string) => {
    setOcupada(clinica.id);
    setErro(null);
    setAviso(null);
    try {
      await acao();
      setAviso(feito);
      await carregar();
    } catch (e) {
      setErro(mensagemDoDono(e));
    } finally {
      setOcupada(null);
    }
  };

  const pedirPlano = (c: ClinicaParaODono, opcao: OpcaoDePlano) => {
    if (opcao === opcaoDe(c)) return;
    const acimaDoGratuito =
      opcao === 'gratuito' &&
      (c.uso.clientes > LIMITES_DO_GRATUITO.clientes || c.uso.procedimentos > LIMITES_DO_GRATUITO.procedimentos || c.logins > LIMITES_DO_GRATUITO.logins);
    setConfirmacao({
      titulo: `Mudar ${c.nome} para ${ROTULO_DO_PLANO[opcao]}?`,
      mensagem:
        opcao === 'gratuito'
          ? `No gratuito: até ${LIMITES_DO_GRATUITO.clientes} clientes, ${LIMITES_DO_GRATUITO.procedimentos} procedimentos e ${LIMITES_DO_GRATUITO.logins} login.` +
            (acimaDoGratuito
              ? ' Esta clínica está acima disso: nada é apagado, mas ela não cria mais clientes, procedimentos nem logins até voltar ao completo.'
              : '')
          : opcao === 'cortesia'
            ? 'Plano completo sem cobrança, até você mudar.'
            : 'Plano completo pago. Use depois de confirmar o pagamento.',
      textoConfirmar: 'Mudar o plano',
      tom: opcao === 'gratuito' ? 'perigo' : 'neutro',
      onConfirmar: () =>
        void executar(
          c,
          () => mudarPlanoDaClinica(c.id, opcao === 'gratuito' ? 'gratuito' : 'completo', opcao === 'cortesia'),
          `${c.nome}: plano ${ROTULO_DO_PLANO[opcao]}.`
        ),
    });
  };

  const pedirSituacao = (c: ClinicaParaODono) => {
    const suspender = c.situacao !== 'suspensa';
    setConfirmacao({
      titulo: suspender ? `Suspender ${c.nome}?` : `Reativar ${c.nome}?`,
      mensagem: suspender
        ? 'Os logins da equipe deixam de entrar na hora (quem estiver no painel é desconectado). Nada é apagado; reativar devolve o acesso.'
        : 'Os logins que a suspensão desligou voltam a entrar.',
      textoConfirmar: suspender ? 'Suspender' : 'Reativar',
      tom: suspender ? 'perigo' : 'neutro',
      onConfirmar: () =>
        void executar(c, () => mudarSituacaoDaClinica(c.id, suspender ? 'suspensa' : 'ativa'), suspender ? `${c.nome} suspensa.` : `${c.nome} reativada.`),
    });
  };

  const t = dados?.totais;
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-muted">{MARCA_DA_PLATAFORMA} · painel do dono</p>
            <h1 className="font-serif-luxury text-[32px] sm:text-[40px] font-semibold leading-tight text-ink">Clínicas</h1>
            {email && <p className="text-[12px] text-muted mt-0.5">{email}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void carregar()}
              disabled={carregando}
              className="h-[42px] px-4 rounded-xl border border-[rgba(26,26,26,.12)] bg-white text-ink text-[13.5px] font-semibold flex items-center gap-1.5 hover:bg-surface-2 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={onSair}
              className="h-[42px] px-4 rounded-xl border border-[rgba(26,26,26,.12)] bg-white text-ink text-[13.5px] font-semibold flex items-center gap-1.5 hover:bg-surface-2"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </header>

        {erro && (
          <p role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {erro}
          </p>
        )}
        {aviso && (
          <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px]">
            {aviso}
          </p>
        )}

        {t && (
          <section aria-label="Totais" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
            <Numero rotulo="Clínicas" valor={t.clinicas} destaque />
            <Numero rotulo="Completo (pagas)" valor={t.completo} />
            <Numero rotulo="Cortesia" valor={t.cortesia} />
            <Numero rotulo="Gratuito" valor={t.gratuito} />
            <Numero rotulo="Suspensas" valor={t.suspensas} />
            <Numero rotulo="Clientes" valor={t.clientes} />
            <Numero rotulo="Procedimentos" valor={t.procedimentos} />
            <Numero rotulo="Logins" valor={t.logins} />
            <Numero rotulo="Fotos e arquivos" valor={megabytes(t.espacoBytes)} />
          </section>
        )}

        {carregando && !dados ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-7 h-7 text-brand animate-spin" />
          </div>
        ) : dados && dados.clinicas.length === 0 ? (
          <p className="text-[14px] text-muted flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Nenhuma clínica ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {dados?.clinicas.map((c) => (
              <CartaoDaClinica key={c.id} clinica={c} ocupado={ocupada === c.id} onPlano={pedirPlano} onSituacao={pedirSituacao} />
            ))}
          </ul>
        )}

        <p className="text-[11.5px] text-muted leading-relaxed">
          Este painel mostra só a conta de cada clínica e números de uso — nenhum dado de paciente. O plano pago é
          liberado aqui depois de confirmar o pagamento, até a cobrança pela InfinitePay entrar.
        </p>
      </div>
      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
