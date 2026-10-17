import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ImagePlus, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { AnguloAntesDepois, FotoAntesDepois, Patient } from '../../types';
import { FotoDaPaciente, angulosDaPaciente, legendaDaFoto } from '../../utils/pacienteResumo';
import { hojeISO } from '../../utils/attendances';
import { downscaleImage } from '../../utils/imageCompressor';
import { apagarImagemDoStorage, subirImagem } from '../../services/imageStorage';
import { BottomSheet } from '../common/BottomSheet';
import { AcaoDoMenu, Chip, MenuDeAcoes } from '../common/Tinta';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { BeforeAfterCompare, dataDaFoto } from './BeforeAfterCompare';

/**
 * O antes e depois da paciente, por ângulo.
 *
 * Cada ângulo (frente, perfil direito...) tem um lado "antes" e um "depois", e **a equipe escolhe
 * as duas fotos** — o sistema não monta par nenhum sozinho: a mais antiga contra a mais nova quase
 * nunca é a comparação que mostra o resultado, e um par errado na frente da paciente é pior que
 * nenhum. A foto vem das fichas dela (anamnese, avaliação, acompanhamento) ou é enviada do
 * aparelho na hora.
 *
 * Os ângulos moram no cadastro (`Patient.angulosAntesDepois`) e cada mudança grava a lista
 * inteira — são poucos ângulos, com duas URLs cada.
 */

interface AntesEDepoisProps {
  patient: Patient;
  /** As fotos das fichas dela — o que se pode escolher para cada lado. */
  fotos: FotoDaPaciente[];
  onSalvarPaciente: (patient: Patient) => Promise<void>;
}

type Lado = 'antes' | 'depois';

const ROTULO_DO_LADO: Record<Lado, string> = { antes: 'Antes', depois: 'Depois' };

/** O que a equipe mais fotografa — atalho para não digitar, não lista fechada. */
const SUGESTOES_DE_ANGULO = ['Frente', 'Perfil direito', 'Perfil esquerdo', 'Costas', 'Detalhe'];

const novoId = (): string =>
  `ang-${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }`;

/** A pasta do Storage cuja regra já aceita foto clínica enviada pela equipe logada. */
const pastaDasFotos = (patientId: string): string =>
  `acompanhamentos/antes-depois/${patientId.replace(/[^\w-]/g, '_')}`;

export const AntesEDepois: React.FC<AntesEDepoisProps> = ({ patient, fotos, onSalvarPaciente }) => {
  const salvos = useMemo(() => angulosDaPaciente(patient), [patient]);

  // Sem ângulo nenhum, a tela já abre com um "Frente" vazio, pronto para receber as fotos. Ele só
  // vai para o banco quando alguém escolher a primeira foto (ou criar outro ângulo ao lado).
  const [rascunho] = useState<AnguloAntesDepois>(() => ({ id: novoId(), nome: 'Frente' }));
  const angulos = salvos.length > 0 ? salvos : [rascunho];
  const ehRascunho = salvos.length === 0;

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const atual = angulos.find((a) => a.id === selecionadoId) || angulos[0];

  const [escolhendo, setEscolhendo] = useState<Lado | null>(null);
  const [nomeando, setNomeando] = useState<'novo' | 'renomear' | null>(null);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  /**
   * O que se pode pôr num lado: as fotos das fichas e as enviadas do aparelho que já estão em
   * algum ângulo — a mesma foto de perfil pode servir a dois ângulos. A mais recente primeiro.
   */
  const opcoes = useMemo(() => {
    const vistas = new Set<string>();
    const lista: FotoAntesDepois[] = [];
    const incluir = (foto: FotoAntesDepois) => {
      if (vistas.has(foto.url)) return;
      vistas.add(foto.url);
      lista.push(foto);
    };
    fotos.forEach((f) =>
      incluir({
        url: f.url,
        data: (f.data || '').slice(0, 10),
        origem: legendaDaFoto(f),
      })
    );
    salvos
      .flatMap((a) => [a.antes, a.depois])
      .forEach((f) => f?.enviada && incluir(f));
    return lista.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }, [fotos, salvos]);

  /**
   * Grava a lista inteira no cadastro. A foto enviada do aparelho que saiu de todos os ângulos é
   * apagada do Storage — só depois de gravar, para uma falha na gravação não deixar um ângulo
   * apontando para um arquivo que já não existe.
   */
  const gravar = async (novos: AnguloAntesDepois[]): Promise<boolean> => {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvarPaciente({ ...patient, angulosAntesDepois: novos });
      const ficam = new Set(novos.flatMap((a) => [a.antes?.url, a.depois?.url]));
      salvos
        .flatMap((a) => [a.antes, a.depois])
        .forEach((f) => {
          if (f?.enviada && !ficam.has(f.url)) void apagarImagemDoStorage(f.url);
        });
      return true;
    } catch (e) {
      setErro(`Não foi possível salvar o antes e depois: ${(e as Error).message}`);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const atualizarAtual = (mudanca: (a: AnguloAntesDepois) => AnguloAntesDepois) =>
    gravar(angulos.map((a) => (a.id === atual.id ? mudanca(a) : a)));

  const definirFoto = async (lado: Lado, foto: FotoAntesDepois | undefined): Promise<boolean> => {
    if (foto && atual[lado]?.url === foto.url) {
      setEscolhendo(null);
      return true;
    }
    const ok = await atualizarAtual((a) => ({ ...a, [lado]: foto }));
    if (ok) setEscolhendo(null);
    return ok;
  };

  const enviarDoAparelho = async (arquivo: File | undefined) => {
    if (!arquivo || !escolhendo) return;
    const lado = escolhendo;
    setEnviando(true);
    setErro(null);
    try {
      const reduzida = await downscaleImage(arquivo, 1600, 0.85);
      const { url, noStorage } = await subirImagem(reduzida, pastaDasFotos(patient.id));
      // Sem Storage, `subirImagem` devolve a própria base64 — e foto em base64 não entra em
      // documento do Firestore neste projeto. Melhor recusar do que gravar.
      if (!noStorage) {
        throw new Error('o envio para o armazenamento de fotos falhou. Confira a conexão e tente de novo.');
      }
      const ok = await definirFoto(lado, {
        url,
        data: hojeISO(),
        origem: 'Enviada do aparelho',
        enviada: true,
      });
      if (!ok) void apagarImagemDoStorage(url);
    } catch (e) {
      setErro(`Não foi possível enviar a foto: ${(e as Error).message}`);
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  };

  const abrirEscolha = (lado: Lado) => {
    setErro(null);
    setEscolhendo(lado);
  };

  const abrirNome = (modo: 'novo' | 'renomear') => {
    setErro(null);
    setNome(modo === 'renomear' ? atual.nome : '');
    setNomeando(modo);
  };

  const confirmarNome = async () => {
    const limpo = nome.trim();
    if (!limpo) return;
    if (nomeando === 'novo') {
      const novo: AnguloAntesDepois = { id: novoId(), nome: limpo };
      if (await gravar([...angulos, novo])) {
        setSelecionadoId(novo.id);
        setNomeando(null);
      }
    } else if (await atualizarAtual((a) => ({ ...a, nome: limpo }))) {
      setNomeando(null);
    }
  };

  const pedirExclusao = () => {
    const enviadas = [atual.antes, atual.depois].filter((f) => f?.enviada).length;
    setConfirmacao({
      titulo: `Excluir o ângulo "${atual.nome}"?`,
      mensagem:
        'As duas fotos saem do antes e depois. As que vieram das fichas continuam nelas.' +
        (enviadas > 0
          ? enviadas === 1
            ? '\n\nA foto enviada do aparelho para este ângulo é apagada.'
            : '\n\nAs fotos enviadas do aparelho para este ângulo são apagadas.'
          : ''),
      textoConfirmar: 'Excluir ângulo',
      onConfirmar: () => {
        void gravar(angulos.filter((a) => a.id !== atual.id));
        setSelecionadoId(null);
      },
    });
  };

  const acoesDoAngulo: AcaoDoMenu[] = [
    { rotulo: 'Renomear ângulo', icone: Pencil, onClick: () => abrirNome('renomear') },
    ...(atual.antes || atual.depois
      ? [
          {
            rotulo: 'Trocar antes e depois de lado',
            icone: ArrowLeftRight,
            onClick: () => void atualizarAtual((a) => ({ ...a, antes: a.depois, depois: a.antes })),
          },
        ]
      : []),
    ...(!ehRascunho
      ? [{ rotulo: 'Excluir ângulo', icone: Trash2, tom: 'perigo' as const, onClick: pedirExclusao }]
      : []),
  ];

  const sugestoes = SUGESTOES_DE_ANGULO.filter(
    (s) =>
      !angulos.some((a) => a.nome.toLowerCase() === s.toLowerCase()) ||
      (nomeando === 'renomear' && atual.nome === s)
  );

  const fotoDoLado = escolhendo ? atual[escolhendo] : undefined;
  const mensagemDeErro = erro && (
    <p className="px-3 py-2.5 rounded-[12px] bg-danger-bg text-body text-danger">{erro}</p>
  );

  return (
    <div className="space-y-3">
      {/* Os ângulos. Quebram linha em vez de deslizar: ângulo escondido fora da tela é ângulo
          que ninguém lembra que existe. */}
      <div role="group" aria-label="Ângulos do antes e depois" className="flex flex-wrap items-center gap-1.5">
        {angulos.map((a) => (
          <Chip key={a.id} ativo={a.id === atual.id} onClick={() => setSelecionadoId(a.id)}>
            {a.nome}
          </Chip>
        ))}
        <button
          type="button"
          onClick={() => abrirNome('novo')}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-dashed border-ink/25 text-[14px] font-semibold text-ink-soft hover:border-ink/50 hover:text-ink transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo ângulo
        </button>
      </div>

      <div className="glass-card p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-lg font-semibold text-ink truncate">{atual.nome}</p>
          <MenuDeAcoes
            acoes={acoesDoAngulo}
            rotulo={`Mais ações do ângulo ${atual.nome}`}
            titulo={atual.nome}
            tom="discreto"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['antes', 'depois'] as const).map((lado) => (
            <LadoDoAngulo key={lado} lado={lado} foto={atual[lado]} onClick={() => abrirEscolha(lado)} />
          ))}
        </div>

        {atual.antes && atual.depois ? (
          <BeforeAfterCompare antes={atual.antes} depois={atual.depois} angulo={atual.nome} />
        ) : (
          <p className="text-body text-muted text-center py-2">
            Escolha a foto do antes e a do depois para comparar.
          </p>
        )}

        {!escolhendo && !nomeando && mensagemDeErro}
      </div>

      {/* Escolher a foto de um lado: as das fichas dela, ou uma nova do aparelho. */}
      <BottomSheet
        aberto={escolhendo !== null}
        onFechar={() => {
          if (!enviando) setEscolhendo(null);
        }}
        titulo={escolhendo ? `Foto do ${escolhendo} · ${atual.nome}` : undefined}
        descricao="Toque numa foto das fichas ou envie uma do aparelho."
      >
        {escolhendo && (
          <div className="px-2 pb-3 space-y-3">
            <input
              ref={arquivoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void enviarDoAparelho(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              disabled={enviando || salvando}
              className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-60"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {enviando ? 'Enviando...' : 'Enviar foto do aparelho'}
            </button>

            {mensagemDeErro}

            {opcoes.length === 0 ? (
              <p className="text-body text-muted text-center py-4">
                Nenhuma foto nas fichas desta paciente ainda.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {opcoes.map((f) => {
                  const escolhida = fotoDoLado?.url === f.url;
                  return (
                    <button
                      key={f.url}
                      type="button"
                      onClick={() => void definirFoto(escolhendo, f)}
                      disabled={salvando || enviando}
                      aria-pressed={escolhida}
                      className={`min-w-0 text-left rounded-xl overflow-hidden border-2 transition-colors disabled:opacity-60 ${
                        escolhida ? 'border-brand' : 'border-transparent hover:border-ink/20'
                      }`}
                    >
                      <img
                        src={f.url}
                        alt={[f.origem, dataDaFoto(f.data)].filter(Boolean).join(', ')}
                        loading="lazy"
                        className="w-full aspect-[4/5] object-cover bg-surface-2"
                      />
                      <span className="block px-1 pt-1 text-label font-semibold text-ink tabular-nums">
                        {dataDaFoto(f.data) || 'Sem data'}
                      </span>
                      <span className="block px-1 pb-1 text-label text-muted truncate">{f.origem}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {fotoDoLado && (
              <button
                type="button"
                onClick={() => void definirFoto(escolhendo, undefined)}
                disabled={salvando || enviando}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] font-semibold text-danger hover:bg-danger-bg transition-colors disabled:opacity-60"
              >
                <X className="w-4 h-4" />
                Tirar a foto deste lado
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Criar ou renomear um ângulo. */}
      <BottomSheet
        aberto={nomeando !== null}
        onFechar={() => {
          if (!salvando) setNomeando(null);
        }}
        titulo={nomeando === 'renomear' ? 'Renomear ângulo' : 'Novo ângulo'}
      >
        <form
          className="px-2 pb-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmarNome();
          }}
        >
          <label className="block">
            <span className="block text-label uppercase tracking-wider font-semibold text-muted mb-1">
              Nome do ângulo
            </span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Perfil direito"
              maxLength={40}
              className="w-full glass-input px-3 py-2.5 rounded-lg text-body-lg text-ink focus:outline-hidden"
            />
          </label>

          {sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sugestoes.map((s) => (
                <Chip key={s} ativo={nome === s} onClick={() => setNome(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}

          {mensagemDeErro}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setNomeando(null)}
              disabled={salvando}
              className="flex-1 h-11 rounded-xl border border-ink/15 text-[14px] font-semibold text-ink hover:border-ink/40 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!nome.trim() || salvando}
              className="flex-1 h-11 rounded-xl bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : nomeando === 'renomear' ? 'Salvar' : 'Criar ângulo'}
            </button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

/** Um lado do ângulo: a miniatura com a data e a origem, ou o convite para escolher. */
const LadoDoAngulo: React.FC<{ lado: Lado; foto?: FotoAntesDepois; onClick: () => void }> = ({
  lado,
  foto,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={foto ? `Trocar a foto do ${lado}` : `Escolher a foto do ${lado}`}
    className="min-w-0 flex items-center gap-2.5 min-h-[76px] p-2 rounded-xl border border-line bg-card text-left hover:border-brand transition-colors"
  >
    {foto ? (
      <img
        src={foto.url}
        alt=""
        className="w-12 h-[60px] shrink-0 rounded-lg object-cover bg-surface-2"
      />
    ) : (
      <span className="w-12 h-[60px] shrink-0 rounded-lg border border-dashed border-ink/25 flex items-center justify-center text-ink-soft">
        <ImagePlus className="w-5 h-5" />
      </span>
    )}
    <span className="min-w-0 flex-1">
      <span className="block text-label uppercase tracking-wider font-semibold text-muted">
        {ROTULO_DO_LADO[lado]}
      </span>
      {foto ? (
        <>
          <span className="block text-body font-semibold text-ink tabular-nums">
            {dataDaFoto(foto.data) || 'Sem data'}
          </span>
          <span className="block text-label text-muted truncate">{foto.origem}</span>
        </>
      ) : (
        <span className="block text-body font-semibold text-brand">Escolher foto</span>
      )}
    </span>
  </button>
);
