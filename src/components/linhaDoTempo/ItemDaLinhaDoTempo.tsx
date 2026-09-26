import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Eye,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Receipt,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { AnamnesisRecord, Attendance, EvaluationRecord, Quote } from '../../types';
import { ItemDaLinha } from '../../utils/pacienteResumo';
import { formatBRL, formatDateOnly } from '../../utils/formatters';
import { isQuoteEditavel, podeSubstituir } from '../../utils/quoteCalc';
import { acompanhamentoComRegistro, acompanhamentoVisivel } from '../../utils/fichasClinicas';
import { anamneseFechada } from '../../utils/evaluations';
import { ROTULO_DO_STATUS } from '../../utils/attendances';
import { QuoteDesfecho } from '../quotes/QuoteDesfecho';
import { AcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { BottomSheet, ItemDaFolha } from '../common/BottomSheet';

/**
 * O que a linha precisa para oferecer os atalhos. Quem hospeda a linha (a tela Hoje, a página da
 * paciente) abre os modais; a linha só sabe quais atalhos cabem em cada item.
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
}

interface Atalho {
  id: string;
  rotulo: string;
  /** Linha pequena na folha do celular — "Cria um novo com número próprio", por exemplo. */
  detalhe?: string;
  icone: React.ElementType;
  onClick: () => void;
  /** Já preenchido — o atalho vira uma pastilha verde, como o botão da agenda. */
  preenchido?: boolean;
  /** Fica à vista também no celular. Os demais vão para o "⋯". */
  principal?: boolean;
}

/**
 * Os atalhos de cada tipo de item — os mesmos das telas próprias de cada documento.
 *
 * Excluir e cancelar ficam de fora de propósito: a linha do tempo é para agir rápido, e ação sem
 * volta mora na tela do documento, onde se vê tudo antes de apertar.
 */
export const atalhosDoItem = (item: ItemDaLinha, acoes: AcoesDaLinha): Atalho[] => {
  if (item.tipo === 'atendimento') {
    const a = item.ref;
    // Um atalho só: os materiais usados moram dentro do acompanhamento, e o custo deles fica no
    // Financeiro — a linha do tempo é aberta ao lado da paciente.
    if (!acompanhamentoVisivel(a)) return [];
    const registrado = acompanhamentoComRegistro(a);
    return [
      {
        id: 'acompanhamento',
        rotulo: registrado ? 'Ver acompanhamento' : 'Preencher acompanhamento',
        icone: NotebookPen,
        onClick: () => acoes.onAcompanhamento(a),
        preenchido: registrado,
        principal: true,
      },
    ];
  }

  if (item.tipo === 'anamnese') {
    return [
      { id: 'ver', rotulo: 'Ver ficha', icone: Eye, onClick: () => acoes.onVerAnamnese(item.ref), principal: true },
    ];
  }

  if (item.tipo === 'avaliacao') {
    return [
      { id: 'ver', rotulo: 'Ver ficha', icone: Eye, onClick: () => acoes.onVerAvaliacao(item.ref), principal: true },
    ];
  }

  const q: Quote = item.ref;
  const lista: Atalho[] = [
    { id: 'ver', rotulo: 'Visualizar', icone: Eye, onClick: () => acoes.orcamento.abrirPrevia(q), principal: true },
    { id: 'compartilhar', rotulo: 'Compartilhar link', icone: Share2, onClick: () => acoes.orcamento.abrirCompartilhamento(q) },
  ];
  if (isQuoteEditavel(q)) {
    lista.push({ id: 'editar', rotulo: 'Editar rascunho', icone: Pencil, onClick: () => acoes.orcamento.abrirEdicao(q) });
  }
  if (podeSubstituir(q)) {
    lista.push({
      id: 'substituir',
      rotulo: 'Substituir',
      detalhe: 'Cria um novo com número próprio',
      icone: RefreshCw,
      onClick: () => acoes.orcamento.abrirSubstituicao(q),
    });
  }
  lista.push({
    id: 'duplicar',
    rotulo: 'Duplicar',
    detalhe: 'Para esta ou outra cliente',
    icone: Copy,
    onClick: () => acoes.orcamento.abrirDuplicacao(q),
  });
  return lista;
};

const ICONE_DO_TIPO = {
  atendimento: CalendarCheck,
  anamnese: ClipboardList,
  avaliacao: ClipboardCheck,
  orcamento: Receipt,
} as const;

const ROTULO_DO_TIPO = {
  atendimento: 'Atendimento',
  anamnese: 'Anamnese',
  avaliacao: 'Avaliação',
  orcamento: 'Orçamento',
} as const;

interface ItemDaLinhaDoTempoProps {
  item: ItemDaLinha;
  acoes: AcoesDaLinha;
  /**
   * Na linha da clínica, cada item diz de quem é — e o nome abre a ficha da paciente. Na página
   * da paciente, repetir o nome dela em toda linha seria ruído.
   */
  onAbrirPaciente?: (pacienteId: string) => void;
  /** Mostrar a data no item (a página da paciente) ou só a hora (a tela Hoje, agrupada por dia). */
  mostrarData?: boolean;
  /** Toque no título: o que "abrir este item" quer dizer em cada tela. */
  onAbrir?: (item: ItemDaLinha) => void;
}

/**
 * Um item da linha do tempo, com os atalhos à direita.
 *
 * O mesmo componente serve à linha da clínica (tela Hoje) e à da paciente (aba Resumo): as duas
 * são a mesma coisa em recortes diferentes, e com dois desenhos a equipe teria que aprender dois.
 *
 * No celular cabem dois atalhos por linha; os demais vão para o "⋯", que abre a folha de baixo.
 */
export const ItemDaLinhaDoTempo: React.FC<ItemDaLinhaDoTempoProps> = ({
  item,
  acoes,
  onAbrirPaciente,
  mostrarData,
  onAbrir,
}) => {
  const [folhaAberta, setFolhaAberta] = useState(false);
  const Icone = ICONE_DO_TIPO[item.tipo];
  const atalhos = atalhosDoItem(item, acoes);
  const temSecundarios = atalhos.some((a) => !a.principal);

  const hora = item.tipo === 'atendimento' ? item.ref.hora : undefined;
  const pacienteId = item.ref.pacienteId;
  const faltou = item.tipo === 'atendimento' && item.ref.status === 'faltou';
  const aguardando =
    item.tipo === 'anamnese' &&
    item.ref.origemPreenchimento === 'online_paciente' &&
    !anamneseFechada(item.ref);

  const detalhe =
    item.tipo === 'orcamento'
      ? `${formatBRL(item.ref.total)} · ${item.ref.itens.length} procedimento${
          item.ref.itens.length === 1 ? '' : 's'
        }`
      : item.profissional;

  return (
    <li className="relative pl-6">
      <span
        aria-hidden
        className="absolute -left-[9px] top-4 w-[18px] h-[18px] rounded-full bg-card border border-line flex items-center justify-center"
      >
        <Icone className="w-2.5 h-2.5 text-brand" />
      </span>

      <div className="flex items-start gap-2 py-2.5 pl-3 pr-1 rounded-lg hover:bg-surface-2 transition-colors">
        <div className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {(mostrarData || hora) && (
              <span className="text-body font-semibold text-brand tabular-nums shrink-0">
                {mostrarData ? formatDateOnly(item.data) : hora}
              </span>
            )}
            <span className="text-label uppercase tracking-wider text-muted">
              {ROTULO_DO_TIPO[item.tipo]}
            </span>
            {faltou && (
              <span className="px-1.5 py-0.5 rounded-xs bg-danger-bg text-danger border border-danger-line text-label font-semibold uppercase tracking-wider">
                {ROTULO_DO_STATUS.faltou}
              </span>
            )}
            {aguardando && (
              <span className="px-1.5 py-0.5 rounded-xs bg-amber-50 text-amber-700 border border-amber-200 text-label font-semibold uppercase tracking-wider truncate">
                Aguardando atendimento
              </span>
            )}
          </span>

          {onAbrirPaciente && (
            pacienteId ? (
              <button
                type="button"
                onClick={() => onAbrirPaciente(pacienteId)}
                className="block max-w-full text-left text-body-lg font-medium text-ink truncate hover:text-brand transition-colors"
              >
                {item.ref.pacienteNome}
              </button>
            ) : (
              <span className="block text-body-lg font-medium text-ink truncate">
                {item.ref.pacienteNome}
              </span>
            )
          )}

          {onAbrir ? (
            <button
              type="button"
              onClick={() => onAbrir(item)}
              className={`block max-w-full text-left truncate hover:text-brand transition-colors ${
                onAbrirPaciente ? 'text-body text-ink-soft' : 'text-body-lg text-ink'
              }`}
            >
              {item.titulo}
            </button>
          ) : (
            <span
              className={`block truncate ${
                onAbrirPaciente ? 'text-body text-ink-soft' : 'text-body-lg text-ink'
              }`}
            >
              {item.titulo}
            </span>
          )}

          {detalhe && <span className="block text-body text-muted truncate">{detalhe}</span>}

          {/* Pagou / recusou / comprovante — o mesmo controle da tela de Orçamentos. */}
          {item.tipo === 'orcamento' && (
            <div className="mt-1.5">
              <QuoteDesfecho quote={item.ref} />
            </div>
          )}
        </div>

        {atalhos.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            {atalhos.map((a) => {
              const IconeDoAtalho = a.icone;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={a.onClick}
                  title={a.detalhe ? `${a.rotulo} — ${a.detalhe}` : a.rotulo}
                  aria-label={`${a.rotulo}: ${item.titulo}`}
                  /* Preenchido = pastilha verde com borda, o mesmo par do botão de acompanhamento
                     da agenda. Só a cor do ícone mudando (verde-escuro × cinza-escuro) não se
                     distinguia de relance, e é de relance que a linha do tempo é lida. */
                  className={`${a.principal ? 'inline-flex' : 'hidden sm:inline-flex'} w-10 h-10 items-center justify-center rounded-lg border transition-colors ${
                    a.preenchido
                      ? 'bg-ok-bg text-ok border-ok-line hover:border-ok'
                      : 'border-transparent text-ink-soft hover:text-brand hover:bg-card'
                  }`}
                >
                  <IconeDoAtalho className="w-[18px] h-[18px]" />
                </button>
              );
            })}
            {temSecundarios && (
              <button
                type="button"
                onClick={() => setFolhaAberta(true)}
                aria-label={`Mais ações: ${item.titulo}`}
                className="sm:hidden inline-flex w-10 h-10 items-center justify-center rounded-lg text-muted hover:text-brand transition-colors"
              >
                <MoreHorizontal className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* No `body`: um ancestral com `transform` prenderia o `position: fixed` da folha. */}
      {folhaAberta &&
        createPortal(
          <BottomSheet
            aberto
            onFechar={() => setFolhaAberta(false)}
            titulo={item.titulo}
            descricao={item.ref.pacienteNome}
          >
            {atalhos.map((a) => (
              <ItemDaFolha
                key={a.id}
                icone={a.icone}
                rotulo={a.rotulo}
                descricao={a.detalhe}
                onClick={() => {
                  setFolhaAberta(false);
                  a.onClick();
                }}
              />
            ))}
          </BottomSheet>,
          document.body
        )}
    </li>
  );
};
