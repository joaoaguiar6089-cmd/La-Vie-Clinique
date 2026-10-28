import React, { useMemo } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  Copy,
  Eye,
  NotebookPen,
  Pencil,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { AnamnesisRecord, Attendance, EvaluationRecord, Quote } from '../../types';
import { ItemDaLinha } from '../../utils/pacienteResumo';
import { formatDateOnly } from '../../utils/formatters';
import { isQuoteEditavel, podeSubstituir } from '../../utils/quoteCalc';
import { acompanhamentoComRegistro, acompanhamentoVisivel } from '../../utils/fichasClinicas';
import { ROTULO_DO_STATUS, nomeDosProcedimentos } from '../../utils/attendances';
import {
  ContextoDaJornada,
  Tratamento,
  anamnesesDoOrcamento,
  atendimentosDaAvaliacao,
  avaliacaoDaAnamnese,
  proximosAgendamentos,
} from '../../utils/passosDaJornada';
import { QuoteDesfecho } from '../quotes/QuoteDesfecho';
import { AcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { BottomSheet } from '../common/BottomSheet';

/** De quem e de quê é o passo que o painel oferece começar. */
export interface AlvoDoPasso {
  pacienteId?: string;
  pacienteNome: string;
  tratamento?: Tratamento;
}

/**
 * O que o painel do evento pede a quem hospeda a linha. A tela Hoje e a página da paciente abrem
 * os formulários cada uma do seu jeito; o painel só sabe qual passo cabe em cada evento.
 */
export interface AcoesDaLinha {
  orcamento: Pick<
    AcoesDeOrcamento,
    'abrirPrevia' | 'abrirCompartilhamento' | 'abrirEdicao' | 'abrirDuplicacao' | 'abrirSubstituicao'
  >;
  onVerAnamnese: (r: AnamnesisRecord) => void;
  onVerAvaliacao: (r: EvaluationRecord) => void;
  /** O acompanhamento, com os materiais usados dentro. */
  onAcompanhamento: (a: Attendance) => void;
  /** "Ir para a anamnese": a janela que pergunta se é para enviar o link ou preencher aqui. */
  onNovaAnamnese: (alvo: AlvoDoPasso & { templateId?: string }) => void;
  onNovaAvaliacao: (alvo: AlvoDoPasso) => void;
  onAgendar: (alvo: AlvoDoPasso & { professionalId?: string }) => void;
  /**
   * A avaliação sem atendimento depois dela: o acompanhamento precisa de uma visita, então o
   * formulário de atendimento abre com a data e a hora por preencher — e, salvo, abre o
   * acompanhamento dela.
   */
  onRegistrarVisita: (av: EvaluationRecord) => void;
  onAbrirNaAgenda: (a: Attendance) => void;
  /** Só na linha da clínica: na página da paciente, ela já está aberta. */
  onAbrirPaciente?: (pacienteId: string) => void;
}

const ROTULO_DO_TIPO = {
  atendimento: 'Atendimento',
  anamnese: 'Anamnese',
  avaliacao: 'Avaliação',
  orcamento: 'Orçamento',
} as const;

const botaoPrincipal =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-ink text-white text-body font-semibold hover:bg-black transition-colors';
const botaoSecundario =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-line bg-card text-body font-semibold text-ink hover:border-brand transition-colors';
const botaoFeito =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border bg-ok-bg text-ok border-ok-line hover:border-ok text-body font-semibold transition-colors';

const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="px-2 py-3 border-t border-line first:border-t-0">
    <h3 className="text-label uppercase tracking-wider font-semibold text-muted mb-2">{titulo}</h3>
    {children}
  </section>
);

/** Uma linha "o que é · quando" com as ações à direita (ou abaixo, se não couberem). */
const LinhaDoPasso: React.FC<{ titulo: string; detalhe?: string; children?: React.ReactNode }> = ({
  titulo,
  detalhe,
  children,
}) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1.5">
    <div className="min-w-0 flex-1 basis-40">
      <p className="text-body-lg font-medium text-ink truncate">{titulo}</p>
      {detalhe && <p className="text-body text-muted truncate">{detalhe}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

const quandoDoAtendimento = (a: Attendance): string =>
  `${formatDateOnly(a.data)}${a.hora ? ` às ${a.hora}` : ''}`;

/** O dia em que a anamnese foi preenchida — a criação do registro, que é quando ela respondeu. */
const diaDoPreenchimento = (r: AnamnesisRecord): string =>
  (r.createdAt || r.dataAtendimento || '').slice(0, 10);

const statusDoAtendimento = (a: Attendance): string =>
  a.status ? ROTULO_DO_STATUS[a.status] : 'Realizado';

interface PainelDoEventoProps {
  item: ItemDaLinha;
  contexto: ContextoDaJornada;
  acoes: AcoesDaLinha;
  onFechar: () => void;
}

/**
 * O painel que um evento da linha do tempo abre: o documento, o passo seguinte da jornada e os
 * próximos agendamentos da paciente.
 *
 * Existe para a plataforma dar o caminho do atendimento. Antes, tocar um orçamento abria o PDF e
 * a equipe tinha de lembrar sozinha que o passo seguinte era mandar a anamnese — e ir procurar o
 * link em outra tela. Aqui o passo seguinte está embaixo do documento, já feito (com a data e o
 * "Ver") ou por fazer (com o botão que faz).
 *
 * Toda ação fecha o painel antes de abrir o que pediu: os formulários abrem por cima da tela, e
 * uma folha esquecida aberta atrás deles voltaria a aparecer ao fechar.
 */
export const PainelDoEvento: React.FC<PainelDoEventoProps> = ({ item, contexto, acoes, onFechar }) => {
  const fazer = (acao: () => void) => () => {
    onFechar();
    acao();
  };

  const pacienteId = item.ref.pacienteId;
  const pacienteNome = item.ref.pacienteNome;
  const excetoId = item.tipo === 'atendimento' ? item.ref.id : undefined;
  const agendamentos = useMemo(
    () => proximosAgendamentos(contexto.atendimentos, pacienteId, excetoId),
    [contexto.atendimentos, pacienteId, excetoId]
  );

  /** O procedimento que vai semeado para o próximo passo e para o agendamento. */
  const tratamento: Tratamento | undefined =
    item.tipo === 'orcamento'
      ? item.ref.itens[0] && {
          procedureId: item.ref.itens[0].procedureId,
          procedimentoNome: item.ref.itens[0].titulo,
        }
      : item.tipo === 'anamnese'
      ? { procedureId: item.ref.procedimentoId, procedimentoNome: item.ref.procedimentoNome }
      : { procedureId: item.ref.procedureId, procedimentoNome: item.ref.procedimentoNome };

  const cabecalho = (
    <div>
      <p className="text-label uppercase tracking-wider font-semibold text-brand">
        {ROTULO_DO_TIPO[item.tipo]} · {formatDateOnly(item.data)}
        {item.tipo === 'atendimento' && item.ref.hora ? ` · ${item.ref.hora}` : ''}
      </p>
      {acoes.onAbrirPaciente && pacienteId ? (
        <button
          type="button"
          onClick={fazer(() => acoes.onAbrirPaciente!(pacienteId))}
          className="block max-w-full text-left font-serif-luxury text-title text-ink truncate underline-offset-2 hover:text-brand hover:underline transition-colors"
        >
          {pacienteNome}
        </button>
      ) : (
        <h2 className="font-serif-luxury text-title text-ink truncate">{pacienteNome}</h2>
      )}
      <p className="text-body text-ink-soft truncate">
        {item.titulo}
        {item.profissional ? ` · ${item.profissional}` : ''}
      </p>
    </div>
  );

  return (
    <BottomSheet
      aberto
      onFechar={onFechar}
      titulo={`${ROTULO_DO_TIPO[item.tipo]} de ${pacienteNome}`}
      cabecalho={cabecalho}
      noCentroNoComputador
    >
      {item.tipo === 'orcamento' && (
        <PassosDoOrcamento q={item.ref} contexto={contexto} acoes={acoes} fazer={fazer} />
      )}
      {item.tipo === 'anamnese' && (
        <PassosDaAnamnese r={item.ref} contexto={contexto} acoes={acoes} fazer={fazer} />
      )}
      {item.tipo === 'avaliacao' && (
        <PassosDaAvaliacao av={item.ref} contexto={contexto} acoes={acoes} fazer={fazer} />
      )}
      {item.tipo === 'atendimento' && <PassosDoAtendimento a={item.ref} acoes={acoes} fazer={fazer} />}

      <Secao titulo="Próximos agendamentos">
        {agendamentos.length === 0 ? (
          <p className="text-body text-muted py-1.5">Nenhum agendamento marcado.</p>
        ) : (
          // Rola dentro do quadro: quem tem um pacote de dez sessões marcado não empurra o botão
          // de agendar para fora da tela.
          <ul className="max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-line divide-y divide-line">
            {agendamentos.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <CalendarClock className="w-4 h-4 text-brand shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold text-ink tabular-nums">{quandoDoAtendimento(a)}</p>
                  <p className="text-body text-muted truncate">
                    {nomeDosProcedimentos(a)}
                    {a.profissionalNome ? ` · ${a.profissionalNome}` : ''}
                  </p>
                </div>
                {a.confirmadoEm && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-xs bg-ok-bg text-ok border border-ok-line text-label font-semibold uppercase tracking-wider">
                    Confirmado
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={fazer(() =>
            acoes.onAgendar({
              pacienteId,
              pacienteNome,
              tratamento,
              professionalId: item.tipo === 'atendimento' ? item.ref.professionalId : undefined,
            })
          )}
          className={`${botaoSecundario} w-full mt-2`}
        >
          <CalendarPlus className="w-4 h-4" />
          Agendar
        </button>
      </Secao>
    </BottomSheet>
  );
};

interface PassosProps {
  contexto: ContextoDaJornada;
  acoes: AcoesDaLinha;
  fazer: (acao: () => void) => () => void;
}

const PassosDoOrcamento: React.FC<PassosProps & { q: Quote }> = ({ q, contexto, acoes, fazer }) => {
  const anamneses = useMemo(() => anamnesesDoOrcamento(q, contexto), [q, contexto]);
  const editavel = isQuoteEditavel(q);

  return (
    <>
      <Secao titulo="Orçamento">
        <LinhaDoPasso
          titulo={`Orçamento ${q.numero}`}
          detalhe={`Emitido em ${formatDateOnly((q.dataEmissao || q.createdAt || '').slice(0, 10))}`}
        />
        <div className="mt-1 mb-2">
          <QuoteDesfecho quote={q} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fazer(() => acoes.orcamento.abrirPrevia(q))} className={botaoPrincipal}>
            <Eye className="w-4 h-4" />
            Visualizar
          </button>
          <button
            type="button"
            onClick={fazer(() => acoes.orcamento.abrirCompartilhamento(q))}
            className={botaoSecundario}
          >
            <Share2 className="w-4 h-4" />
            Compartilhar link
          </button>
          {editavel ? (
            <button type="button" onClick={fazer(() => acoes.orcamento.abrirEdicao(q))} className={botaoSecundario}>
              <Pencil className="w-4 h-4" />
              Editar
            </button>
          ) : (
            podeSubstituir(q) && (
              <button
                type="button"
                onClick={fazer(() => acoes.orcamento.abrirSubstituicao(q))}
                title="Cria um novo com número próprio"
                className={botaoSecundario}
              >
                <RefreshCw className="w-4 h-4" />
                Substituir
              </button>
            )
          )}
        </div>
        <button
          type="button"
          onClick={fazer(() => acoes.orcamento.abrirDuplicacao(q))}
          className="inline-flex items-center gap-1.5 min-h-[40px] mt-1 text-body font-semibold text-ink-soft hover:text-brand transition-colors"
        >
          <Copy className="w-4 h-4" />
          Duplicar para esta ou outra cliente
        </button>
      </Secao>

      {anamneses.length > 0 && (
        <Secao titulo="Próximo passo · Anamnese">
          {anamneses.map((g) =>
            g.feita ? (
              <LinhaDoPasso
                key={g.chave}
                titulo={g.rotulo}
                detalhe={`Preenchida em ${formatDateOnly(diaDoPreenchimento(g.feita))}`}
              >
                <button type="button" onClick={fazer(() => acoes.onVerAnamnese(g.feita!))} className={botaoFeito}>
                  <Eye className="w-4 h-4" />
                  Ver
                </button>
              </LinhaDoPasso>
            ) : (
              <LinhaDoPasso key={g.chave} titulo={g.rotulo} detalhe="Ainda sem anamnese">
                <button
                  type="button"
                  onClick={fazer(() =>
                    acoes.onNovaAnamnese({
                      pacienteId: q.pacienteId,
                      pacienteNome: q.pacienteNome,
                      tratamento: g.tratamento,
                      templateId: g.templateId,
                    })
                  )}
                  className={botaoPrincipal}
                >
                  Ir para a anamnese
                </button>
              </LinhaDoPasso>
            )
          )}
        </Secao>
      )}
    </>
  );
};

const PassosDaAnamnese: React.FC<PassosProps & { r: AnamnesisRecord }> = ({ r, contexto, acoes, fazer }) => {
  const avaliacao = useMemo(() => avaliacaoDaAnamnese(r, contexto), [r, contexto]);
  const online = r.origemPreenchimento === 'online_paciente';

  return (
    <>
      <Secao titulo="Anamnese">
        <LinhaDoPasso
          titulo={r.procedimentoNome}
          detalhe={`Preenchida em ${formatDateOnly(diaDoPreenchimento(r))}${
            online ? ' · pela cliente, pelo link' : ' · na clínica'
          }`}
        >
          <button type="button" onClick={fazer(() => acoes.onVerAnamnese(r))} className={botaoPrincipal}>
            <Eye className="w-4 h-4" />
            Ver
          </button>
        </LinhaDoPasso>
      </Secao>

      {/* A avaliação é a resposta à anamnese e a base do procedimento: o passo aparece mesmo sem
          ficha de avaliação cadastrada — o formulário puxa perguntas de outra ficha ali dentro. */}
      <Secao titulo="Próximo passo · Avaliação">
        {avaliacao ? (
          <LinhaDoPasso
            titulo={avaliacao.procedimentoNome}
            detalhe={`Feita em ${formatDateOnly(avaliacao.dataAtendimento.slice(0, 10))}`}
          >
            <button type="button" onClick={fazer(() => acoes.onVerAvaliacao(avaliacao))} className={botaoFeito}>
              <Eye className="w-4 h-4" />
              Ver
            </button>
          </LinhaDoPasso>
        ) : (
          <LinhaDoPasso titulo={r.procedimentoNome} detalhe="Ainda sem avaliação">
            <button
              type="button"
              onClick={fazer(() =>
                acoes.onNovaAvaliacao({
                  pacienteId: r.pacienteId,
                  pacienteNome: r.pacienteNome,
                  tratamento: { procedureId: r.procedimentoId, procedimentoNome: r.procedimentoNome },
                })
              )}
              className={botaoPrincipal}
            >
              Preencher avaliação
            </button>
          </LinhaDoPasso>
        )}
      </Secao>
    </>
  );
};

/** O botão do acompanhamento de uma visita — verde quando já tem registro. */
const BotaoDoAcompanhamento: React.FC<{ a: Attendance; onClick: () => void }> = ({ a, onClick }) => {
  const registrado = acompanhamentoComRegistro(a);
  return (
    <button type="button" onClick={onClick} className={registrado ? botaoFeito : botaoPrincipal}>
      <NotebookPen className="w-4 h-4" />
      {registrado ? 'Ver' : 'Preencher'}
    </button>
  );
};

const PassosDaAvaliacao: React.FC<PassosProps & { av: EvaluationRecord }> = ({ av, contexto, acoes, fazer }) => {
  const atendimentos = useMemo(() => atendimentosDaAvaliacao(av, contexto), [av, contexto]);

  return (
    <>
      <Secao titulo="Avaliação">
        <LinhaDoPasso
          titulo={av.procedimentoNome}
          detalhe={`Feita em ${formatDateOnly(av.dataAtendimento.slice(0, 10))}`}
        >
          <button type="button" onClick={fazer(() => acoes.onVerAvaliacao(av))} className={botaoPrincipal}>
            <Eye className="w-4 h-4" />
            Ver
          </button>
        </LinhaDoPasso>
      </Secao>

      <Secao titulo="Próximo passo · Relatório">
        {atendimentos.length === 0 ? (
          <>
            <p className="text-body text-muted pb-2">
              O relatório é de uma visita, e ainda não há atendimento registrado depois desta
              avaliação.
            </p>
            <button type="button" onClick={fazer(() => acoes.onRegistrarVisita(av))} className={`${botaoPrincipal} w-full`}>
              <NotebookPen className="w-4 h-4" />
              Registrar o atendimento
            </button>
          </>
        ) : (
          <>
            <ul className="max-h-56 overflow-y-auto overscroll-contain">
              {atendimentos.map((a) => (
                <li key={a.id}>
                  <LinhaDoPasso
                    titulo={nomeDosProcedimentos(a)}
                    detalhe={`${quandoDoAtendimento(a)}${a.profissionalNome ? ` · ${a.profissionalNome}` : ''}`}
                  >
                    <BotaoDoAcompanhamento a={a} onClick={fazer(() => acoes.onAcompanhamento(a))} />
                  </LinhaDoPasso>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={fazer(() => acoes.onRegistrarVisita(av))}
              className="inline-flex items-center gap-1.5 min-h-[40px] mt-1 text-body font-semibold text-ink-soft hover:text-brand transition-colors"
            >
              <NotebookPen className="w-4 h-4" />
              Registrar outro atendimento
            </button>
          </>
        )}
      </Secao>
    </>
  );
};

const PassosDoAtendimento: React.FC<Omit<PassosProps, 'contexto'> & { a: Attendance }> = ({ a, acoes, fazer }) => (
  <>
    <Secao titulo="Atendimento">
      <LinhaDoPasso titulo={quandoDoAtendimento(a)} detalhe={statusDoAtendimento(a)}>
        {/* Mudar o status fica na agenda: a linha do tempo não tem ação sem volta. */}
        <button type="button" onClick={fazer(() => acoes.onAbrirNaAgenda(a))} className={botaoSecundario}>
          <CalendarClock className="w-4 h-4" />
          Abrir na agenda
        </button>
      </LinhaDoPasso>
    </Secao>

    <Secao titulo="Próximo passo · Relatório">
      {acompanhamentoVisivel(a) ? (
        <LinhaDoPasso
          titulo={acompanhamentoComRegistro(a) ? 'Relatório registrado' : 'Relatório por preencher'}
          detalhe="Fotos, respostas e materiais usados na sessão"
        >
          <BotaoDoAcompanhamento a={a} onClick={fazer(() => acoes.onAcompanhamento(a))} />
        </LinhaDoPasso>
      ) : (
        <p className="text-body text-muted py-1.5">O relatório abre depois da visita.</p>
      )}
    </Secao>
  </>
);
