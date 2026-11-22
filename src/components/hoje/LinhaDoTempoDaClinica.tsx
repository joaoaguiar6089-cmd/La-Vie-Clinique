import React, { useEffect, useMemo, useState } from 'react';
import { History, Search, X } from 'lucide-react';
import {
  AnamnesisRecord,
  AnamnesisTemplate,
  Attendance,
  ClinicProfile,
  EvaluationRecord,
  Patient,
  Procedure,
  Quote,
} from '../../types';
import { hojeISO } from '../../utils/attendances';
import {
  FiltroDeTipo,
  MAIOR_PERIODO_DA_LINHA,
  PERIODOS_DA_LINHA,
  TIPOS_DA_LINHA,
  agruparPorDia,
  contarPorTipo,
  corteDaLinha,
  linhaDaClinica,
  passaNoFiltroDeTipo,
} from '../../utils/linhaDoTempoClinica';
import { ItemDaLinha } from '../../utils/pacienteResumo';
import { alvoDoAtendimento } from '../../utils/fichasClinicas';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { montarMapasPublicos } from '../../utils/laserAreas';
import {
  saveAnamnesisRecord,
  subscribeToAnamnesisRecordsDesde,
} from '../../services/databaseService';
import { useAcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { CartaoDaLinhaDoTempo } from '../linhaDoTempo/ItemDaLinhaDoTempo';
import { AcoesDaLinha, AlvoDoPasso, PainelDoEvento } from '../linhaDoTempo/PainelDoEvento';
import { ContextoDaJornada, OrigemDaVisita } from '../../utils/passosDaJornada';
import { PrintableAnamnesisSheet } from '../anamnesis/PrintableAnamnesisSheet';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { SkeletonLinhas } from '../common/Skeleton';
import { gravarLocal, lerLocal } from '../../lib/estadoDaClinica';

interface LinhaDoTempoDaClinicaProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  atendimentos: Attendance[];
  pacientes: Patient[];
  quotes: Quote[];
  /** Fichas-modelo de anamnese — a ficha aberta resolve por elas a imagem orientativa e o termo. */
  templatesAnamnese: AnamnesisTemplate[];
  carregando?: boolean;
  /** Profissional logada — já vem escolhida na avaliação nova. */
  professionalLogadaId?: string;
  onAbrirPaciente: (pacienteId: string) => void;
  /**
   * Os passos que saem da tela Hoje: o agendamento, a visita para o acompanhamento e a anamnese
   * nova abrem na Agenda e em Fichas, onde moram os formulários com tudo o que eles precisam.
   */
  onAgendar: (alvo: AlvoDoPasso & { professionalId?: string }) => void;
  onRegistrarVisita: (origem: OrigemDaVisita) => void;
  onAbrirNaAgenda: (a: Attendance) => void;
  onNovaAnamnese: (alvo: AlvoDoPasso & { templateId?: string }) => void;
}

/** A última escolha de período fica no aparelho — é preferência de quem usa, não da clínica. */
const CHAVE_DO_PERIODO = 'lavie:hoje-linha-periodo';
const PERIODO_PADRAO = 7;
/** Quantos itens entram de cada vez. Trinta dias de uma clínica cheia passam de centenas. */
const PAGINA = 40;

const periodoInicial = (): number => {
  try {
    const guardado = Number(lerLocal(CHAVE_DO_PERIODO));
    if (PERIODOS_DA_LINHA.some((p) => p.dias === guardado)) return guardado;
  } catch {
    // Armazenamento bloqueado: fica o padrão.
  }
  return PERIODO_PADRAO;
};

/**
 * O dia de um grupo da linha: o número grande, "Hoje", "Ontem" ou o dia da semana, e o mês com
 * quantos registros. No computador fica numa coluna à esquerda e acompanha a rolagem.
 */
const CabecalhoDoDia: React.FC<{ data: string; rotulo: string; total: number }> = ({ data, rotulo, total }) => {
  const d = new Date(`${data}T12:00:00`);
  const relativo = rotulo === 'Hoje' || rotulo === 'Ontem';
  const nome = relativo ? rotulo : d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  return (
    <h3 className="flex items-center gap-3 self-start lg:flex-col lg:items-start lg:gap-1.5 lg:sticky lg:top-6">
      <span className="font-serif-luxury text-[40px] lg:text-[54px] font-semibold leading-none text-ink lining-nums tabular-nums">
        {d.getDate()}
      </span>
      <span className="font-sans">
        <span className={`block text-[16px] font-bold first-letter:uppercase ${relativo ? 'text-brand-deep' : 'text-ink'}`}>
          {nome}
        </span>
        <span className="block text-[13px] font-medium text-ink-soft">
          {mes} · {total} {total === 1 ? 'registro' : 'registros'}
        </span>
      </span>
    </h3>
  );
};

/**
 * A linha do tempo da clínica inteira, na tela Hoje, abaixo do calendário e dos atalhos.
 *
 * Atendimentos, orçamentos e pacientes já estão em memória. Anamneses não: vêm por
 * uma consulta só dos últimos 30 dias — o maior período oferecido —, e não pela coleção inteira,
 * porque esta é a primeira tela depois do login e ninguém deveria pagar a história toda da clínica
 * para ver a semana. Trocar o período entre Hoje e 30 dias filtra o que já chegou.
 */
export const LinhaDoTempoDaClinica: React.FC<LinhaDoTempoDaClinicaProps> = ({
  clinic,
  catalogProcedures,
  atendimentos,
  pacientes,
  quotes,
  templatesAnamnese,
  carregando,
  professionalLogadaId,
  onAbrirPaciente,
  onAgendar,
  onRegistrarVisita,
  onAbrirNaAgenda,
  onNovaAnamnese,
}) => {
  const hoje = hojeISO();
  const corte = corteDaLinha(hoje);

  const [dias, setDias] = useState<number>(periodoInicial);
  const [busca, setBusca] = useState('');
  const [tipos, setTipos] = useState<FiltroDeTipo[]>([]);
  const [limite, setLimite] = useState(PAGINA);
  const [anamneses, setAnamneses] = useState<AnamnesisRecord[]>([]);
  const [anamnesesProntas, setAnamnesesProntas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [anamneseAberta, setAnamneseAberta] = useState<AnamnesisRecord | null>(null);
  const [acompanhando, setAcompanhando] = useState<Attendance | null>(null);
  /** O evento tocado: abre o painel com o documento e o passo seguinte. */
  const [aberto, setAberto] = useState<ItemDaLinha | null>(null);

  const acoesDeOrcamento = useAcoesDeOrcamento({
    clinic,
    procedures: catalogProcedures,
    patients: pacientes,
    onErro: setErro,
  });

  useEffect(() => {
    const pararAnamneses = subscribeToAnamnesisRecordsDesde(
      corte,
      (dados) => {
        setAnamneses(dados);
        setAnamnesesProntas(true);
      },
      () => setAnamnesesProntas(true)
    );
    return () => {
      pararAnamneses();
    };
  }, [corte]);

  useEffect(() => {
    try {
      gravarLocal(CHAVE_DO_PERIODO, String(dias));
    } catch {
      // Sem armazenamento, a escolha vale só para esta visita.
    }
  }, [dias]);

  // Mudou o recorte, a paginação recomeça — senão a lista abriria já "expandida".
  useEffect(() => setLimite(PAGINA), [dias, busca, tipos]);

  const semTipo = useMemo(
    () =>
      linhaDaClinica(
        { atendimentos, anamneses, orcamentos: quotes },
        { dias, busca },
        hoje
      ),
    [atendimentos, anamneses, quotes, dias, busca, hoje]
  );
  const contagem = useMemo(() => contarPorTipo(semTipo), [semTipo]);
  const filtrados = useMemo(
    () => semTipo.filter((i) => passaNoFiltroDeTipo(i, tipos)),
    [semTipo, tipos]
  );
  const visiveis = filtrados.slice(0, limite);
  const porDia = useMemo(() => agruparPorDia(visiveis, hoje), [visiveis, hoje]);

  const mapasDeAreas = useMemo(
    () => montarMapasPublicos(catalogProcedures).mapas,
    [catalogProcedures]
  );

  const acoes: AcoesDaLinha = {
    orcamento: acoesDeOrcamento,
    onVerAnamnese: setAnamneseAberta,
    onAcompanhamento: setAcompanhando,
    onNovaAnamnese,
    onAgendar,
    onRegistrarVisita,
    onAbrirNaAgenda,
    onAbrirPaciente,
  };

  /**
   * O que o painel sabe da paciente. As anamneses são as dos últimos 30 dias — basta:
   * o passo seguinte de um evento vem depois dele, e a linha não mostra nada mais antigo.
   */
  const contexto: ContextoDaJornada = useMemo(
    () => ({
      atendimentos,
      anamneses,
      catalogo: catalogProcedures,
      templatesAnamnese,
    }),
    [atendimentos, anamneses, catalogProcedures, templatesAnamnese]
  );

  const alternarTipo = (tipo: FiltroDeTipo) =>
    setTipos((atual) => (atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo]));

  const chip = (ativo: boolean) =>
    `inline-flex items-center gap-2 h-10 px-4 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors ${
      ativo
        ? 'bg-ink text-cream shadow-[0_8px_18px_-10px_rgba(26,26,26,.8)]'
        : 'bg-white/70 text-ink-soft border border-white hover:bg-white hover:text-ink'
    }`;

  const templateDaAnamnese = anamneseAberta
    ? templatesAnamnese.find(
        (t) => t.id === (anamneseAberta.templateId || anamneseAberta.procedimentoId)
      )
    : undefined;

  return (
    <>
      <section
        className="vidro-no-relevo rounded-[26px] lg:rounded-[34px] p-4 sm:p-6 lg:p-8"
        aria-labelledby="linha-do-tempo-titulo"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[.18em] text-brand-deep">
              O que aconteceu na clínica
            </p>
            <h2
              id="linha-do-tempo-titulo"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 font-serif-luxury text-[30px] lg:text-[38px] font-semibold leading-tight text-ink"
            >
              Linha do tempo
              <span className="inline-flex items-center h-7 px-3 rounded-full bg-white/80 border border-white font-sans text-[13px] font-bold text-ink-soft tabular-nums">
                {filtrados.length} {filtrados.length === 1 ? 'registro' : 'registros'}
              </span>
            </h2>
          </div>

          {/* Período */}
          <div
            className="flex w-fit max-w-full p-1 rounded-full bg-white/55 border border-white overflow-x-auto [scrollbar-width:none]"
            role="group"
            aria-label="Período"
          >
            {PERIODOS_DA_LINHA.map((p) => (
              <button
                key={p.dias}
                type="button"
                onClick={() => setDias(p.dias)}
                aria-pressed={dias === p.dias}
                className={`h-10 px-4 sm:px-5 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors ${
                  dias === p.dias ? 'bg-ink text-cream shadow-[0_8px_18px_-10px_rgba(26,26,26,.8)]' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Busca */}
          <div className="relative lg:w-[340px] shrink-0">
            <Search className="w-[18px] h-[18px] text-ink-soft absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar paciente ou procedimento"
              aria-label="Buscar na linha do tempo"
              className="w-full h-12 pl-11 pr-11 rounded-full bg-white/75 border border-white text-[15px] text-ink placeholder:text-muted focus:outline-hidden focus:bg-white focus:border-brand/50 transition-colors"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tipo — desliza no celular em vez de quebrar em duas linhas. */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-center gap-2 w-max" role="group" aria-label="Tipo">
              <button
                type="button"
                onClick={() => setTipos([])}
                aria-pressed={tipos.length === 0}
                className={chip(tipos.length === 0)}
              >
                Todos
              </button>
              {TIPOS_DA_LINHA.map(({ tipo, rotulo }) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => alternarTipo(tipo)}
                  aria-pressed={tipos.includes(tipo)}
                  className={chip(tipos.includes(tipo))}
                >
                  {rotulo}
                  <span
                    className={`min-w-6 h-6 px-1.5 rounded-full inline-flex items-center justify-center text-[12px] font-bold tabular-nums ${
                      tipos.includes(tipo) ? 'bg-white/15' : 'bg-ink/6'
                    }`}
                  >
                    {contagem[tipo]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {erro && (
          <p className="mt-4 px-4 py-2.5 rounded-xl bg-danger-bg border border-danger-line text-[14px] text-danger">
            {erro}
          </p>
        )}

        {carregando || !anamnesesProntas ? (
          <div className="mt-6 rounded-2xl bg-white/60 p-5">
            <SkeletonLinhas linhas={4} />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white/60 border border-white px-6 py-10 text-center">
            <History className="w-9 h-9 text-brand mx-auto mb-3" />
            <p className="text-[17px] font-semibold text-ink">
              {busca || tipos.length > 0 ? 'Nada encontrado com esses filtros.' : 'Nada registrado no período.'}
            </p>
            <p className="text-[14px] text-ink-soft mt-1">
              {dias < MAIOR_PERIODO_DA_LINHA
                ? 'Aumente o período para ver mais.'
                : 'Orçamentos, anamneses, avaliações, atendimentos e relatórios aparecem aqui conforme acontecem.'}
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="divide-y divide-ink/8">
              {porDia.map((dia) => (
                <div
                  key={dia.data}
                  className="grid gap-3 py-5 first:pt-0 lg:grid-cols-[150px_minmax(0,1fr)] lg:gap-6 lg:py-6"
                >
                  <CabecalhoDoDia data={dia.data} rotulo={dia.rotulo} total={dia.itens.length} />
                  <ol className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
                    {dia.itens.map((item) => (
                      <CartaoDaLinhaDoTempo
                        key={`${item.tipo}-${item.id}`}
                        item={item}
                        onAbrirPaciente={onAbrirPaciente}
                        onAbrir={setAberto}
                      />
                    ))}
                  </ol>
                </div>
              ))}
            </div>

            {filtrados.length > visiveis.length && (
              <button
                type="button"
                onClick={() => setLimite((l) => l + PAGINA)}
                className="peca-no-relevo mt-4 w-full h-12 rounded-full text-[15px] font-semibold text-ink"
              >
                Mostrar mais ({filtrados.length - visiveis.length})
              </button>
            )}
          </div>
        )}
      </section>

        {/* Os painéis e formulários ficam FORA da seção de vidro. O `backdrop-filter` do vidro faz
            dela o quadro de referência de tudo o que é `position: fixed` lá dentro: o painel do
            evento, em vez de cobrir a tela, ficava preso no pé da seção — no celular, a página
            rolava até ele e ele saía da vista, atrás da barra de baixo. */}
        {acoesDeOrcamento.modais}

        {aberto && (
          <PainelDoEvento
            item={aberto}
            contexto={contexto}
            acoes={acoes}
            onFechar={() => setAberto(null)}
          />
        )}

        {anamneseAberta && (
          <PrintableAnamnesisSheet
            record={anamneses.find((r) => r.id === anamneseAberta.id) || anamneseAberta}
            clinicProfile={clinic}
            onClose={() => setAnamneseAberta(null)}
            viewerRole="staff"
            onSaveRecord={saveAnamnesisRecord}
            orientationImage={resolveOrientationImage(templateDaAnamnese)}
            consentSections={resolveConsentTerm(templateDaAnamnese)}
            mapasDeAreas={mapasDeAreas}
          />
        )}

        {acompanhando && (
          <FichaFillModal
            tipo="acompanhamento"
            isOpen
            onClose={() => setAcompanhando(null)}
            alvo={alvoDoAtendimento(acompanhando)}
            paciente={pacientes.find((p) => p.id === acompanhando.pacienteId)}
            catalogo={catalogProcedures}
            professionals={clinic.professionals || []}
            clinicProfile={clinic}
          />
        )}
    </>
  );
};
