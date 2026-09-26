import React, { useState } from 'react';
import { ClipboardCheck, Layers, Plus } from 'lucide-react';
import {
  AnamnesisQuestion,
  ClinicProfile,
  EvaluationRecord,
  EvaluationTemplate,
  Patient,
  Procedure,
  Professional,
} from '../../types';
import {
  deleteFichaModelo,
  deletePerguntaGeralDaFicha,
  saveFichaModelo,
  savePerguntaGeralDaFicha,
  saveTodasPerguntasGeraisDaFicha,
} from '../../services/databaseService';
import { alvoDoRegistro } from '../../utils/fichasClinicas';
import { GeneralQuestionsManager } from '../anamnesis/GeneralQuestionsManager';
import { FichasModeloManager } from '../fichas/FichasModeloManager';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { PrintableFichaSheet } from '../fichas/PrintableFichaSheet';
import { ListaDeFichas } from '../fichas/ListaDeFichas';
import { ModuleTabs } from '../common/ModuleTabs';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { useAcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { EmissaoDeAvaliacao } from './EmissaoDeAvaliacao';

interface EvaluationsModuleProps {
  clinicProfile: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Fichas-modelo assinadas no App, como as de anamnese. */
  fichas: EvaluationTemplate[];
  pacientes: Patient[];
  professionals: Professional[];
  /** Perguntas gerais de avaliação, assinadas no App. */
  gerais: AnamnesisQuestion[];
  /** Profissional logada — já vem escolhida na emissão. */
  currentProfessionalId?: string;
}

type EvaluationTab = 'avaliacoes' | 'fichas';

/**
 * A tela de Fichas de Avaliação — a avaliação **antes** do procedimento.
 *
 * Duas abas: as avaliações emitidas, com o botão de emitir uma nova, e as fichas-modelo. A
 * avaliação não nasce de atendimento nenhum e não vira pendência: a profissional vem aqui quando
 * precisa, escolhe a paciente e o procedimento, e preenche no sistema ou imprime em branco. O
 * registro depois do atendimento é o acompanhamento, que tem a sua própria seção.
 */
export const EvaluationsModule: React.FC<EvaluationsModuleProps> = ({
  clinicProfile,
  catalogProcedures,
  fichas,
  pacientes,
  professionals,
  gerais,
  currentProfessionalId,
}) => {
  const [abaAtiva, setAbaAtiva] = useState<EvaluationTab>('avaliacoes');
  const [emitindo, setEmitindo] = useState(false);
  const [aberta, setAberta] = useState<EvaluationRecord | null>(null);
  const [imprimindo, setImprimindo] = useState<EvaluationTemplate | null>(null);
  const [criarFichaPara, setCriarFichaPara] = useState<{
    procedureId?: string;
    procedimentoNome: string;
  } | null>(null);

  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  /**
   * O orçamento que a avaliação monta a partir do consumo estimado. Abre aqui mesmo, por cima da
   * lista, como na página da paciente — sair para a tela de Orçamentos perderia o lugar.
   */
  const acoesDeOrcamento = useAcoesDeOrcamento({
    clinic: clinicProfile,
    procedures: catalogProcedures,
    patients: pacientes,
    onErro: (mensagem) => setConfirmacao(aviso('Nem tudo foi salvo', mensagem, 'perigo')),
  });
  const montarOrcamento = (avaliacao: EvaluationRecord) =>
    acoesDeOrcamento.abrirDaAvaliacao(
      avaliacao,
      pacientes.find((p) => p.id === avaliacao.pacienteId)
    );

  const irParaCadastroDeFicha = (alvo: { procedureId?: string; procedimentoNome: string }) => {
    setAberta(null);
    setCriarFichaPara(alvo);
    setAbaAtiva('fichas');
  };

  return (
    <div className="space-y-6">
      {/* Mesma barra da anamnese, literalmente o mesmo componente — ver `ModuleTabs`. */}
      <ModuleTabs
        tabs={[
          { id: 'avaliacoes' as const, icon: ClipboardCheck, label: 'Avaliações' },
          { id: 'fichas' as const, icon: Layers, label: 'Fichas-modelo', count: fichas.length },
        ]}
        active={abaAtiva}
        onSelect={setAbaAtiva}
      />

      {abaAtiva === 'avaliacoes' ? (
        <ListaDeFichas
          tipo="avaliacao"
          descricao="Avaliações feitas antes do procedimento. Emita uma nova para a paciente e preencha aqui no sistema, ou imprima a folha em branco para preencher à mão."
          acao={
            <button
              type="button"
              onClick={() => setEmitindo(true)}
              className="w-full md:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-hover shadow-xs active:scale-95 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova avaliação
            </button>
          }
          onAbrir={setAberta}
        />
      ) : (
        <div className="space-y-8">
          {/*
            Perguntas gerais acima dos modelos, como na anamnese: são herdadas por toda ficha de
            avaliação, então quem vem ajustar um modelo vê primeiro o que já entra nele sem
            ninguém pedir.
          */}
          <GeneralQuestionsManager
            questions={gerais}
            onSaveQuestion={(q) => savePerguntaGeralDaFicha('avaliacao', q)}
            onSaveAllQuestions={(qs) => saveTodasPerguntasGeraisDaFicha('avaliacao', qs)}
            onDeleteQuestion={(id) => deletePerguntaGeralDaFicha('avaliacao', id)}
            titulo="Perguntas Gerais de Avaliação"
            selo="Toda Avaliação"
            subtitulo="Entram em toda ficha de avaliação, venha de onde vier o procedimento — inclusive nos procedimentos que ainda não têm ficha-modelo própria."
            // Sem padrões: a clínica começa sem nenhuma pergunta geral cadastrada. Lista vazia, e
            // não `undefined` — ausente, o componente cai no padrão DA ANAMNESE, e o "restaurar"
            // trocaria as perguntas de avaliação pelas de histórico de saúde.
            defaults={[]}
            idPrefixo="avg"
          />

          <FichasModeloManager
            tipo="avaliacao"
            fichas={fichas}
            catalogo={catalogProcedures}
            onSalvar={(f) => saveFichaModelo('avaliacao', f)}
            onExcluir={(id) => deleteFichaModelo('avaliacao', id)}
            onImprimirEmBranco={setImprimindo}
            criarPara={criarFichaPara}
            onCriarParaConsumido={() => setCriarFichaPara(null)}
          />
        </div>
      )}

      {/* Sempre montado: é ele que guarda a ficha em preenchimento depois de o painel fechar. */}
      <EmissaoDeAvaliacao
        aberto={emitindo}
        onFechar={() => setEmitindo(false)}
        pacientes={pacientes}
        catalogo={catalogProcedures}
        professionals={professionals}
        clinic={clinicProfile}
        professionalIdPadrao={currentProfessionalId}
        onCadastrarFicha={irParaCadastroDeFicha}
        onMontarOrcamento={montarOrcamento}
      />

      {aberta && (
        <FichaFillModal
          tipo="avaliacao"
          isOpen
          onClose={() => setAberta(null)}
          alvo={alvoDoRegistro(aberta)}
          paciente={pacientes.find((p) => p.id === aberta.pacienteId)}
          catalogo={catalogProcedures}
          professionals={professionals}
          clinicProfile={clinicProfile}
          onCadastrarFicha={irParaCadastroDeFicha}
          onMontarOrcamento={montarOrcamento}
        />
      )}

      {imprimindo && (
        <PrintableFichaSheet
          tipo="avaliacao"
          ficha={imprimindo}
          gerais={gerais}
          clinicProfile={clinicProfile}
          onClose={() => setImprimindo(null)}
        />
      )}

      {acoesDeOrcamento.modais}
      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
