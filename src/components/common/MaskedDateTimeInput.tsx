import React from 'react';

/**
 * Campos de data e hora digitados, com máscara própria em vez de `input type="date"`.
 *
 * O nativo mostra o formato do idioma do **aparelho**: a mesma tela vira "09/17/2026" no celular
 * de quem tem o sistema em inglês e "17/09/2026" no de quem tem em português — e a equipe digita
 * a data errada sem perceber. Aqui o formato é o mesmo em todo lugar, o teclado que sobe é o
 * numérico, e a pessoa só digita os números.
 *
 * O preço é perder o calendário do sistema. Para uma recepção que digita a data do dia dezenas
 * de vezes, previsibilidade vale mais que o seletor.
 *
 * Duas escolhas deliberadas sobre o comportamento da máscara:
 *
 * - **Só formata, nunca corrige.** Ela põe as barras e os dois-pontos e para por aí. Máscara que
 *   conserta enquanto se digita é a que mais irrita: a pessoa apaga um número para arrumar e o
 *   campo reescreve sozinho por cima. "31/02" entra sem reclamar; quem recusa é o salvar.
 * - **Sem atalho de ano curto.** São os 8 dígitos, sempre. Aceitar 6 deixaria "26" ambíguo entre
 *   1926 e 2026 num campo que também serve para data de nascimento algum dia.
 */

const inputBase =
  'w-full glass-input px-3 py-2 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden';

/** "17092026" -> "17/09/2026". Só insere separador, não valida nada. */
export const mascararData = (bruto: string): string => {
  const d = bruto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

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
      className="block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1"
      htmlFor={id}
    >
      {label}
    </label>
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
      className={`${inputBase} ${erro ? 'border-red-300' : ''}`}
    />
    {erro ? (
      <p className="mt-1 text-body text-red-600">{erro}</p>
    ) : ajuda ? (
      <p className="mt-1 text-body text-gray-400">{ajuda}</p>
    ) : null}
  </div>
);

export const MaskedDateInput: React.FC<CampoProps> = (props) => (
  <Campo {...props} placeholder="dd/mm/aaaa" mascara={mascararData} />
);

export const MaskedTimeInput: React.FC<CampoProps> = (props) => (
  <Campo {...props} placeholder="hh:mm" mascara={mascararHora} />
);
