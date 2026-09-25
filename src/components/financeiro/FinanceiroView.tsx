import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Lock,
  Minus,
  PackageOpen,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Attendance, Procedure, Professional, Quote } from '../../types';
import { formatBRL, formatDateOnly } from '../../utils/formatters';
import { hojeISO } from '../../utils/attendances';
import { MateriaisDoAtendimentoPanel } from '../estoque/MateriaisDoAtendimentoPanel';
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
  { id: 'ano', rotulo: 'Este ano' },
];

const montarPeriodo = (filtro: FiltroDePeriodo, hoje: string): Periodo => {
  if (filtro === 'mes') return periodoDoMes(mesAtual(hoje));
  if (filtro === 'mes-anterior') return periodoDoMes(mesAnteriorA(mesAtual(hoje)));
  if (filtro === '90-dias') return periodoDeDias(90, hoje);
  return periodoDoAno(Number(hoje.slice(0, 4)));
};

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
    <div className="glass-card p-4">
      <h3 className="text-label uppercase tracking-wider font-semibold text-muted mb-3">
        Faturamento por mês
      </h3>
      <div className="flex items-end gap-3">
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
                className="w-full rounded-t-md bg-brand/85 transition-[height] duration-300"
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
    <div className="glass-card p-4">
      <h3 className="text-label uppercase tracking-wider font-semibold text-muted mb-3">
        Procedimentos que mais faturam
      </h3>
      {dados.length === 0 ? (
        <p className="text-body text-muted">Nenhum orçamento pago neste período.</p>
      ) : (
        <ul className="space-y-2.5">
          {dados.map((d) => (
            <li key={d.nome}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-lg text-ink truncate">{d.nome}</span>
                <span className="text-body font-semibold text-ink tabular-nums shrink-0">
                  {formatBRL(d.valor)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${(d.valor / maior) * 100}%` }}
                  />
                </span>
                <span className="text-label text-muted tabular-nums shrink-0">
                  {d.vezes}×
                </span>
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
    <div className="glass-card p-4">
      <h3 className="text-label uppercase tracking-wider font-semibold text-muted">
        Materiais por atendimento
      </h3>
      <p className="text-body text-muted mt-0.5 mb-3">
        Toque para ver os materiais com os valores, corrigir ou completar o que falta.
      </p>
      {carregando ? (
        <p className="text-body text-muted">Carregando…</p>
      ) : atendimentos.length === 0 ? (
        <p className="text-body text-muted">
          Nenhum atendimento com materiais registrados neste período.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visiveis.map((a) => {
            const profissional =
              professionals.find((p) => p.id === a.professionalId)?.name || a.profissionalNome;
            const semValor = a.materiaisSemValor || 0;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(a)}
                  className="w-full flex items-center gap-3 py-2.5 text-left rounded-lg hover:bg-surface-2 transition-colors"
                >
                  <span className="w-12 shrink-0 text-body font-semibold text-brand tabular-nums">
                    {formatDateOnly(a.data).slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-lg text-ink truncate">{a.pacienteNome}</span>
                    <span className="block text-body text-muted truncate">
                      {[a.procedimentoNome, profissional].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-body-lg font-semibold text-ink tabular-nums">
                      {formatBRL(a.custoMateriais || 0)}
                    </span>
                    {semValor > 0 && (
                      <span
                        className="inline-block mt-0.5 px-1.5 py-0.5 rounded-xs bg-warn-bg text-warn border border-warn-line text-label font-semibold uppercase tracking-wider"
                        title={`${semValor} ${semValor === 1 ? 'material' : 'materiais'} sem valor`}
                      >
                        Falta valor
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted shrink-0" />
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
          className="mt-2 min-h-[40px] text-body font-semibold text-brand hover:underline"
        >
          Mostrar mais ({atendimentos.length - limite})
        </button>
      )}
    </div>
  );
};

const Cartao: React.FC<{
  icone: React.ElementType;
  rotulo: string;
  valor: string;
  detalhe?: React.ReactNode;
}> = ({ icone: Icone, rotulo, valor, detalhe }) => (
  <div className="glass-card p-3.5 min-h-[96px]">
    <span className="flex items-center gap-1.5 text-label uppercase tracking-wider font-semibold text-muted">
      <Icone className="w-3.5 h-3.5 text-brand shrink-0" />
      <span className="truncate">{rotulo}</span>
    </span>
    <span className="block mt-1.5 text-title font-serif-luxury text-ink tabular-nums">
      {valor}
    </span>
    {detalhe && <span className="block text-label mt-0.5 leading-snug">{detalhe}</span>}
  </div>
);

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
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Lock className="w-8 h-8 text-muted mx-auto mb-3" />
        <h1 className="font-serif-luxury text-title-lg text-ink">Painel restrito</h1>
        <p className="text-body-lg text-muted mt-2">
          O financeiro fica visível só para administradoras. Fale com quem administra a conta da
          clínica se você precisa deste acesso.
        </p>
        <button
          type="button"
          onClick={onVoltar}
          className="mt-5 min-h-[44px] px-5 rounded-xl bg-brand text-white text-body font-semibold"
        >
          Voltar
        </button>
      </div>
    );
  }

  const variacao = resumo.variacao;
  const IconeVariacao =
    variacao === null || variacao === 0 ? Minus : variacao > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-4">
      <header>
        <p className="text-label uppercase tracking-wider font-semibold text-brand">Financeiro</p>
        <h1 className="font-serif-luxury text-title-lg sm:text-display text-ink mt-0.5">
          {periodo.rotulo}
        </h1>
      </header>

      {/* Filtros. Deslizam no celular em vez de quebrar em duas linhas. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 w-max" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFiltro(p.id)}
              aria-pressed={filtro === p.id}
              className={`min-h-[40px] px-3.5 rounded-full border text-body font-medium whitespace-nowrap transition-colors ${
                filtro === p.id
                  ? 'bg-ink text-white border-ink'
                  : 'bg-card text-ink-soft border-line hover:border-brand'
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {professionals.length > 1 && (
        <div>
          <label
            htmlFor="fin-profissional"
            className="block text-label uppercase tracking-wider font-semibold text-muted mb-1"
          >
            Profissional
          </label>
          <select
            id="fin-profissional"
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="w-full sm:w-auto glass-input px-3 py-2 rounded-lg text-body-lg text-ink focus:outline-hidden"
          >
            <option value="">Toda a clínica</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!!professionalId && (
            <p className="text-label text-muted mt-1">
              Um orçamento com procedimentos de profissionais diferentes conta para cada uma
              delas — por isso a soma dos filtros pode passar do total da clínica.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Cartao
          icone={Wallet}
          rotulo="Faturamento"
          valor={carregando ? '—' : formatBRL(resumo.faturamento)}
          detalhe={
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                variacao === null || variacao === 0
                  ? 'text-muted'
                  : variacao > 0
                  ? 'text-ok'
                  : 'text-danger'
              }`}
            >
              <IconeVariacao className="w-3 h-3" />
              {variacao === null
                ? 'sem base anterior'
                : `${variacao > 0 ? '+' : ''}${variacao}% vs. anterior`}
            </span>
          }
        />
        <Cartao
          icone={Receipt}
          rotulo="Ticket médio"
          valor={carregando ? '—' : formatBRL(resumo.ticket.valor)}
          detalhe={
            <span className="text-muted">
              {resumo.ticket.base} {resumo.ticket.base === 1 ? 'orçamento' : 'orçamentos'}
            </span>
          }
        />
        <Cartao
          icone={TrendingUp}
          rotulo="Conversão"
          valor={
            carregando || resumo.conversao.percentual === null
              ? '—'
              : `${resumo.conversao.percentual}%`
          }
          detalhe={
            <span className="text-muted">
              {resumo.conversao.pagos} de {resumo.conversao.enviados} enviados
            </span>
          }
        />
        <Cartao
          icone={Wallet}
          rotulo="Anterior"
          valor={carregando ? '—' : formatBRL(resumo.faturamentoAnterior)}
          detalhe={<span className="text-muted">mesmo nº de dias</span>}
        />
      </div>

      {/* Custo de material e margem. Linha própria: é outra conta, com outra data — ver a nota. */}
      <div className="grid grid-cols-2 gap-2.5">
        <Cartao
          icone={PackageOpen}
          rotulo="Custo de material"
          valor={carregando ? '—' : formatBRL(material.custo)}
          detalhe={
            <span className={material.comMateriais < material.realizados ? 'text-warn' : 'text-muted'}>
              {material.realizados === 0
                ? 'nenhum atendimento no período'
                : `${material.comMateriais} de ${material.realizados} atendimento${
                    material.realizados === 1 ? '' : 's'
                  } com materiais`}
            </span>
          }
        />
        <Cartao
          icone={PiggyBank}
          rotulo="Margem"
          valor={carregando ? '—' : formatBRL(margem.valor)}
          detalhe={
            <span className={margem.valor < 0 ? 'text-danger' : 'text-muted'}>
              {margem.percentual === null
                ? 'sem faturamento no período'
                : `${margem.percentual}% do faturamento`}
            </span>
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
      <p className="text-body text-muted leading-relaxed">
        O faturamento soma os <strong className="text-ink-soft">orçamentos pagos</strong>, pela
        data do pagamento. É o único valor que o sistema guarda fechado e datado — o atendimento não
        tem preço gravado, e usar o preço do catálogo faria o faturamento de um mês fechado mudar
        sozinho a cada reajuste. <strong className="text-ink-soft">Atendimento realizado sem
        orçamento emitido não entra nesta conta.</strong>
      </p>
      <p className="text-body text-muted leading-relaxed">
        O custo de material soma os materiais registrados nos atendimentos, pela{' '}
        <strong className="text-ink-soft">data do atendimento</strong>, com o preço do dia em que
        foram registrados. A margem é o faturamento menos esse custo — datas diferentes de
        propósito: um pacote pago em março e feito até junho entra em março no faturamento e mês a
        mês no custo. <strong className="text-ink-soft">Atendimento sem materiais registrados
        conta como custo zero</strong>, por isso o cartão mostra quantos foram registrados.
      </p>
      <p className="text-body text-muted leading-relaxed">
        Os valores dos materiais aparecem só aqui. O acompanhamento, preenchido ao lado da
        paciente, registra material e quantidade sem preço — o custo é calculado com o preço de
        cada produto no Estoque, e o material digitado à mão fica com{' '}
        <strong className="text-ink-soft">falta valor</strong> até ser completado na lista acima.
      </p>

      <MateriaisDoAtendimentoPanel
        atendimento={materiaisDe}
        onFechar={() => setMateriaisDe(null)}
        catalogo={catalogProcedures}
      />
    </div>
  );
};
