import React, { useMemo } from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { Patient } from '../../types';
import { formatDateShortYear } from '../../utils/formatters';
import { resumoDosTotais } from '../../utils/arquivoDePacientes';
import { nomeCombina } from '../../utils/pacientesRepetidos';
import { SkeletonLista } from '../common/Skeleton';
import { Avatar, MenuDeAcoes } from '../common/Tinta';

/**
 * O filtro "📁 Arquivo" da lista de Pacientes: quem foi excluída tendo documentos.
 *
 * Os documentos delas saíram de todas as seções e só são vistos daqui, abrindo a paciente. O "…"
 * da linha apaga de vez — o caminho das pacientes de teste.
 */
export const ListaDoArquivo: React.FC<{
  arquivadas: Patient[];
  carregando: boolean;
  busca: string;
  onAbrir: (pacienteId: string) => void;
  onExcluirDeVez: (paciente: Patient) => void;
}> = ({ arquivadas, carregando, busca, onAbrir, onExcluirDeVez }) => {
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return arquivadas;
    const digitos = termo.replace(/\D/g, '');
    return arquivadas.filter(
      (p) =>
        nomeCombina(termo, p.nome) ||
        (p.email || '').toLowerCase().includes(termo) ||
        (!!digitos && (p.contato || '').replace(/\D/g, '').includes(digitos))
    );
  }, [arquivadas, busca]);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-[16px] font-bold text-ink min-w-0">
          📁 Arquivo
          {lista.length !== arquivadas.length && (
            <span className="font-medium text-ink-soft"> · {lista.length} na busca</span>
          )}
        </h2>
      </div>

      <p className="-mt-2 text-[13px] text-ink-soft leading-relaxed">
        Pacientes excluídas que tinham documentos. Os documentos delas saíram das outras seções e
        só aparecem aqui, abrindo a paciente. Excluir daqui apaga de vez.
      </p>

      {carregando ? (
        <SkeletonLista linhas={3} />
      ) : lista.length === 0 ? (
        <div className="rounded-[20px] bg-card border border-ink/8 py-12 px-5 text-center">
          <Archive className="w-8 h-8 text-ink-soft mx-auto mb-3" />
          <p className="text-[14px] text-ink-soft">
            {arquivadas.length === 0
              ? 'O arquivo está vazio. Quando você excluir uma paciente que tem anamnese, orçamento, atendimento ou outro documento, ela e os documentos vêm para cá.'
              : 'Ninguém no arquivo com essa busca.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {lista.map((p) => {
            const resumo = resumoDosTotais(p.arquivoTotais);
            return (
              <li key={p.id} className="flex items-center gap-2 border-b border-ink/8">
                <button
                  type="button"
                  onClick={() => onAbrir(p.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left group"
                  title={`Abrir ${p.nome} no arquivo`}
                >
                  <Avatar nome={p.nome} className="opacity-60" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-ink truncate group-hover:underline underline-offset-2">
                      {p.nome}
                    </span>
                    <span className="block text-[13px] text-ink-soft truncate">
                      Arquivada em {formatDateShortYear(p.arquivadoEm)}
                      {resumo && ` · ${resumo}`}
                    </span>
                  </span>
                </button>
                <MenuDeAcoes
                  tom="discreto"
                  rotulo={`Mais ações para ${p.nome}`}
                  titulo={p.nome}
                  acoes={[
                    {
                      rotulo: 'Excluir permanentemente',
                      icone: Trash2,
                      tom: 'perigo',
                      descricao: 'Apaga o cadastro e todos os documentos',
                      onClick: () => onExcluirDeVez(p),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};
