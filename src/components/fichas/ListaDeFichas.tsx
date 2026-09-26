import React, { useEffect, useMemo, useState } from 'react';
import { Camera, FileText } from 'lucide-react';
import { EvaluationRecord } from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import { chaveDeNome } from '../../utils/templateMatching';
import { fotosDaSessao } from '../../utils/evaluations';
import { diasAntesDeHoje } from '../../utils/indicadores';
import { JANELAS_DA_LISTA, ROTULOS_DA_FICHA, TipoDeFicha } from '../../utils/fichasClinicas';
import { subscribeToRegistrosDeFicha } from '../../services/databaseService';
import { SkeletonLista } from '../common/Skeleton';
import { Avatar, CampoDeBusca, Chip } from '../common/Tinta';

interface ListaDeFichasProps {
  tipo: TipoDeFicha;
  /** O parágrafo de apresentação da lista. */
  descricao: string;
  /** O que vem antes da lista — o "Nova avaliação". */
  acao?: React.ReactNode;
  onAbrir: (registro: EvaluationRecord) => void;
}

/**
 * As fichas preenchidas de um tipo, das mais recentes para as mais antigas.
 *
 * A mesma lista serve à seção de avaliação e à de acompanhamento. Ela assina as fichas pela janela
 * escolhida — 30 dias por padrão — e não a coleção inteira: cada ficha carrega respostas, snapshot
 * e o JSON das anotações, e a história recente é onde se procura quase sempre.
 *
 * Cada ficha é um cartão com a paciente em cima, o procedimento em destaque e **uma** ação —
 * abrir —, no mesmo desenho das anamneses: as três fichas são abas da mesma tela.
 */
export const ListaDeFichas: React.FC<ListaDeFichasProps> = ({ tipo, descricao, acao, onAbrir }) => {
  const rotulos = ROTULOS_DA_FICHA[tipo];
  const [janela, setJanela] = useState<number | undefined>(JANELAS_DA_LISTA[0].dias);
  const [registros, setRegistros] = useState<EvaluationRecord[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    // "Últimos 30 dias" inclui hoje: o corte é 29 dias atrás, como em `periodoDeDias`.
    const desde = janela === undefined ? undefined : diasAntesDeHoje(janela - 1);
    return subscribeToRegistrosDeFicha(
      tipo,
      { desde },
      (dados) => {
        setRegistros(dados);
        setCarregando(false);
      },
      (e) => {
        setCarregando(false);
        setErro(`Não foi possível carregar ${rotulos.artigo}s ${rotulos.plural}: ${e.message}`);
      }
    );
  }, [tipo, janela, rotulos.artigo, rotulos.plural]);

  const filtrados = useMemo(() => {
    const termo = chaveDeNome(busca).trim();
    if (!termo) return registros;
    return registros.filter((r) =>
      [r.pacienteNome, r.procedimentoNome, r.profissionalNome].some((campo) =>
        chaveDeNome(campo).includes(termo)
      )
    );
  }, [registros, busca]);

  const rotuloDaJanela = JANELAS_DA_LISTA.find((j) => j.dias === janela)?.rotulo || '';

  return (
    <div className="flex flex-col gap-4">
      {acao}

      <p className="text-[14px] text-ink-soft leading-relaxed max-w-2xl">{descricao}</p>

      <CampoDeBusca
        valor={busca}
        onMudar={setBusca}
        placeholder="Paciente, procedimento ou profissional"
        rotulo={`Buscar ${rotulos.minusculo} por paciente, procedimento ou profissional`}
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="text-[16px] font-bold text-ink">
          {carregando
            ? rotulos.plural.charAt(0).toUpperCase() + rotulos.plural.slice(1)
            : `${filtrados.length} ${filtrados.length === 1 ? rotulos.minusculo : rotulos.plural}`}
          {rotuloDaJanela && rotuloDaJanela !== 'Tudo' && (
            <span className="font-medium text-ink-soft"> · {rotuloDaJanela}</span>
          )}
        </p>
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Período">
          {JANELAS_DA_LISTA.map((j) => (
            <Chip key={j.rotulo} ativo={janela === j.dias} onClick={() => setJanela(j.dias)}>
              {j.rotulo}
            </Chip>
          ))}
        </div>
      </div>

      {erro && <p className="px-4 py-3 rounded-[14px] bg-danger-bg text-[14px] text-danger">{erro}</p>}

      {carregando ? (
        <SkeletonLista linhas={5} />
      ) : filtrados.length === 0 ? (
        <div className="rounded-[20px] bg-card border border-ink/8 p-10 text-center">
          <FileText className="w-9 h-9 text-ink-soft mx-auto mb-3" />
          <p className="text-[15px] font-bold text-ink">
            {registros.length === 0
              ? `Nenhum registro de ${rotulos.minusculo} nesta janela`
              : 'Nada encontrado com essa busca'}
          </p>
          <p className="text-[14px] text-ink-soft mt-1">
            {registros.length === 0
              ? 'Aumente a janela para ver os mais antigos.'
              : 'Tente o nome da paciente ou do procedimento.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtrados.map((r) => {
            const comFoto = fotosDaSessao(r).length > 0 || !!r.fotoModeloAnotadaUrl;
            return (
              <article
                key={r.id}
                className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3"
              >
                <div className="flex gap-3 items-center">
                  <Avatar nome={r.pacienteNome} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-bold text-ink truncate">{r.pacienteNome}</p>
                    <p className="text-[13px] text-ink-soft truncate">
                      {formatDateOnly((r.dataAtendimento || '').slice(0, 10))}
                      {r.profissionalNome ? ` · ${r.profissionalNome}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-[10px] bg-cream text-[#5B3E25] text-[14px] font-semibold">
                    {r.procedimentoNome}
                  </span>
                  {comFoto && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-line-soft text-ink-soft text-[12px] font-bold">
                      <Camera className="w-3.5 h-3.5" />
                      Com foto
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onAbrir(r)}
                  className="mt-auto h-11 rounded-xl bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors"
                >
                  Abrir {rotulos.minusculo}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
