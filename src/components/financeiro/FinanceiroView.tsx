import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { Attendance, Procedure, Professional, Quote } from '../../types';
import { formatBRL, formatDateOnly } from '../../utils/formatters';
import { hojeISO } from '../../utils/attendances';
import { MateriaisDoAtendimentoPanel } from '../estoque/MateriaisDoAtendimentoPanel';
import { Chip, ValorEmReais } from '../common/Tinta';
import {
  Periodo,
  atendimentosComMateriaisNoPeriodo,
  custoDeMaterialNoPeriodo,
  margemDoPeriodo,
  mesAnteriorA,
  mesAtual,
  nomeDoMes,
  periodoDeDias,
  periodoDoAno,
  periodoDoMes,
  resumoFinanceiro,
} from '../../utils/indicadores';

/**
 * Painel financeiro.
 *
 * **A fonte do dinheiro é o orçamento pago.** Foi uma decisão, não um padrão: o `Attendance`
 * não guarda valor nenhum, o `SessionPlan` também não, e o `Procedure` guarda só o preço de
 * hoje — somar atendimento × catálogo faria o faturamento de março mudar sozinho num reajuste
 * de abril, e o painel deixaria de servir para fechar mês. O orçamento pago é o único número
 * com valor fechado e data (`Quote.total` e `Quote.pagoEm`).
 *
 * A consequência a dizer em voz alta: **atendimento feito sem orçamento emitido não aparece
 * aqui**. A tela diz isso em letra pequena, em vez de deixar a equipe descobrir sozinha
 * conferindo a soma.
 *
 * No redesign, o faturamento sobe para o bloco preto do topo, grande, sozinho — é o número que se
 * abre esta tela para ver. Os outros descem para cartões brancos, um número por cartão.
 *
 * Nenhuma leitura nova no Firestore: os orçamentos já vivem em memória, e é por isso que trocar
 * o período não custa nada.
 */

interface FinanceiroViewProps {
  quotes: Quote[];
  /** Atendimentos — o custo de material do período sai do total gravado em cada um. */
  atendimentos: Attendance[];
  /** O catálogo, para o detalhe dos materiais achar o procedimento de cada atendimento. */
  catalogProcedures: Procedure[];
  professionals: Professional[];
  /** Só administradoras entram. Ver o gate no App. */
  ehAdmin: boolean;
  onVoltar: () => void;
  carregando?: boolean;
}

type FiltroDePeriodo = 'mes' | 'mes-anterior' | '90-dias' | 'ano';

const PERIODOS: { id: FiltroDePeriodo; rotulo: string }[] = [
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes-anterior', rotulo: 'Mês passado' },
  { id: '90-dias', rotulo: '90 dias' },
  { id: 'ano', rotulo: 'Ano' },
];

const montarPeriodo = (filtro: FiltroDePeriodo, hoje: string): Periodo => {
  if (filtro === 'mes') return periodoDoMes(mesAtual(hoje));
  if (filtro === 'mes-anterior') return periodoDoMes(mesAnteriorA(mesAtual(hoje)));
  if (filtro === '90-dias') return periodoDeDias(90, hoje);
  return periodoDoAno(Number(hoje.slice(0, 4)));
};

/** O cartão branco do painel — um número por cartão, o rótulo pequeno em cima. */
const Cartao: React.FC<{
  rotulo: string;
  valor: string;
  detalhe?: React.ReactNode;
  alerta?: boolean;
}> = ({ rotulo, valor, detalhe, alerta }) => (
  <div
    className={`rounded-[18px] p-4 border ${
      alerta ? 'bg-warn-bg border-warn-line text-warn' : 'bg-card border-ink/8 text-ink'
    }`}
  >
    <p className={`text-[13px] font-medium ${alerta ? '' : 'text-ink-soft'}`}>{rotulo}</p>
    <p className="text-[22px] font-bold tabular-nums mt-1 leading-tight">{valor}</p>
    {detalhe && (
      <p className={`text-[12px] font-medium mt-0.5 leading-snug ${alerta ? '' : 'text-muted'}`}>
        {detalhe}
      </p>
    )}
  </div>
);

const TituloDoCartao: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="font-sans text-[15px] font-bold text-ink">{children}</h3>
);

/**
 * Gráfico de barras em CSS puro — sem biblioteca.
 *
 * Um gráfico de doze barras com rótulo não justifica 90 KB de dependência no bundle de um app
 * que a equipe abre no 4G da clínica. Altura em porcentagem, e o valor no `title` e no
 * `aria-label` para quem lê com o dedo ou com leitor de tela.
 */
const BarrasPorMes: React.FC<{ dados: { mes: string; valor: number }[] }> = ({ dados }) => {
  const maior = Math.max(1, ...dados.map((d) => d.valor));
  if (dados.length === 0) return null;

  return (
    <div className="rounded-[20px] bg-card border border-ink/8 p-4">
      <TituloDoCartao>Faturamento por mês</TituloDoCartao>
      <div className="flex items-end gap-3 mt-3">
        {/* A escala, para a altura da barra querer dizer alguma coisa. */}
        <div className="h-[140px] flex flex-col justify-between shrink-0 pb-5">
          <span className="text-label text-muted tabular-nums">{formatBRL(maior)}</span>
          <span className="text-label text-muted">0</span>
        </div>

        <div
          className="flex-1 min-w-0 flex items-end justify-around gap-1.5 h-[140px]"
          role="img"
          aria-label={`Faturamento por mês: ${dados
            .map((d) => `${nomeDoMes(d.mes)}, ${formatBRL(d.valor)}`)
            .join('; ')}`}
        >
          {dados.map((d) => (
            <div
              key={d.mes}
              /* Teto de largura: com um mês só, a barra esticada ocupava o card inteiro e
                 parecia um bloco de cor, não um gráfico. */
              className="flex-1 min-w-0 max-w-[72px] h-full flex flex-col justify-end gap-1"
            >
              <span
                className="w-full rounded-t-md bg-ink transition-[height] duration-300"
                style={{ height: `${Math.max(2, (d.valor / maior) * 100)}%` }}
                title={`${nomeDoMes(d.mes)}: ${formatBRL(d.valor)}`}
              />
              <span className="text-label text-muted text-center truncate">
                {nomeDoMes(d.mes).slice(0, 3)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Barras horizontais: o ranking de procedimentos. Comparação de ordem, não de valor exato. */
const RankingDeProcedimentos: React.FC<{
  dados: { nome: string; valor: number; vezes: number }[];
}> = ({ dados }) => {
  const maior = Math.max(1, ...dados.map((d) => d.valor));

  return (
    <div className="rounded-[20px] bg-card border border-ink/8 p-4">
      <TituloDoCartao>Procedimentos que mais faturam</TituloDoCartao>
      {dados.length === 0 ? (
        <p className="text-body text-ink-soft mt-2">Nenhum orçamento pago neste período.</p>
      ) : (
        <ul className="space-y-2.5 mt-3">
          {dados.map((d) => (
            <li key={d.nome}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-lg text-ink truncate">{d.nome}</span>
                <span className="text-body font-bold text-ink tabular-nums shrink-0">
                  {formatBRL(d.valor)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="flex-1 h-2 rounded-full bg-line-soft overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-brand-light"
                    style={{ width: `${(d.valor / maior) * 100}%` }}
                  />
                </span>
                <span className="text-label text-muted tabular-nums shrink-0">{d.vezes}×</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Os atendimentos do período com materiais registrados, e o custo de cada um.
 *
 * É o único lugar do sistema onde esse valor aparece por atendimento: o acompanhamento é
 * preenchido ao lado da paciente e mostra só material e quantidade. O painel inteiro já é restrito
 * a administradoras. Tocar abre o detalhe com os valores — é ali que se completa o "falta valor"
 * do material digitado à mão.
 */
const MateriaisPorAtendimento: React.FC<{
  atendimentos: Attendance[];
  professionals: Professional[];
  carregando?: boolean;
  onAbrir: (a: Attendance) => void;
}> = ({ atendimentos, professionals, carregando, onAbrir }) => {
  const [limite, setLimite] = useState(10);
  const visiveis = atendimentos.slice(0, limite);

  return (
    <div className="rounded-[20px] bg-card border border-ink/8 p-4">
      <TituloDoCartao>Materiais por atendimento</TituloDoCartao>
      <p className="text-body text-ink-soft mt-0.5 mb-3">
        Toque para ver os materiais com os valores, corrigir ou completar o que falta.
      </p>
      {carregando ? (
        <p className="text-body text-ink-soft">Carregando…</p>
      ) : atendimentos.length === 0 ? (
        <p className="text-body text-ink-soft">
          Nenhum atendimento com materiais registrados neste período.
        </p>
      ) : (
        <ul className="divide-y divide-ink/8">
          {visiveis.map((a) => {
            const profissional =
              professionals.find((p) => p.id === a.professionalId)?.name || a.profissionalNome;
            const semValor = a.materiaisSemValor || 0;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(a)}
                  className="w-full flex items-center gap-3 py-2.5 text-left rounded-lg hover:bg-surface transition-colors"
                >
                  <span className="w-12 shrink-0 text-body font-bold text-ink tabular-nums">
                    {formatDateOnly(a.data).slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-lg font-semibold text-ink truncate">{a.pacienteNome}</span>
                    <span className="block text-body text-ink-soft truncate">
                      {[a.procedimentoNome, profissional].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-body-lg font-bold text-ink tabular-nums">
                      {formatBRL(a.custoMateriais || 0)}
                    </span>
                    {semValor > 0 && (
                      <span
                        className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-warn-bg text-warn text-label font-bold"
                        title={`${semValor} ${semValor === 1 ? 'material' : 'materiais'} sem valor`}
                      >
                        Falta valor
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink-soft shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!carregando && atendimentos.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((atual) => atual + 20)}
          className="mt-2 min-h-[40px] text-body font-semibold text-ink underline underline-offset-2"
        >
          Mostrar mais ({atendimentos.length - limite})
        </button>
      )}
    </div>
  );
};

export const FinanceiroView: React.FC<FinanceiroViewProps> = ({
  quotes,
  atendimentos,
  catalogProcedures,
  professionals,
  ehAdmin,
  onVoltar,
  carregando,
}) => {
  const hoje = hojeISO();
  const [filtro, setFiltro] = useState<FiltroDePeriodo>('mes');
  const [professionalId, setProfessionalId] = useState('');
  /** O atendimento cujos materiais, com valores, estão abertos. */
  const [materiaisDe, setMateriaisDe] = useState<Attendance | null>(null);

  const periodo = useMemo(() => montarPeriodo(filtro, hoje), [filtro, hoje]);
  const resumo = useMemo(
    () => resumoFinanceiro(quotes, periodo, professionalId || undefined, hoje),
    [quotes, periodo, professionalId, hoje]
  );
  const material = useMemo(
    () => custoDeMaterialNoPeriodo(atendimentos, periodo, professionalId || undefined),
    [atendimentos, periodo, professionalId]
  );
  const margem = margemDoPeriodo(resumo.faturamento, material.custo);
  const comMateriais = useMemo(
    () => atendimentosComMateriaisNoPeriodo(atendimentos, periodo, professionalId || undefined),
    [atendimentos, periodo, professionalId]
  );

  /**
   * O painel é o único lugar do sistema onde a receita da casa aparece inteira. Numa clínica com
   * equipe, isso não é informação de todo mundo — e a trava é de tela, não de banco: quem abrir
   * o console continua lendo os orçamentos, que é o que as regras do Firestore permitem.
   */
  if (!ehAdmin) {
    return (
      <div className="max-w-md mx-auto px-5 py-16 text-center">
        <Lock className="w-8 h-8 text-ink-soft mx-auto mb-3" />
        <h1 className="font-serif-luxury text-[30px] font-semibold text-ink">Painel restrito</h1>
        <p className="text-body-lg text-ink-soft mt-2">
          O financeiro fica visível só para administradoras. Fale com quem administra a conta da
          clínica se você precisa deste acesso.
        </p>
        <button
          type="button"
          onClick={onVoltar}
          className="mt-5 min-h-[44px] px-5 rounded-full bg-ink text-white text-body font-semibold"
        >
          Voltar
        </button>
      </div>
    );
  }

  const variacao = resumo.variacao;
  const faturamentoZero = resumo.faturamento <= 0;
  /** Quanto da barra é margem — o resto, em bronze, é o custo de material. */
  const fatiaDaMargem = faturamentoZero
    ? 0
    : Math.max(0, Math.min(100, (margem.valor / resumo.faturamento) * 100));
  const materialIncompleto = material.realizados > 0 && material.comMateriais < material.realizados;

  return (
    <div className="max-w-4xl mx-auto sm:px-8 sm:pt-8 pb-6 flex flex-col gap-3 sm:gap-4">
      {/* O bloco preto: o faturamento, grande, e o que muda a conta (período e profissional). */}
      <header className="bg-ink text-cream px-5 pt-5 pb-6 sm:rounded-[24px] sm:p-7 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif-luxury text-[30px] lg:text-[36px] font-semibold leading-[1.1] text-white">
            Financeiro
          </h1>
          {professionals.length > 1 && (
            <label className="relative shrink-0">
              <span className="sr-only">Profissional</span>
              <select
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="appearance-none h-9 pl-3.5 pr-8 rounded-full bg-cream/10 text-cream text-[13px] font-semibold border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light max-w-[190px] truncate"
              >
                <option value="">Toda a clínica</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-cream" />
            </label>
          )}
        </div>

        <div>
          <p className="text-[13px] font-semibold text-brand-light first-letter:uppercase">
            Faturamento · {periodo.rotulo}
          </p>
          {carregando ? (
            <p className="text-[46px] font-bold leading-[1.1] text-white">—</p>
          ) : (
            <ValorEmReais
              valor={resumo.faturamento}
              className="block text-[46px] font-bold leading-[1.1] tracking-[-0.02em] text-white"
              centavosClassName="text-[26px] text-cream/70"
            />
          )}
          <p className="text-[13px] font-medium text-cream/75 inline-flex items-center gap-1">
            {variacao === null ? (
              'Sem base anterior para comparar'
            ) : variacao === 0 ? (
              'Igual ao período anterior'
            ) : (
              <>
                {variacao > 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-ok-claro" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-[#FECACA]" />
                )}
                <span className={variacao > 0 ? 'text-ok-claro' : 'text-[#FECACA]'}>
                  {variacao > 0 ? '+' : ''}
                  {variacao}%
                </span>
                em relação ao período anterior
              </>
            )}
          </p>
        </div>

        {/* Os períodos deslizam no celular em vez de quebrar em duas linhas. */}
        <div className="-mx-5 px-5 sm:mx-0 sm:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1.5 w-max" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <Chip key={p.id} tom="escuro" ativo={filtro === p.id} onClick={() => setFiltro(p.id)}>
                {p.rotulo}
              </Chip>
            ))}
          </div>
        </div>

        {!!professionalId && (
          <p className="text-[12px] text-cream/70 leading-snug">
            Um orçamento com procedimentos de profissionais diferentes conta para cada uma delas —
            por isso a soma dos filtros pode passar do total da clínica.
          </p>
        )}
      </header>

      <div className="px-5 sm:px-0 flex flex-col gap-3 sm:gap-4">
        {/* Margem e custo de material. Outra conta, com outra data — ver a nota no fim. */}
        <div className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3">
          <div className="flex justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-soft">Margem</p>
              <p
                className={`text-[22px] font-bold tabular-nums leading-tight ${
                  margem.valor < 0 ? 'text-danger' : 'text-ink'
                }`}
              >
                {carregando ? '—' : formatBRL(margem.valor)}
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[13px] font-medium text-ink-soft">Custo de material</p>
              <p className="text-[22px] font-bold tabular-nums leading-tight text-ink">
                {carregando ? '—' : formatBRL(material.custo)}
              </p>
            </div>
          </div>
          <div
            className="h-2.5 rounded-full overflow-hidden flex bg-line-soft"
            role="img"
            aria-label={
              faturamentoZero
                ? 'Sem faturamento no período'
                : `Margem de ${margem.percentual}% do faturamento`
            }
          >
            {!faturamentoZero && (
              <>
                <span className="h-full bg-ink" style={{ width: `${fatiaDaMargem}%` }} />
                <span className="h-full flex-1 bg-brand-light" />
              </>
            )}
          </div>
          <p className="text-[13px] font-medium text-ink-soft">
            {margem.percentual === null
              ? 'Sem faturamento no período'
              : `${margem.percentual}% do faturamento`}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Cartao
            rotulo="Ticket médio"
            valor={carregando ? '—' : formatBRL(resumo.ticket.valor)}
            detalhe={`${resumo.ticket.base} ${resumo.ticket.base === 1 ? 'orçamento' : 'orçamentos'}`}
          />
          <Cartao
            rotulo="Conversão"
            valor={
              carregando || resumo.conversao.percentual === null
                ? '—'
                : `${resumo.conversao.percentual}%`
            }
            detalhe={`${resumo.conversao.pagos} de ${resumo.conversao.enviados} enviados`}
          />
          <Cartao
            rotulo="Período anterior"
            valor={carregando ? '—' : formatBRL(resumo.faturamentoAnterior)}
            detalhe="mesmo nº de dias"
          />
          <Cartao
            rotulo="Material lançado"
            alerta={materialIncompleto}
            valor={
              material.realizados === 0 ? '—' : `${material.comMateriais} de ${material.realizados}`
            }
            detalhe={
              material.realizados === 0
                ? 'nenhum atendimento no período'
                : material.realizados === 1
                ? 'atendimento'
                : 'atendimentos'
            }
          />
        </div>

        {/* A lista volta ao começo quando o período ou a profissional mudam. */}
        <MateriaisPorAtendimento
          key={`${filtro}-${professionalId}`}
          atendimentos={comMateriais}
          professionals={professionals}
          carregando={carregando}
          onAbrir={setMateriaisDe}
        />

        <BarrasPorMes dados={resumo.porMes} />
        <RankingDeProcedimentos dados={resumo.porProcedimento} />

        {/* A ressalva, escrita. Não é rodapé decorativo: é a diferença entre conferir a soma e
            achar que o sistema está errado. */}
        <p className="text-body text-ink-soft leading-relaxed">
          O faturamento soma os <strong className="text-ink">orçamentos pagos</strong>, pela data
          do pagamento. É o único valor que o sistema guarda fechado e datado — o atendimento não
          tem preço gravado, e usar o preço do catálogo faria o faturamento de um mês fechado mudar
          sozinho a cada reajuste. <strong className="text-ink">Atendimento realizado sem
          orçamento emitido não entra nesta conta.</strong>
        </p>
        <p className="text-body text-ink-soft leading-relaxed">
          O custo de material soma os materiais registrados nos atendimentos, pela{' '}
          <strong className="text-ink">data do atendimento</strong>, com o preço do dia em que
          foram registrados. A margem é o faturamento menos esse custo — datas diferentes de
          propósito: um pacote pago em março e feito até junho entra em março no faturamento e mês
          a mês no custo. <strong className="text-ink">Atendimento sem materiais registrados conta
          como custo zero</strong>, por isso o cartão mostra quantos foram lançados.
        </p>
        <p className="text-body text-ink-soft leading-relaxed">
          Os valores dos materiais aparecem só aqui. O acompanhamento, preenchido ao lado da
          paciente, registra material e quantidade sem preço — o custo é calculado com o preço de
          cada produto no Estoque, e o material digitado à mão fica com{' '}
          <strong className="text-ink">falta valor</strong> até ser completado na lista acima.
        </p>
      </div>

      <MateriaisDoAtendimentoPanel
        atendimento={materiaisDe}
        onFechar={() => setMateriaisDe(null)}
        catalogo={catalogProcedures}
      />
    </div>
  );
};
