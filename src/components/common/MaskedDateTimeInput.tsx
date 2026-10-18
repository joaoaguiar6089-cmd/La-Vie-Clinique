import React from 'react';

/**
 * Data e hora no formato da casa ("dd/mm/aaaa", "hh:mm"), em vez de `input type="date"`.
 *
 * O nativo mostra o formato do idioma do **aparelho**: a mesma tela vira "09/17/2026" no celular
 * de quem tem o sistema em inglês e "17/09/2026" no de quem tem em português — e a equipe digita
 * a data errada sem perceber. Aqui o formato é o mesmo em todo lugar.
 *
 * A hora é digitada, com o teclado numérico. A data se escolhe num calendário próprio, também em
 * português em todo aparelho — ver `CampoDeDataComCalendario`, que guarda o mesmo "dd/mm/aaaa".
 *
 * A máscara da hora **só formata, nunca corrige**: põe os dois-pontos e para por aí. Máscara que
 * conserta enquanto se digita é a que mais irrita — a pessoa apaga um número para arrumar e o
 * campo reescreve sozinho por cima. "25:00" entra sem reclamar; quem recusa é o salvar.
 */

const inputBase =
  'w-full min-w-0 bg-transparent border-0 p-0 text-[16px] font-semibold text-ink tabular-nums placeholder:text-muted placeholder:font-medium focus:outline-none';

/** "1430" -> "14:30". */
export const mascararHora = (bruto: string): string => {
  const d = bruto.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
};

/**
 * "17/09/2026" -> "2026-09-17", ou `null` quando a data não existe no calendário.
 *
 * A checagem de volta (`getDate()` bater com o dia digitado) é o que pega 31/02: o construtor do
 * `Date` aceita e rola para 03/03 calado.
 */
export const dataParaISO = (mascarada: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mascarada.trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  if (
    d.getFullYear() !== Number(ano) ||
    d.getMonth() !== Number(mes) - 1 ||
    d.getDate() !== Number(dia)
  ) {
    return null;
  }
  return `${ano}-${mes}-${dia}`;
};

/** "2026-09-17" -> "17/09/2026", para abrir o formulário com o que já estava gravado. */
export const isoParaData = (iso?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** `true` quando "14:30" existe num relógio. Vazio é válido — a obrigatoriedade é de quem chama. */
export const horaValida = (mascarada: string): boolean => {
  const texto = mascarada.trim();
  if (!texto) return true;
  const m = /^(\d{2}):(\d{2})$/.exec(texto);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
};

interface CampoProps {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  erro?: string;
  autoFocus?: boolean;
  /** Texto abaixo do campo quando não há erro — a dica de formato, por exemplo. */
  ajuda?: string;
}

/**
 * O campo no desenho preenchido dos formulários — rótulo dentro da caixa, sem contorno, e o
 * contorno preto só em foco (o mesmo do `CampoTinta`).
 */
const Campo: React.FC<CampoProps & { placeholder: string; mascara: (v: string) => string }> = ({
  id,
  label,
  value,
  onChange,
  erro,
  autoFocus,
  ajuda,
  placeholder,
  mascara,
}) => (
  <div>
    <label
      htmlFor={id}
      className={`block rounded-[14px] px-3.5 pt-2 pb-2.5 min-h-[56px] cursor-text transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ink ${
        erro ? 'bg-danger-bg ring-2 ring-danger' : 'bg-line-soft'
      }`}
    >
      <span className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">{label}</span>
      <input
        id={id}
        type="text"
        /* `inputMode="numeric"` sobe o teclado de números no celular sem virar `type="number"`,
           que traria as setinhas e aceitaria "e" e sinal de menos. */
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(mascara(e.target.value))}
        aria-invalid={!!erro}
        className={inputBase}
      />
    </label>
    {erro ? (
      <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p>
    ) : ajuda ? (
      <p className="mt-1 px-1 text-[13px] text-ink-soft">{ajuda}</p>
    ) : null}
  </div>
);

export const MaskedTimeInput: React.FC<CampoProps> = (props) => (
  <Campo {...props} placeholder="hh:mm" mascara={mascararHora} />
);
