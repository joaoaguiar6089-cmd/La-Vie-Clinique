import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, CircleCheckBig, X } from 'lucide-react';
import { AnamnesisQuestion } from '../../types';
import { useVoltarFecha } from '../../hooks/useVoltarFecha';

/**
 * A anamnese pergunta a pergunta — o modo de preencher com a paciente ao lado.
 *
 * O formulário inteiro, com vinte perguntas empilhadas, é bom para a profissional revisar; para a
 * paciente responder, com o celular na mão dela, é uma parede de texto. Aqui cada pergunta ocupa a
 * tela sozinha, em letra grande, com as respostas em blocos grandes — "Sim" e "Não" viram dois
 * quadrados que se acertam com o polegar. A barra do topo diz quanto falta.
 *
 * Não grava nada: escreve nas mesmas respostas do formulário e devolve a pessoa para ele, onde
 * ficam a foto, as observações e o salvar. Fechar no meio também não perde nada.
 */

export interface PerguntaDoFluxo {
  pergunta: AnamnesisQuestion;
  /** "Histórico de saúde", ou o nome do procedimento — o rótulo em bronze acima da pergunta. */
  grupo: string;
  valor: unknown;
  onResponder: (valor: unknown) => void;
}

interface PerguntaAPerguntaProps {
  aberto: boolean;
  perguntas: PerguntaDoFluxo[];
  /** "João Aguiar · Capilar" — quem está respondendo, e para quê. */
  contexto: string;
  /** Fecha e volta ao formulário, com o que já foi respondido. */
  onFechar: () => void;
  /** A última pergunta foi passada: volta ao formulário para a foto e o salvar. */
  onConcluir: () => void;
}

const respondida = (valor: unknown): boolean =>
  Array.isArray(valor) ? valor.length > 0 : valor !== undefined && valor !== null && valor !== '';

/** A resposta no desenho escuro, por tipo de campo. Mesmos valores do formulário claro. */
const Resposta: React.FC<{ pergunta: AnamnesisQuestion; valor: unknown; onResponder: (v: unknown) => void }> = ({
  pergunta,
  valor,
  onResponder,
}) => {
  const { id, tipo_campo, opcoes = [], escalaMax = 10 } = pergunta;
  const campoEscuro =
    'w-full rounded-2xl bg-cream/8 px-4 py-3.5 text-[16px] font-medium text-white placeholder:text-cream/55 border-0 focus:outline-none focus:ring-2 focus:ring-brand-light';

  if (tipo_campo === 'sim_nao') {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {(['Sim', 'Não'] as const).map((opcao) => {
          const escolhida = opcao === 'Sim' ? valor === 'Sim' || valor === true : valor === 'Não' || valor === false;
          return (
            <button
              key={opcao}
              type="button"
              aria-pressed={escolhida}
              onClick={() => onResponder(opcao)}
              className={`h-24 rounded-[20px] px-4 py-3.5 flex flex-col justify-between text-left transition-colors ${
                escolhida ? 'bg-cream text-ink' : 'border border-cream/25 text-white hover:border-cream/50'
              }`}
            >
              {escolhida ? <CircleCheckBig className="w-[22px] h-[22px]" /> : <span />}
              <span className="text-[20px] font-bold">{opcao}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (tipo_campo === 'unica_escolha' || tipo_campo === 'multipla_escolha') {
    const multipla = tipo_campo === 'multipla_escolha';
    const lista: string[] = Array.isArray(valor) ? (valor as string[]) : [];
    return (
      <div className="flex flex-col gap-2">
        {opcoes.map((opcao) => {
          const escolhida = multipla ? lista.includes(opcao) : valor === opcao;
          return (
            <button
              key={opcao}
              type="button"
              aria-pressed={escolhida}
              onClick={() =>
                onResponder(
                  multipla
                    ? escolhida
                      ? lista.filter((o) => o !== opcao)
                      : [...lista, opcao]
                    : opcao
                )
              }
              className={`min-h-[56px] rounded-2xl px-4 py-3 flex items-center gap-3 text-left text-[16px] font-semibold transition-colors ${
                escolhida ? 'bg-cream text-ink' : 'border border-cream/25 text-white hover:border-cream/50'
              }`}
            >
              <span
                className={`w-6 h-6 shrink-0 flex items-center justify-center border ${
                  multipla ? 'rounded-lg' : 'rounded-full'
                } ${escolhida ? 'bg-ink border-ink text-cream' : 'border-cream/40'}`}
              >
                {escolhida && <Check className="w-4 h-4" />}
              </span>
              {opcao}
            </button>
          );
        })}
        {multipla && <p className="text-[13px] text-cream/70 px-1">Pode marcar mais de uma.</p>}
      </div>
    );
  }

  if (tipo_campo === 'escala') {
    const maximo = escalaMax || 10;
    return (
      <div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: maximo }, (_, i) => i + 1).map((n) => {
            const escolhido = Number(valor) === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={escolhido}
                onClick={() => onResponder(n)}
                className={`h-14 rounded-2xl text-[20px] font-bold tabular-nums transition-colors ${
                  escolhido ? 'bg-cream text-ink' : 'border border-cream/25 text-white hover:border-cream/50'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[13px] text-cream/70 px-1">De 1 a {maximo}.</p>
      </div>
    );
  }

  if (tipo_campo === 'texto_longo') {
    return (
      <textarea
        id={`fluxo-${id}`}
        rows={4}
        value={(valor as string) || ''}
        onChange={(e) => onResponder(e.target.value)}
        placeholder="Escreva aqui"
        className={`${campoEscuro} resize-y leading-snug`}
      />
    );
  }

  if (tipo_campo === 'numero') {
    return (
      <input
        id={`fluxo-${id}`}
        type="number"
        inputMode="decimal"
        value={valor !== undefined && valor !== null ? String(valor) : ''}
        onChange={(e) => onResponder(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="0"
        className={`${campoEscuro} max-w-[200px] tabular-nums`}
      />
    );
  }

  if (tipo_campo === 'data') {
    return (
      <input
        id={`fluxo-${id}`}
        type="date"
        value={(valor as string) || ''}
        onChange={(e) => onResponder(e.target.value)}
        className={`${campoEscuro} max-w-[240px] [color-scheme:dark]`}
      />
    );
  }

  return (
    <input
      id={`fluxo-${id}`}
      type="text"
      value={(valor as string) || ''}
      onChange={(e) => onResponder(e.target.value)}
      placeholder="Escreva aqui"
      autoComplete="off"
      className={campoEscuro}
    />
  );
};

export const PerguntaAPergunta: React.FC<PerguntaAPerguntaProps> = ({
  aberto,
  perguntas,
  contexto,
  onFechar,
  onConcluir,
}) => {
  const [indice, setIndice] = useState(0);

  useVoltarFecha(aberto, onFechar);

  // Abre na primeira pergunta ainda sem resposta — voltar ao fluxo continua de onde parou.
  useEffect(() => {
    if (!aberto) return;
    const primeiraEmBranco = perguntas.findIndex((p) => !respondida(p.valor));
    setIndice(primeiraEmBranco === -1 ? 0 : primeiraEmBranco);
    // Só na abertura: responder não pode pular a pessoa para outra pergunta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const noTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', noTeclado);
    return () => document.removeEventListener('keydown', noTeclado);
  }, [aberto, onFechar]);

  if (!aberto || perguntas.length === 0) return null;

  const atual = perguntas[Math.min(indice, perguntas.length - 1)];
  const ultima = indice >= perguntas.length - 1;
  const total = perguntas.length;

  const avancar = () => {
    if (ultima) onConcluir();
    else setIndice((i) => i + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Anamnese pergunta a pergunta"
      className="fixed inset-0 z-[60] bg-ink text-cream flex flex-col animate-fadeIn"
    >
      <div className="shrink-0 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="max-w-xl w-full mx-auto h-14 px-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onFechar}
            aria-label="Voltar ao formulário"
            title="Voltar ao formulário — o que já foi respondido fica"
            className="w-11 h-11 -ml-1 shrink-0 rounded-full flex items-center justify-center text-cream hover:bg-white/10 transition-colors"
          >
            <X className="w-[22px] h-[22px]" />
          </button>
          {/* Quanto falta. Com muitas perguntas os segmentos ficariam finos demais — vira barra. */}
          {total <= 40 ? (
            <div className="flex-1 flex gap-[3px]" aria-hidden>
              {perguntas.map((p, i) => (
                <span
                  key={p.pergunta.id}
                  className={`flex-1 h-1 rounded-full ${i <= indice ? 'bg-brand-light' : 'bg-cream/18'}`}
                />
              ))}
            </div>
          ) : (
            <div className="flex-1 h-1 rounded-full bg-cream/18 overflow-hidden" aria-hidden>
              <div className="h-full bg-brand-light" style={{ width: `${((indice + 1) / total) * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-xl w-full mx-auto px-6 pt-7 pb-6 flex flex-col gap-6">
          <p className="text-[13px] font-semibold text-brand-light">
            {atual.grupo} · {indice + 1} de {total}
          </p>
          <h2
            key={atual.pergunta.id}
            className="font-serif-luxury text-[32px] sm:text-[36px] font-semibold leading-[1.12] text-white animate-fadeIn"
          >
            {atual.pergunta.texto}
          </h2>
          {atual.pergunta.ajuda && (
            <p className="-mt-3 text-[14px] leading-normal text-cream/75">{atual.pergunta.ajuda}</p>
          )}

          <Resposta
            key={`resposta-${atual.pergunta.id}`}
            pergunta={atual.pergunta}
            valor={atual.valor}
            onResponder={atual.onResponder}
          />

          <p className="text-[13px] font-medium text-cream/75">{contexto}</p>
        </div>
      </div>

      <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <div className="max-w-xl w-full mx-auto px-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => setIndice((i) => Math.max(0, i - 1))}
            disabled={indice === 0}
            aria-label="Pergunta anterior"
            className="w-14 h-14 shrink-0 rounded-full border border-cream/25 flex items-center justify-center text-cream hover:border-cream/50 transition-colors disabled:opacity-30"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={avancar}
            className="flex-1 h-14 rounded-full bg-brand-light text-ink text-[16px] font-bold hover:brightness-105 active:scale-[.99] transition"
          >
            {ultima ? 'Concluir as perguntas' : respondida(atual.valor) ? 'Próxima pergunta' : 'Pular por agora'}
          </button>
        </div>
      </div>
    </div>
  );
};
