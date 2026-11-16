import React, { useMemo } from 'react';
import { UserCheck } from 'lucide-react';
import { Patient } from '../../types';
import { cadastrosParecidos, nomeCombina } from '../../utils/pacientesRepetidos';
import { AvisoDeCadastroParecido } from '../patients/AvisoDeCadastroParecido';
import { CampoComLista } from '../common/CampoComLista';
import { OpcaoDaLista } from '../common/JanelaDeEscolha';

interface PatientSearchSelectProps {
  patients: Patient[];
  pacienteId?: string;
  pacienteNome: string;
  onSelect: (paciente: { id?: string; nome: string; contato?: string }) => void;
}

/**
 * A paciente escolhida do cadastro. Escolher da lista vincula o `pacienteId`; usar um nome que não
 * está na lista vale como paciente avulso, sem vínculo — que é o caso de quem ainda não fez
 * cadastro.
 *
 * Nome usado sem escolher da lista que bate com um cadastro ganha o aviso de cadastro parecido,
 * com o vínculo a um toque. É o que evita a segunda Heloíse: na agenda, o nome solto vira um
 * cadastro novo ao salvar.
 *
 * A lista abre na janela de escolha, no meio da tela (ver `CampoComLista`).
 */
export const PatientSearchSelect: React.FC<PatientSearchSelectProps> = ({
  patients,
  pacienteId,
  pacienteNome,
  onSelect,
}) => {
  // Acento não conta: "heloise" acha a Heloíse — antes não achava, e ela ganhava outro cadastro. O
  // telefone também acha, pelos dígitos.
  const opcoesDaBusca = (busca: string): OpcaoDaLista[] => {
    const digitos = busca.replace(/\D/g, '');
    const base = busca.trim()
      ? patients.filter(
          (p) =>
            nomeCombina(busca, p.nome) ||
            (!!digitos && (p.contato || '').replace(/\D/g, '').includes(digitos))
        )
      : patients;
    return base.map((p) => ({ valor: p.id, rotulo: p.nome, lateral: p.contato || undefined }));
  };

  const selecionado = pacienteId ? patients.find((p) => p.id === pacienteId) : undefined;

  const parecidos = useMemo(
    () =>
      !pacienteId && pacienteNome.trim()
        ? cadastrosParecidos({ nome: pacienteNome }, patients)
        : [],
    [patients, pacienteId, pacienteNome]
  );

  return (
    <CampoComLista
      rotulo="Paciente"
      texto={pacienteNome}
      placeholder="Buscar no cadastro ou digitar um nome"
      opcoes={opcoesDaBusca}
      valor={pacienteId}
      onEscolher={(o) => {
        const p = patients.find((x) => x.id === o.valor);
        onSelect({ id: o.valor, nome: p?.nome || o.rotulo, contato: p?.contato });
      }}
      textoLivre={{
        rotulo: (t) => `Usar “${t}” sem cadastro`,
        detalhe: 'Paciente avulso — não fica vinculado a um cadastro',
        onUsar: (t) => onSelect({ id: undefined, nome: t, contato: undefined }),
      }}
      onLimpar={() => onSelect({ id: undefined, nome: '', contato: undefined })}
      rotuloDoLimpar="Limpar paciente"
      placeholderDaBusca="Nome ou telefone"
      vazio="Nenhuma paciente no cadastro com esse nome."
      limite={60}
    >
      {selecionado ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft flex items-center gap-1">
          <UserCheck className="w-3.5 h-3.5 text-ok" />
          Vinculado ao cadastro de {selecionado.nome}
        </p>
      ) : parecidos.length > 0 ? (
        <AvisoDeCadastroParecido
          className="mt-1.5"
          parecidos={parecidos}
          rotuloDaAcao="Usar este cadastro"
          onUsar={(p) => onSelect({ id: p.id, nome: p.nome, contato: p.contato })}
        />
      ) : pacienteNome.trim() ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft">
          Paciente avulso — não ficará vinculado a um cadastro
        </p>
      ) : null}
    </CampoComLista>
  );
};
