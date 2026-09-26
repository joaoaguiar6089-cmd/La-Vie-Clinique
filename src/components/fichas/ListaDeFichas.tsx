import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Camera, Eye, FileText, Search, User } from 'lucide-react';
import { EvaluationRecord } from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import { chaveDeNome } from '../../utils/templateMatching';
import { fotosDaSessao } from '../../utils/evaluations';
import { diasAntesDeHoje } from '../../utils/indicadores';
import { JANELAS_DA_LISTA, ROTULOS_DA_FICHA, TipoDeFicha } from '../../utils/fichasClinicas';
import { subscribeToRegistrosDeFicha } from '../../services/databaseService';
import { SkeletonLista } from '../common/Skeleton';

interface ListaDeFichasProps {
  tipo: TipoDeFicha;
  /** O parágrafo sob o título. */
  descricao: string;
  /** Botão do cabeçalho — o "Nova avaliação". */
  acao?: React.ReactNode;
  onAbrir: (registro: EvaluationRecord) => void;
}

/**
 * As fichas preenchidas de um tipo, das mais recentes para as mais antigas.
 *
 * A mesma lista serve à seção de avaliação e à de acompanhamento. Ela assina as fichas pela janela
 * escolhida — 30 dias por padrão — e não a coleção inteira: cada ficha carrega respostas, snapshot
 * e o JSON das anotações, e a história recente é onde se procura quase sempre.
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

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              <h3 className="font-serif-luxury text-xl font-medium text-ink capitalize">
                {rotulos.plural}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">{descricao}</p>
          </div>
          {acao}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por paciente, procedimento ou profissional"
              className="w-full glass-input pl-9 pr-3 py-2 rounded-sm text-sm text-ink focus:outline-hidden"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {JANELAS_DA_LISTA.map((j) => (
              <button
                key={j.rotulo}
                type="button"
                onClick={() => setJanela(j.dias)}
                aria-pressed={janela === j.dias}
                className={`px-2.5 py-1.5 rounded-sm text-body font-semibold border transition-colors ${
                  janela === j.dias
                    ? 'bg-ink text-white border-ink'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {j.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {erro && (
        <p className="px-4 py-3 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700">
          {erro}
        </p>
      )}

      {carregando ? (
        <SkeletonLista linhas={5} />
      ) : filtrados.length === 0 ? (
        <div className="bg-white/50 rounded-sm border border-white/70 p-12 text-center">
          <FileText className="w-9 h-9 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-ink">
            {registros.length === 0
              ? `Nenhum registro de ${rotulos.minusculo} nesta janela`
              : 'Nada encontrado com essa busca'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {registros.length === 0
              ? 'Aumente a janela para ver os mais antigos.'
              : 'Tente o nome da paciente ou do procedimento.'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-sm border border-white/70 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-white/70 border-b border-white/80">
            <span className="text-label uppercase tracking-widest font-semibold text-gray-500">
              {filtrados.length}{' '}
              {filtrados.length === 1 ? rotulos.minusculo : rotulos.plural}
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {filtrados.map((r) => (
              <div
                key={r.id}
                className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-white/80 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-sm bg-ink flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-brand-light" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{r.pacienteNome}</p>
                    <p className="text-xs text-gray-500 truncate">{r.procedimentoNome}</p>
                    <p className="text-body text-gray-400 flex items-center gap-1 mt-0.5">
                      <CalendarCheck className="w-3 h-3" />
                      {formatDateOnly((r.dataAtendimento || '').slice(0, 10))}
                      {r.profissionalNome ? ` · ${r.profissionalNome}` : ''}
                      {(fotosDaSessao(r).length > 0 || r.fotoModeloAnotadaUrl) && (
                        <Camera className="w-3 h-3 ml-1" aria-label="Com foto" />
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onAbrir(r)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm bg-white border border-gray-200 text-label font-semibold uppercase tracking-wider text-ink hover:border-brand transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Abrir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
