import React, { useEffect, useState } from 'react';
import { Layers, NotebookPen } from 'lucide-react';
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
  subscribeToFichasModelo,
  subscribeToPerguntasGeraisDaFicha,
} from '../../services/databaseService';
import { alvoDoRegistro } from '../../utils/fichasClinicas';
import { GeneralQuestionsManager } from '../anamnesis/GeneralQuestionsManager';
import { FichasModeloManager } from '../fichas/FichasModeloManager';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { PrintableFichaSheet } from '../fichas/PrintableFichaSheet';
import { ListaDeFichas } from '../fichas/ListaDeFichas';
import { ModuleTabs } from '../common/ModuleTabs';

interface AcompanhamentoModuleProps {
  clinicProfile: ClinicProfile;
  catalogProcedures: Procedure[];
  pacientes: Patient[];
  professionals: Professional[];
}

type Aba = 'registros' | 'fichas';

/**
 * A seção de Acompanhamento — o registro **depois** de cada atendimento.
 *
 * O acompanhamento é preenchido a partir do atendimento (a aba da paciente, a agenda, a linha do
 * tempo da tela Hoje); aqui mora o que ele pergunta: as perguntas gerais e as fichas-modelo por
 * procedimento ou categoria. A aba de registros é a consulta dos que já foram preenchidos.
 *
 * Mesma disposição da seção de avaliação, com os mesmos componentes: as duas telas precisam ser
 * reconhecíveis uma na outra.
 */
export const AcompanhamentoModule: React.FC<AcompanhamentoModuleProps> = ({
  clinicProfile,
  catalogProcedures,
  pacientes,
  professionals,
}) => {
  const [aba, setAba] = useState<Aba>('registros');
  const [fichas, setFichas] = useState<EvaluationTemplate[]>([]);
  const [gerais, setGerais] = useState<AnamnesisQuestion[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<EvaluationRecord | null>(null);
  const [imprimindo, setImprimindo] = useState<EvaluationTemplate | null>(null);
  const [criarFichaPara, setCriarFichaPara] = useState<{
    procedureId?: string;
    procedimentoNome: string;
  } | null>(null);

  useEffect(() => {
    // Coleções novas: enquanto as regras não forem publicadas, o Firestore recusa a leitura, e
    // é melhor dizer isso do que mostrar uma seção vazia que parece funcionar.
    const avisar = (e: Error) =>
      setErro(
        `Não foi possível carregar o acompanhamento: ${e.message}. Se for erro de permissão, ` +
          'publique as regras novas do Firebase.'
      );
    const pararFichas = subscribeToFichasModelo('acompanhamento', setFichas, avisar);
    const pararGerais = subscribeToPerguntasGeraisDaFicha('acompanhamento', setGerais, avisar);
    return () => {
      pararFichas();
      pararGerais();
    };
  }, []);

  const irParaCadastroDeFicha = (alvo: { procedureId?: string; procedimentoNome: string }) => {
    setAberto(null);
    setCriarFichaPara(alvo);
    setAba('fichas');
  };

  return (
    <div className="space-y-6">
      <ModuleTabs
        tabs={[
          { id: 'registros' as const, icon: NotebookPen, label: 'Registros' },
          { id: 'fichas' as const, icon: Layers, label: 'Fichas-modelo', count: fichas.length },
        ]}
        active={aba}
        onSelect={setAba}
      />

      {erro && (
        <p className="px-4 py-3 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700">
          {erro}
        </p>
      )}

      {aba === 'registros' ? (
        <ListaDeFichas
          tipo="acompanhamento"
          descricao="O registro de cada atendimento: foto, respostas e o que importar daquela sessão. É preenchido pelo ícone de acompanhamento na linha do atendimento — na ficha da paciente, na agenda ou na tela Hoje."
          onAbrir={setAberto}
        />
      ) : (
        <div className="space-y-8">
          <GeneralQuestionsManager
            questions={gerais}
            onSaveQuestion={(q) => savePerguntaGeralDaFicha('acompanhamento', q)}
            onSaveAllQuestions={(qs) => saveTodasPerguntasGeraisDaFicha('acompanhamento', qs)}
            onDeleteQuestion={(id) => deletePerguntaGeralDaFicha('acompanhamento', id)}
            titulo="Perguntas Gerais de Acompanhamento"
            selo="Todo Acompanhamento"
            subtitulo="Entram em todo acompanhamento, venha de onde vier o procedimento — inclusive nos procedimentos que ainda não têm ficha-modelo própria."
            // Lista vazia, e não `undefined`: ausente, o componente cai no padrão da anamnese.
            defaults={[]}
            idPrefixo="acg"
          />

          <FichasModeloManager
            tipo="acompanhamento"
            fichas={fichas}
            catalogo={catalogProcedures}
            onSalvar={(f) => saveFichaModelo('acompanhamento', f)}
            onExcluir={(id) => deleteFichaModelo('acompanhamento', id)}
            onImprimirEmBranco={setImprimindo}
            criarPara={criarFichaPara}
            onCriarParaConsumido={() => setCriarFichaPara(null)}
          />
        </div>
      )}

      {aberto && (
        <FichaFillModal
          tipo="acompanhamento"
          isOpen
          onClose={() => setAberto(null)}
          alvo={alvoDoRegistro(aberto)}
          paciente={pacientes.find((p) => p.id === aberto.pacienteId)}
          catalogo={catalogProcedures}
          professionals={professionals}
          clinicProfile={clinicProfile}
          onCadastrarFicha={irParaCadastroDeFicha}
        />
      )}

      {imprimindo && (
        <PrintableFichaSheet
          tipo="acompanhamento"
          ficha={imprimindo}
          gerais={gerais}
          clinicProfile={clinicProfile}
          onClose={() => setImprimindo(null)}
        />
      )}
    </div>
  );
};
