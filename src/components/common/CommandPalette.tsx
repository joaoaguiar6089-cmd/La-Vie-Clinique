import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  FileText,
  Receipt,
  Search,
  Syringe,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { Patient, Procedure, Quote } from '../../types';
import { formatBRL } from '../../utils/formatters';

/**
 * Busca global — achar qualquer paciente, procedimento, orçamento ou ação de qualquer tela.
 *
 * Cmd/Ctrl+K no desktop; no celular ela abre em tela cheia pelo campo de busca da tela Hoje,
 * porque lá não existe atalho de teclado e o campo já é o gesto natural.
 *
 * **Não faz leitura nenhuma no Firestore.** Pacientes, catálogo e orçamentos já vivem em
 * memória no `App`, assinados uma vez por sessão; a busca é um filtro sobre essas listas. É o
 * que permite o resultado aparecer enquanto se digita, sem debounce nem estado de carregando.
 */

/** Sem acento e sem caixa: digitar "jose" precisa encontrar "José". */
const chave = (texto: string): string =>
  (texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Só os dígitos, para casar "11988887777" com "(11) 98888-7777". */
const digitos = (texto: string): string => (texto || '').replace(/\D/g, '');

export type AcaoRapida = 'novo-agendamento' | 'nova-paciente' | 'novo-orcamento';

/** Um resultado da busca. O `tipo` decide o ícone, o rótulo da seção e o que o Enter faz. */
type Resultado =
  | { tipo: 'acao'; id: AcaoRapida; titulo: string; detalhe: string }
  | { tipo: 'paciente'; id: string; titulo: string; detalhe: string }
  | { tipo: 'procedimento'; id: string; titulo: string; detalhe: string }
  | { tipo: 'orcamento'; id: string; titulo: string; detalhe: string };

const ACOES: { id: AcaoRapida; titulo: string; detalhe: string }[] = [
  { id: 'novo-agendamento', titulo: 'Novo agendamento', detalhe: 'Marcar um horário na agenda' },
  { id: 'nova-paciente', titulo: 'Nova paciente', detalhe: 'Cadastrar uma paciente' },
  { id: 'novo-orcamento', titulo: 'Novo orçamento', detalhe: 'Montar um orçamento' },
];

const ICONE: Record<Resultado['tipo'] | AcaoRapida, React.ElementType> = {
  acao: Search,
  paciente: User,
  procedimento: Syringe,
  orcamento: Receipt,
  'novo-agendamento': CalendarPlus,
  'nova-paciente': UserPlus,
  'novo-orcamento': FileText,
};

const SECAO: Record<Resultado['tipo'], string> = {
  acao: 'Ações rápidas',
  paciente: 'Pacientes',
  procedimento: 'Procedimentos',
  orcamento: 'Orçamentos',
};

/** Teto por seção. Trinta pacientes numa lista de resultados ninguém lê; os cinco primeiros, sim. */
const TETO_POR_SECAO = 6;

interface CommandPaletteProps {
  aberta: boolean;
  onFechar: () => void;
  pacientes: Patient[];
  procedimentos: Procedure[];
  orcamentos: Quote[];
  onAbrirPaciente: (pacienteId: string) => void;
  onAbrirProcedimento: (procedureId: string) => void;
  onAbrirOrcamento: (quoteId: string) => void;
  onAcaoRapida: (acao: AcaoRapida) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  aberta,
  onFechar,
  pacientes,
  procedimentos,
  orcamentos,
  onAbrirPaciente,
  onAbrirProcedimento,
  onAbrirOrcamento,
  onAcaoRapida,
}) => {
  const [termo, setTermo] = useState('');
  const [indice, setIndice] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Cada abertura começa limpa: a busca anterior não é contexto, é lixo.
  useEffect(() => {
    if (aberta) {
      setTermo('');
      setIndice(0);
      // O foco precisa esperar a pintura, senão o input ainda não existe no DOM.
      const t = setTimeout(() => campoRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [aberta]);

  const resultados = useMemo<Resultado[]>(() => {
    const t = chave(termo);
    // Campo vazio: as três coisas que a equipe mais começa do zero.
    if (!t) return ACOES.map((a) => ({ tipo: 'acao' as const, ...a }));

    const numeros = digitos(termo);
    const fora: Resultado[] = [];

    // Pacientes — nome e telefone. O telefone só entra na busca quando o termo tem dígito,
    // senão "ana" casaria com qualquer número que contivesse a sequência vazia.
    const achados = pacientes.filter((p) => {
      if (chave(p.nome).includes(t)) return true;
      return numeros.length >= 3 && digitos(p.contato).includes(numeros);
    });
    achados.slice(0, TETO_POR_SECAO).forEach((p) =>
      fora.push({
        tipo: 'paciente',
        id: p.id,
        titulo: p.nome,
        detalhe: p.contato || 'sem telefone no cadastro',
      })
    );

    procedimentos
      .filter((p) => chave(p.title).includes(t) || chave(p.category).includes(t))
      .slice(0, TETO_POR_SECAO)
      .forEach((p) =>
        fora.push({
          tipo: 'procedimento',
          id: p.id,
          titulo: p.title,
          detalhe: `${p.category} · ${formatBRL(p.promotionalPrice || p.price)}`,
        })
      );

    // Orçamento se acha pelo número ("2026-0148", ou só "148") e pelo nome de quem recebeu.
    orcamentos
      .filter((q) => chave(q.numero).includes(t) || chave(q.pacienteNome).includes(t))
      .slice(0, TETO_POR_SECAO)
      .forEach((q) =>
        fora.push({
          tipo: 'orcamento',
          id: q.id,
          titulo: `Orçamento ${q.numero}`,
          detalhe: `${q.pacienteNome} · ${formatBRL(q.total)}`,
        })
      );

    return fora;
  }, [termo, pacientes, procedimentos, orcamentos]);

  // Filtrar enquanto digita encurta a lista: o cursor fora dela viraria um Enter sem destino.
  useEffect(() => {
    setIndice((atual) => (atual >= resultados.length ? 0 : atual));
  }, [resultados.length]);

  const escolher = (r: Resultado) => {
    onFechar();
    if (r.tipo === 'acao') onAcaoRapida(r.id);
    else if (r.tipo === 'paciente') onAbrirPaciente(r.id);
    else if (r.tipo === 'procedimento') onAbrirProcedimento(r.id);
    else onAbrirOrcamento(r.id);
  };

  const noTeclado = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onFechar();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (resultados.length === 0) return;
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      const proximo = (indice + passo + resultados.length) % resultados.length;
      setIndice(proximo);
      // Mantém o item escolhido visível ao percorrer a lista com o teclado.
      listaRef.current
        ?.querySelector<HTMLElement>(`[data-indice="${proximo}"]`)
        ?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const escolhido = resultados[indice];
      if (escolhido) escolher(escolhido);
    }
  };

  if (!aberta) return null;

  let secaoAnterior: Resultado['tipo'] | null = null;

  return (
    <div
      className="fixed inset-0 z-[70] flex sm:items-start sm:justify-center sm:pt-[12vh] bg-black/50 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Busca global"
      onMouseDown={(e) => {
        // Só o clique no véu fecha; o de dentro do painel não deve tirar o foco do campo.
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      {/* No celular ocupa a tela toda; no desktop é um painel curto perto do topo. */}
      <div
        className="w-full sm:max-w-xl bg-card sm:rounded-card border-line sm:border shadow-2xl flex flex-col max-h-full sm:max-h-[70vh] overflow-hidden"
        onKeyDown={noTeclado}
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-line shrink-0">
          <Search className="w-[18px] h-[18px] text-muted shrink-0" />
          <input
            ref={campoRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar paciente, procedimento ou orçamento…"
            className="flex-1 min-w-0 py-4 bg-transparent text-body-lg text-ink placeholder:text-muted focus:outline-none"
            aria-label="Termo de busca"
            autoComplete="off"
            /* O teclado do celular não deve sugerir correção num nome próprio. */
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onFechar}
            className="w-11 h-11 -mr-2 shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label="Fechar busca"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={listaRef} className="flex-1 overflow-y-auto py-2">
          {resultados.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-body-lg text-ink font-medium">Nada encontrado</p>
              <p className="text-body text-muted mt-1">
                Tente parte do nome, do telefone ou o número do orçamento.
              </p>
            </div>
          ) : (
            resultados.map((r, i) => {
              const Icone = ICONE[r.tipo === 'acao' ? r.id : r.tipo];
              const novaSecao = r.tipo !== secaoAnterior;
              secaoAnterior = r.tipo;
              return (
                <React.Fragment key={`${r.tipo}-${r.id}`}>
                  {novaSecao && (
                    <p className="px-4 pt-3 pb-1.5 text-label uppercase tracking-wider font-semibold text-muted">
                      {SECAO[r.tipo]}
                    </p>
                  )}
                  <button
                    type="button"
                    data-indice={i}
                    onMouseMove={() => setIndice(i)}
                    onClick={() => escolher(r)}
                    className={`w-full flex items-center gap-3 px-4 min-h-[52px] py-2 text-left transition-colors ${
                      i === indice ? 'bg-brand-bg' : 'hover:bg-surface-2'
                    }`}
                  >
                    <span className="w-9 h-9 shrink-0 rounded-lg bg-surface-2 text-brand flex items-center justify-center">
                      <Icone className="w-[18px] h-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-lg text-ink font-medium truncate">
                        {r.titulo}
                      </span>
                      <span className="block text-body text-muted truncate">{r.detalhe}</span>
                    </span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* A dica do teclado só faz sentido onde existe teclado. */}
        <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-t border-line bg-surface shrink-0 text-label text-muted">
          <span>
            <kbd className="font-sans font-semibold text-ink">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="font-sans font-semibold text-ink">Enter</kbd> abrir
          </span>
          <span>
            <kbd className="font-sans font-semibold text-ink">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
};
