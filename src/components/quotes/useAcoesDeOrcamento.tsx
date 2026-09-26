import React, { useMemo, useState } from 'react';
import { ClinicProfile, EvaluationRecord, Patient, Procedure, Quote, QuoteDraft } from '../../types';
import { montarEspelhoPublico } from '../../utils/laserAreas';
import { marcarComoEnviadoSeRascunho, salvarOrcamento } from '../../services/quoteWorkflow';
import { saveCustoDoOrcamento } from '../../services/databaseService';
import { CustoEmEdicao, montarCustoDoOrcamento } from '../../utils/estoque';
import { QuoteFormModal } from './QuoteFormModal';
import { QuotePreviewModal } from './QuotePreviewModal';
import { QuoteShareModal } from './QuoteShareModal';

interface OpcoesDasAcoes {
  clinic: ClinicProfile;
  procedures: Procedure[];
  patients: Patient[];
  /** Falha que não impede a ação, mas precisa ser dita — o link saiu e o status não mudou. */
  onErro?: (mensagem: string) => void;
}

/** O formulário aberto: editando, duplicando, substituindo — ou um orçamento novo. */
interface FormularioAberto {
  quoteToEdit: Quote | null;
  seedFrom: Quote | null;
  substituindo: Quote | null;
  initialPatient?: Patient | null;
  /** A ficha de avaliação cujo consumo estimado pré-preenche o orçamento novo. */
  avaliacao?: EvaluationRecord | null;
}

export interface AcoesDeOrcamento {
  abrirNovo: (paciente?: Patient | null) => void;
  /**
   * Orçamento novo a partir de uma ficha de avaliação: a paciente, o procedimento e o consumo
   * estimado dela, com o item já "calculado por consumo de produto".
   */
  abrirDaAvaliacao: (avaliacao: EvaluationRecord, paciente?: Patient | null) => void;
  abrirEdicao: (quote: Quote) => void;
  abrirDuplicacao: (quote: Quote) => void;
  abrirSubstituicao: (quote: Quote) => void;
  abrirPrevia: (quote: Quote) => void;
  abrirCompartilhamento: (quote: Quote) => void;
  /** Os três modais — renderizar uma vez, em qualquer lugar da tela que usa as ações. */
  modais: React.ReactNode;
}

/**
 * As ações de um orçamento — visualizar, compartilhar, editar, duplicar, substituir — com os
 * modais que elas abrem.
 *
 * A tela de Orçamentos, a página da paciente e a linha do tempo da tela Hoje oferecem os mesmos
 * botões. Cada uma guardando o próprio estado de formulário, prévia e compartilhamento seria
 * três cópias da mesma lógica — e a substituição, que é a mais fácil de errar (número novo, os
 * dois ligados), divergiria primeiro.
 */
export const useAcoesDeOrcamento = ({
  clinic,
  procedures,
  patients,
  onErro,
}: OpcoesDasAcoes): AcoesDeOrcamento => {
  const [formulario, setFormulario] = useState<FormularioAberto | null>(null);
  const [previa, setPrevia] = useState<Quote | null>(null);
  const [compartilhando, setCompartilhando] = useState<Quote | null>(null);

  /** Mapa corporal do catálogo, para a página das áreas contratadas no PDF. */
  const mapaDoLaser = useMemo(() => montarEspelhoPublico(procedures, clinic), [procedures, clinic]);

  /**
   * O orçamento primeiro, o custo depois — o custo precisa do id que o orçamento ganha, e das
   * posições dos itens gravados. Se só o custo falhar, o orçamento continua salvo e a tela diz o
   * que ficou para trás, em vez de fazer a profissional salvar o orçamento de novo (o que, num
   * orçamento novo, criaria outro número).
   */
  const salvar = async (draft: QuoteDraft, existente?: Quote, custo?: CustoEmEdicao) => {
    const salvo = await salvarOrcamento(draft, { existente, substituindo: formulario?.substituindo });
    if (!custo) return;
    try {
      await saveCustoDoOrcamento(montarCustoDoOrcamento(salvo, custo));
    } catch (e) {
      onErro?.(
        `O orçamento ${salvo.numero} foi salvo, mas o custo de material não: ${(e as Error).message}. ` +
          'Se for erro de permissão, publique as regras novas do Firebase.'
      );
    }
  };

  const aoCompartilhar = async (quote: Quote) => {
    try {
      await marcarComoEnviadoSeRascunho(quote);
    } catch (e) {
      onErro?.(`O link foi compartilhado, mas o status não mudou: ${(e as Error).message}`);
    }
  };

  const modais = (
    <>
      <QuoteFormModal
        isOpen={!!formulario}
        onClose={() => setFormulario(null)}
        onSave={salvar}
        quoteToEdit={formulario?.quoteToEdit || null}
        seedFrom={formulario?.seedFrom || null}
        initialPatient={formulario?.initialPatient}
        avaliacaoDeOrigem={formulario?.avaliacao || null}
        procedures={procedures}
        patients={patients}
        clinic={clinic}
      />
      <QuotePreviewModal
        quote={previa}
        clinic={clinic}
        mapaCorporal={mapaDoLaser}
        onClose={() => setPrevia(null)}
      />
      <QuoteShareModal
        quote={compartilhando}
        clinic={clinic}
        onClose={() => setCompartilhando(null)}
        onCompartilhado={aoCompartilhar}
      />
    </>
  );

  return {
    abrirNovo: (paciente) =>
      setFormulario({ quoteToEdit: null, seedFrom: null, substituindo: null, initialPatient: paciente }),
    abrirDaAvaliacao: (avaliacao, paciente) =>
      setFormulario({
        quoteToEdit: null,
        seedFrom: null,
        substituindo: null,
        initialPatient: paciente,
        avaliacao,
      }),
    abrirEdicao: (quote) => setFormulario({ quoteToEdit: quote, seedFrom: null, substituindo: null }),
    abrirDuplicacao: (quote) => setFormulario({ quoteToEdit: null, seedFrom: quote, substituindo: null }),
    abrirSubstituicao: (quote) =>
      setFormulario({ quoteToEdit: null, seedFrom: quote, substituindo: quote }),
    abrirPrevia: setPrevia,
    abrirCompartilhamento: setCompartilhando,
    modais,
  };
};
