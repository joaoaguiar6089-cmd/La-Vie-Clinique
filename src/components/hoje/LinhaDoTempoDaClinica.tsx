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
  MAIOR_PERIODO_DA_LINHA,
  PERIODOS_DA_LINHA,
  TIPOS_DA_LINHA,
  TipoNaLinha,
  agruparPorDia,
  contarPorTipo,
  corteDaLinha,
  linhaDaClinica,
} from '../../utils/linhaDoTempoClinica';
import { ItemDaLinha } from '../../utils/pacienteResumo';
import { alvoDoAtendimento, alvoDoRegistro } from '../../utils/fichasClinicas';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { montarEspelhoPublico } from '../../utils/laserAreas';
import {
  saveAnamnesisRecord,
  subscribeToAnamnesisRecordsDesde,
  subscribeToRegistrosDeFicha,
} from '../../services/databaseService';
import { useAcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { AcoesDaLinha, ItemDaLinhaDoTempo } from '../linhaDoTempo/ItemDaLinhaDoTempo';
import { PrintableAnamnesisSheet } from '../anamnesis/PrintableAnamnesisSheet';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { SkeletonLinhas } from '../common/Skeleton';

interface LinhaDoTempoDaClinicaProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  atendimentos: Attendance[];
  pacientes: Patient[];
  quotes: Quote[];
  /** Fichas-modelo de anamnese — a ficha aberta resolve por elas a imagem orientativa e o termo. */
  templatesAnamnese: AnamnesisTemplate[];
  carregando?: boolean;
  onAbrirPaciente: (pacienteId: string) => void;
}

/** A última escolha de período fica no aparelho — é preferência de quem usa, não da clínica. */
const CHAVE_DO_PERIODO = 'lavie:hoje-linha-periodo';
const PERIODO_PADRAO = 7;
/** Quantos itens entram de cada vez. Trinta dias de uma clínica cheia passam de centenas. */
const PAGINA = 40;

const periodoInicial = (): number => {
  try {
    const guardado = Number(localStorage.getItem(CHAVE_DO_PERIODO));
    if (PERIODOS_DA_LINHA.some((p) => p.dias === guardado)) return guardado;
  } catch {
    // Armazenamento bloqueado: fica o padrão.
  }
  return PERIODO_PADRAO;
};

/**
 * A linha do tempo da clínica inteira, na tela Hoje, abaixo das Pendências.
 *
 * Atendimentos, orçamentos e pacientes já estão em memória. Anamneses e avaliações não: vêm por
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
  onAbrirPaciente,
}) => {
  const hoje = hojeISO();
  const corte = corteDaLinha(hoje);

  const [dias, setDias] = useState<number>(periodoInicial);
  const [busca, setBusca] = useState('');
  const [tipos, setTipos] = useState<TipoNaLinha[]>([]);
  const [limite, setLimite] = useState(PAGINA);
  const [anamneses, setAnamneses] = useState<AnamnesisRecord[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<EvaluationRecord[]>([]);
  const [anamnesesProntas, setAnamnesesProntas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [anamneseAberta, setAnamneseAberta] = useState<AnamnesisRecord | null>(null);
  const [avaliacaoAberta, setAvaliacaoAberta] = useState<EvaluationRecord | null>(null);
  const [acompanhando, setAcompanhando] = useState<Attendance | null>(null);

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
    // Avaliação é interna: sem as regras publicadas ou sem permissão, a linha segue sem elas.
    const pararAvaliacoes = subscribeToRegistrosDeFicha('avaliacao', { desde: corte }, setAvaliacoes);
    return () => {
      pararAnamneses();
      pararAvaliacoes();
    };
  }, [corte]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_DO_PERIODO, String(dias));
    } catch {
      // Sem armazenamento, a escolha vale só para esta visita.
    }
  }, [dias]);

  // Mudou o recorte, a paginação recomeça — senão a lista abriria já "expandida".
  useEffect(() => setLimite(PAGINA), [dias, busca, tipos]);

  const semTipo = useMemo(
    () =>
      linhaDaClinica(
        { atendimentos, anamneses, orcamentos: quotes, avaliacoes },
        { dias, busca },
        hoje
      ),
    [atendimentos, anamneses, quotes, avaliacoes, dias, busca, hoje]
  );
  const contagem = useMemo(() => contarPorTipo(semTipo), [semTipo]);
  const filtrados = useMemo(
    () => (tipos.length === 0 ? semTipo : semTipo.filter((i) => tipos.includes(i.tipo))),
    [semTipo, tipos]
  );
  const visiveis = filtrados.slice(0, limite);
  const porDia = useMemo(() => agruparPorDia(visiveis, hoje), [visiveis, hoje]);

  const mapaDoLaser = useMemo(
    () => montarEspelhoPublico(catalogProcedures, clinic),
    [catalogProcedures, clinic]
  );

  const acoes: AcoesDaLinha = {
    orcamento: acoesDeOrcamento,
    onVerAnamnese: setAnamneseAberta,
    onVerAvaliacao: setAvaliacaoAberta,
    onAcompanhamento: setAcompanhando,
  };

  /** O toque no título: a ficha, a prévia, ou — no atendimento — a página da paciente. */
  const abrir = (item: ItemDaLinha) => {
    if (item.tipo === 'anamnese') setAnamneseAberta(item.ref);
    else if (item.tipo === 'avaliacao') setAvaliacaoAberta(item.ref);
    else if (item.tipo === 'orcamento') acoesDeOrcamento.abrirPrevia(item.ref);
    else onAbrirPaciente(item.ref.pacienteId);
  };

  const alternarTipo = (tipo: TipoNaLinha) =>
    setTipos((atual) => (atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo]));

  const chip = (ativo: boolean) =>
    `inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border text-body font-semibold transition-colors ${
      ativo ? 'bg-ink text-white border-ink' : 'bg-card text-ink-soft border-line hover:border-brand'
    }`;

  const templateDaAnamnese = anamneseAberta
    ? templatesAnamnese.find(
        (t) => t.id === (anamneseAberta.templateId || anamneseAberta.procedimentoId)
      )
    : undefined;

  return (
    <section className="space-y-3" aria-labelledby="linha-do-tempo-titulo">
      <div className="flex items-center justify-between gap-3">
        <h2 id="linha-do-tempo-titulo" className="font-serif-luxury text-title text-ink">
          Linha do tempo
        </h2>
        <span className="text-body text-muted tabular-nums">
          {filtrados.length} {filtrados.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      {/* Período */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
        {PERIODOS_DA_LINHA.map((p) => (
          <button
            key={p.dias}
            type="button"
            onClick={() => setDias(p.dias)}
            aria-pressed={dias === p.dias}
            className={chip(dias === p.dias)}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por paciente ou procedimento"
          aria-label="Buscar na linha do tempo"
          className="w-full min-h-[44px] pl-9 pr-9 rounded-xl bg-card border border-line text-body-lg text-ink placeholder:text-muted focus:outline-hidden focus:border-brand"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca('')}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tipo — desliza no celular em vez de quebrar em duas linhas. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 w-max" role="group" aria-label="Tipo">
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
              <span className="tabular-nums opacity-70">{contagem[tipo]}</span>
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <p className="px-3 py-2 rounded-xl bg-danger-bg border border-danger-line text-body text-danger">
          {erro}
        </p>
      )}

      {carregando || !anamnesesProntas ? (
        <div className="glass-card p-4">
          <SkeletonLinhas linhas={4} />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="glass-card p-6 text-center">
          <History className="w-7 h-7 text-brand mx-auto mb-2" />
          <p className="text-body-lg font-medium text-ink">
            {busca || tipos.length > 0 ? 'Nada encontrado com esses filtros.' : 'Nada registrado no período.'}
          </p>
          <p className="text-body text-muted mt-1">
            {dias < MAIOR_PERIODO_DA_LINHA
              ? 'Aumente o período para ver mais.'
              : 'Atendimentos, orçamentos, anamneses e avaliações aparecem aqui conforme acontecem.'}
          </p>
        </div>
      ) : (
        <div className="glass-card p-3 sm:p-4 space-y-4">
          {porDia.map((dia) => (
            <div key={dia.data}>
              <h3 className="text-label uppercase tracking-wider font-semibold text-brand first-letter:uppercase mb-1">
                {dia.rotulo}
              </h3>
              <ol className="relative border-l border-line ml-3 space-y-0.5">
                {dia.itens.map((item) => (
                  <ItemDaLinhaDoTempo
                    key={`${item.tipo}-${item.id}`}
                    item={item}
                    acoes={acoes}
                    onAbrirPaciente={onAbrirPaciente}
                    onAbrir={abrir}
                  />
                ))}
              </ol>
            </div>
          ))}

          {filtrados.length > visiveis.length && (
            <button
              type="button"
              onClick={() => setLimite((l) => l + PAGINA)}
              className="w-full min-h-[44px] rounded-xl border border-line bg-card text-body font-semibold text-ink hover:border-brand transition-colors"
            >
              Mostrar mais ({filtrados.length - visiveis.length})
            </button>
          )}
        </div>
      )}

      {acoesDeOrcamento.modais}

      {anamneseAberta && (
        <PrintableAnamnesisSheet
          record={anamneses.find((r) => r.id === anamneseAberta.id) || anamneseAberta}
          clinicProfile={clinic}
          onClose={() => setAnamneseAberta(null)}
          viewerRole="staff"
          onSaveRecord={saveAnamnesisRecord}
          orientationImage={resolveOrientationImage(templateDaAnamnese)}
          consentSections={resolveConsentTerm(templateDaAnamnese)}
          mapaCorporal={mapaDoLaser}
        />
      )}

      {avaliacaoAberta && (
        <FichaFillModal
          tipo="avaliacao"
          isOpen
          onClose={() => setAvaliacaoAberta(null)}
          alvo={alvoDoRegistro(avaliacaoAberta)}
          paciente={pacientes.find((p) => p.id === avaliacaoAberta.pacienteId)}
          catalogo={catalogProcedures}
          professionals={clinic.professionals || []}
          clinicProfile={clinic}
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
    </section>
  );
};
