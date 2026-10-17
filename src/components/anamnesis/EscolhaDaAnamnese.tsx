import React from 'react';
import { ClipboardList, Share2 } from 'lucide-react';
import { BottomSheet } from '../common/BottomSheet';

interface EscolhaDaAnamneseProps {
  aberto: boolean;
  onFechar: () => void;
  /** Para quem — some do texto quando a anamnese nasce sem paciente escolhida. */
  pacienteNome?: string;
  procedimentoNome?: string;
  onPreencherAqui: () => void;
  onEnviarLink: () => void;
  /** Sem ficha-modelo cadastrada não há link a montar. */
  podeEnviarLink: boolean;
}

/**
 * A primeira pergunta de toda anamnese nova: ela preenche em casa, pelo link, ou aqui, com a
 * paciente ao lado?
 *
 * Fica na frente de todo lugar que começa uma anamnese — o "+" do celular, a busca, a página da
 * paciente, a lista de fichas, o catálogo e o painel da linha do tempo. Antes, cada um desses
 * caminhos abria direto o formulário, e o link morava num menu à parte que a equipe tinha de
 * lembrar que existia. As duas saídas já existiam; esta janela só põe uma ao lado da outra.
 */
export const EscolhaDaAnamnese: React.FC<EscolhaDaAnamneseProps> = ({
  aberto,
  onFechar,
  pacienteNome,
  procedimentoNome,
  onPreencherAqui,
  onEnviarLink,
  podeEnviarLink,
}) => {
  const escolher = (acao: () => void) => () => {
    onFechar();
    acao();
  };

  return (
    <BottomSheet
      aberto={aberto}
      onFechar={onFechar}
      titulo="Nova anamnese"
      descricao={[pacienteNome, procedimentoNome].filter(Boolean).join(' · ') || undefined}
      noCentroNoComputador
    >
      <div className="grid grid-cols-2 gap-2.5 px-2 pb-3">
        <button
          type="button"
          onClick={escolher(onEnviarLink)}
          disabled={!podeEnviarLink}
          title={podeEnviarLink ? undefined : 'Cadastre um modelo de ficha antes de enviar o link'}
          className="rounded-[20px] bg-ink text-white p-4 flex flex-col gap-[18px] text-left hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Share2 className="w-[22px] h-[22px]" />
          <span>
            <span className="block text-[15px] font-bold">Enviar link</span>
            <span className="block text-[12px] text-cream/75">ela preenche em casa</span>
          </span>
        </button>
        <button
          type="button"
          onClick={escolher(onPreencherAqui)}
          className="rounded-[20px] bg-card border border-ink/10 text-ink p-4 flex flex-col gap-[18px] text-left hover:border-ink/30 transition-colors"
        >
          <ClipboardList className="w-[22px] h-[22px]" />
          <span>
            <span className="block text-[15px] font-bold">Preencher aqui</span>
            <span className="block text-[12px] text-ink-soft">com a paciente ao lado</span>
          </span>
        </button>
      </div>
    </BottomSheet>
  );
};
