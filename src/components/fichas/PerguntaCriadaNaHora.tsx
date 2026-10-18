import React from 'react';
import { Plus, X } from 'lucide-react';
import { AnamnesisQuestion, QuestionFieldType } from '../../types';
import { QuestionFieldRenderer } from '../anamnesis/QuestionFieldRenderer';
import {
  TIPOS_DO_CAMPO_LIVRE,
  campoTemOpcoes,
  opcoesDoCampo,
  trocarTipoDoCampo,
} from '../../utils/gruposExtras';

/**
 * Uma pergunta criada na hora do preenchimento: a profissional escreve a pergunta, escolhe o
 * tipo (texto, sim/não, escolha, número, data, escala), as opções quando é de escolha, e responde
 * logo embaixo — com o mesmo campo das perguntas da ficha-modelo.
 */
export const PerguntaCriadaNaHora: React.FC<{
  pergunta: AnamnesisQuestion;
  valor: any;
  /** O campo recém-criado — a pergunta já abre com o cursor. */
  focar?: boolean;
  onMudarPergunta: (pergunta: AnamnesisQuestion) => void;
  /** Trocar o tipo apaga a resposta: "sim" não serve de resposta a uma data. */
  onTrocarTipo: (pergunta: AnamnesisQuestion) => void;
  onResponder: (valor: any) => void;
  onRemover: () => void;
}> = ({ pergunta, valor, focar, onMudarPergunta, onTrocarTipo, onResponder, onRemover }) => {
  const opcoes = pergunta.opcoes || [];
  const comOpcoes = campoTemOpcoes(pergunta.tipo_campo);
  const nome = pergunta.texto.trim() || 'esta pergunta';

  const mudarOpcao = (indice: number, texto: string) =>
    onMudarPergunta({ ...pergunta, opcoes: opcoes.map((o, i) => (i === indice ? texto : o)) });

  const tirarOpcao = (indice: number) =>
    onMudarPergunta({ ...pergunta, opcoes: opcoes.filter((_, i) => i !== indice) });

  return (
    <div className="rounded-xl border border-[rgba(26,26,26,.12)] bg-surface p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          value={pergunta.texto}
          onChange={(e) => onMudarPergunta({ ...pergunta, texto: e.target.value })}
          autoFocus={focar}
          maxLength={160}
          placeholder="Pergunta ou campo — ex.: Energia usada"
          aria-label="Texto da pergunta"
          className="flex-1 min-w-0 bg-transparent px-1 py-1 text-[14px] font-semibold text-ink placeholder:text-gray-400 placeholder:font-normal focus:outline-none border-b border-transparent focus:border-brand transition-colors"
        />
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Tirar ${nome}`}
          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-surface-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <span className="shrink-0">Tipo de resposta</span>
        <select
          value={pergunta.tipo_campo}
          onChange={(e) => onTrocarTipo(trocarTipoDoCampo(pergunta, e.target.value as QuestionFieldType))}
          className="min-w-0 flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg border border-[rgba(26,26,26,.15)] bg-card text-[13px] font-semibold text-ink focus:outline-none focus:border-brand"
        >
          {TIPOS_DO_CAMPO_LIVRE.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </label>

      {comOpcoes && (
        <div className="space-y-1.5">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400">
            Opções
          </span>
          {opcoes.map((opcao, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={opcao}
                onChange={(e) => mudarOpcao(i, e.target.value)}
                placeholder={`Opção ${i + 1}`}
                aria-label={`Opção ${i + 1} de ${nome}`}
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[rgba(26,26,26,.15)] bg-card text-[14px] text-ink placeholder:text-gray-400 focus:outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => tirarOpcao(i)}
                aria-label={`Tirar a opção ${i + 1}`}
                className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-surface-2 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onMudarPergunta({ ...pergunta, opcoes: [...opcoes, ''] })}
            className="inline-flex items-center gap-1 min-h-[32px] text-[13px] font-semibold text-brand hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Opção
          </button>
        </div>
      )}

      {/* A resposta, com o mesmo campo das perguntas da ficha-modelo. Escolha sem opção ainda não
          tem o que marcar. */}
      {(!comOpcoes || opcoesDoCampo(pergunta).length > 0) && (
        <QuestionFieldRenderer
          question={{ ...pergunta, texto: pergunta.texto.trim() || 'Resposta', opcoes: opcoesDoCampo(pergunta) }}
          value={valor}
          onChange={onResponder}
          hideMandatoryAsterisk
          ocultarRotulo
        />
      )}
    </div>
  );
};
