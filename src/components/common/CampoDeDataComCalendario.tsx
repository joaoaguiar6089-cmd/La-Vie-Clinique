import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DataISO, hojeISO } from '../../utils/attendances';
import { deslocarMeses, diasDoMesDe } from '../../utils/agenda';
import { BottomSheet } from './BottomSheet';
import { dataParaISO, isoParaData } from './MaskedDateTimeInput';

const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface CampoDeDataComCalendarioProps {
  id: string;
  label: string;
  /** A data como o formulário guarda: "dd/mm/aaaa" (ver `MaskedDateTimeInput`). Vazio = sem data. */
  value: string;
  onChange: (valor: string) => void;
  erro?: string;
  autoFocus?: boolean;
  /** Último dia que se pode escolher — a visita que já aconteceu não tem data no futuro. */
  maximo?: DataISO;
}

/** "2026-10-18" -> "18/10/26": cabe na coluna estreita do formulário sem cortar o ano. */
const dataCurta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/**
 * O campo de data que abre um calendário ao toque, no lugar de digitar.
 *
 * O calendário é o da casa, e não o `input type="date"` do sistema: o nativo muda de formato
 * conforme o idioma do aparelho ("10/18/2026" no celular em inglês), e é esse o erro que a
 * máscara digitada evitava. Aqui o mês sai em português em todo aparelho, a semana começa no
 * domingo como na agenda, e escolher um dia já fecha a folha.
 *
 * No celular a folha sobe do rodapé, onde está o polegar; no computador abre no meio da tela.
 */
export const CampoDeDataComCalendario: React.FC<CampoDeDataComCalendarioProps> = ({
  id,
  label,
  value,
  onChange,
  erro,
  autoFocus,
  maximo,
}) => {
  const hoje = hojeISO();
  const escolhida = dataParaISO(value);
  const [aberto, setAberto] = useState(false);
  /** Um dia qualquer do mês mostrado — o primeiro, para as setas nunca pularem mês. */
  const [referencia, setReferencia] = useState(`${(escolhida || hoje).slice(0, 7)}-01`);

  // Esc fecha só o calendário: sem isto, o painel do formulário embaixo também ouviria a tecla e
  // tentaria fechar junto.
  useEffect(() => {
    if (!aberto) return;
    const noEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAberto(false);
    };
    window.addEventListener('keydown', noEsc, true);
    return () => window.removeEventListener('keydown', noEsc, true);
  }, [aberto]);

  const abrir = () => {
    setReferencia(`${(escolhida || hoje).slice(0, 7)}-01`);
    setAberto(true);
  };

  const escolher = (dia: DataISO) => {
    onChange(isoParaData(dia));
    setAberto(false);
  };

  const dias = diasDoMesDe(referencia);
  const mesDaReferencia = referencia.slice(0, 7);
  const nomeDoMes = new Date(`${referencia}T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const podeAvancar = !maximo || deslocarMeses(referencia, 1).slice(0, 7) <= maximo.slice(0, 7);
  const hojeDisponivel = !maximo || hoje <= maximo;

  return (
    <div>
      <button
        id={id}
        type="button"
        onClick={abrir}
        autoFocus={autoFocus}
        aria-haspopup="dialog"
        aria-invalid={!!erro}
        aria-label={`${label}: ${
          escolhida
            ? new Date(`${escolhida}T12:00:00`).toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : 'escolher no calendário'
        }`}
        className={`w-full text-left block rounded-[14px] px-3.5 pt-2 pb-2.5 min-h-[56px] transition-colors focus:outline-none focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ink ${
          erro ? 'bg-danger-bg ring-2 ring-danger' : 'bg-line-soft hover:bg-[#E6E2DA]'
        }`}
      >
        <span className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">{label}</span>
        <span
          className={`block text-[16px] tabular-nums whitespace-nowrap ${
            escolhida ? 'font-semibold text-ink' : 'font-medium text-muted'
          }`}
        >
          {escolhida ? dataCurta(escolhida) : value || 'Escolher'}
        </span>
      </button>
      {erro && <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p>}

      <BottomSheet
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={label}
        noCentroNoComputador
        cabecalho={
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setReferencia((r) => deslocarMeses(r, -1))}
              aria-label="Mês anterior"
              className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-line-soft transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="font-sans text-[17px] font-bold text-ink first-letter:uppercase" aria-live="polite">
              {nomeDoMes}
            </h2>
            <button
              type="button"
              onClick={() => setReferencia((r) => deslocarMeses(r, 1))}
              disabled={!podeAvancar}
              aria-label="Próximo mês"
              className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-line-soft transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        }
      >
        <div className="px-2 pb-2">
          <div className="grid grid-cols-7 gap-y-1 text-center" role="grid" aria-label={nomeDoMes}>
            {DIAS_DA_SEMANA.map((d, i) => (
              <span key={i} className="text-[12px] font-semibold text-muted pb-1" aria-hidden>
                {d}
              </span>
            ))}
            {dias.map((dia) => {
              const doMes = dia.slice(0, 7) === mesDaReferencia;
              const ehHoje = dia === hoje;
              const selecionado = dia === escolhida;
              const bloqueado = !!maximo && dia > maximo;
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => escolher(dia)}
                  disabled={bloqueado}
                  aria-pressed={selecionado}
                  aria-label={`${new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'long',
                  })}${ehHoje ? ', hoje' : ''}`}
                  className={`mx-auto w-full max-w-11 aspect-square rounded-full flex items-center justify-center text-[15px] tabular-nums transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${
                    selecionado
                      ? 'bg-ink text-white font-bold'
                      : ehHoje
                      ? 'ring-2 ring-inset ring-ink text-ink font-bold hover:bg-line-soft'
                      : doMes
                      ? 'text-ink font-medium hover:bg-line-soft'
                      : 'text-[#BDB7AD] font-medium hover:bg-line-soft'
                  }`}
                >
                  {Number(dia.slice(8, 10))}
                </button>
              );
            })}
          </div>

          {hojeDisponivel && (
            <button
              type="button"
              onClick={() => escolher(hoje)}
              className="mt-3 w-full min-h-[44px] rounded-xl border border-line text-body-lg font-semibold text-ink hover:border-ink/40 transition-colors"
            >
              Hoje
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
};
