import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Merge } from 'lucide-react';
import { Patient } from '../../types';
import { formatCpf, formatDateOnly } from '../../utils/formatters';
import { LinhaDePaciente, pacienteProvisorio } from '../../utils/patientsPanel';
import { motivoDeRepeticao, nomeCombina, ROTULO_DO_MOTIVO } from '../../utils/pacientesRepetidos';
import {
  CampoDaJuncao,
  camposEmConflito,
  dadosJuntados,
  EscolhasDaJuncao,
  escolhasIniciais,
  principalDaJuncao,
} from '../../utils/juncaoDePacientes';
import { SidePanel } from '../common/SidePanel';
import { Avatar, AvisoTinta, BotaoPrincipal, CampoDeBusca, PilulasDeEscolha, RotuloTinta } from '../common/Tinta';

interface JuntarPacientesPanelProps {
  /** Os dois a juntar. Sem `b` — o "Juntar com outro cadastro" da página dela —, a tela pede a outra. */
  par: { a: LinhaDePaciente; b?: LinhaDePaciente } | null;
  /** A lista inteira, de onde sai a outra quando `b` não veio. */
  linhas: LinhaDePaciente[];
  onFechar: () => void;
  /** Grava. `principal` é o que fica; quem decide qual é este painel, por `principalDaJuncao`. */
  onJuntar: (
    principal: LinhaDePaciente,
    outro: LinhaDePaciente,
    escolhas: EscolhasDaJuncao
  ) => Promise<void>;
}

const ROTULO_DO_CAMPO: Record<CampoDaJuncao, string> = {
  nome: 'Nome que fica',
  contato: 'WhatsApp',
  cpf: 'CPF',
  dataNascimento: 'Nascimento',
  email: 'E-mail',
  genero: 'Gênero',
};

/** O valor como a pessoa lê — o CPF com pontos, a data em dd/mm/aaaa. */
const valorLegivel = (p: Patient, campo: CampoDaJuncao): string => {
  if (campo === 'cpf') return formatCpf(p.cpf || '');
  if (campo === 'dataNascimento') return formatDateOnly(p.dataNascimento);
  if (campo === 'genero') return p.genero === 'masculino' ? 'Masculino' : 'Feminino';
  return (p[campo] as string | undefined)?.trim() || '';
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const resumoDoHistorico = (l: LinhaDePaciente): string =>
  [
    plural(l.totalAtendimentos, 'atendimento', 'atendimentos'),
    plural(l.totalAnamneses, 'anamnese', 'anamneses'),
    plural(l.totalOrcamentos, 'orçamento', 'orçamentos'),
  ].join(' · ');

const pacienteDaLinha = (l: LinhaDePaciente): Patient => l.patient || pacienteProvisorio(l);

/** Um dos dois cadastros, como está hoje. */
const CartaoDoCadastro: React.FC<{ linha: LinhaDePaciente }> = ({ linha }) => {
  const p = pacienteDaLinha(linha);
  const dados = [
    p.contato,
    p.cpf ? `CPF ${formatCpf(p.cpf)}` : null,
    p.dataNascimento ? `nasc. ${formatDateOnly(p.dataNascimento)}` : null,
  ].filter(Boolean);
  return (
    <div className="flex items-start gap-3 rounded-[16px] bg-card border border-ink/8 px-4 py-3">
      <Avatar nome={linha.nome} tamanho={40} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-ink break-words">{linha.nome}</p>
        <p className="text-[13px] text-ink-soft">
          {linha.patient ? dados.join(' · ') || 'Sem telefone nem CPF' : 'sem cadastro · só o nome em documentos'}
        </p>
        <p className="text-[13px] text-ink-soft">{resumoDoHistorico(linha)}</p>
      </div>
    </div>
  );
};

/**
 * Junta dois cadastros da mesma pessoa num só.
 *
 * A equipe só escolhe o que os dois dizem diferente — em geral, qual dos nomes fica. O resto se
 * resolve sozinho: o que só um tem vem dele, e qual dos ids sobrevive é decisão do sistema
 * (`principalDaJuncao`), porque id não é dado de ninguém.
 */
export const JuntarPacientesPanel: React.FC<JuntarPacientesPanelProps> = ({
  par,
  linhas,
  onFechar,
  onJuntar,
}) => {
  const [outraId, setOutraId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [escolhas, setEscolhas] = useState<EscolhasDaJuncao>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const a = par?.a;
  const b = par?.b || (outraId ? linhas.find((l) => l.id === outraId) : undefined);

  // Cada abertura começa do zero — a escolha da junção anterior não vale para esta.
  useEffect(() => {
    setOutraId(null);
    setBusca('');
    setErro(null);
    setSalvando(false);
  }, [par]);

  const lados = useMemo(() => (a && b ? principalDaJuncao(a, b) : null), [a, b]);
  // Memorizado com os lados: o cadastro provisório de quem não tem cadastro nasce com a hora de
  // agora, e montá-lo a cada render mudaria a data dele a cada toque.
  const [principal, outro] = useMemo(
    () => (lados ? [pacienteDaLinha(lados[0]), pacienteDaLinha(lados[1])] : [null, null]),
    [lados]
  );
  const conflitos = useMemo(
    () => (principal && outro ? camposEmConflito(principal, outro) : []),
    [principal, outro]
  );

  useEffect(() => {
    setEscolhas(principal && outro ? escolhasIniciais(principal, outro) : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal?.id, outro?.id]);

  /** Sem busca, as parecidas com ela; com busca, quem combinar com o que foi digitado. */
  const candidatas = useMemo(() => {
    if (!a || par?.b) return [];
    const outras = linhas.filter((l) => l.id !== a.id);
    const termo = busca.trim();
    if (!termo) {
      return outras.filter((l) =>
        motivoDeRepeticao({ nome: a.nome, contato: a.contato, cpf: a.patient?.cpf }, {
          nome: l.nome,
          contato: l.contato,
          cpf: l.patient?.cpf,
        })
      );
    }
    const digitos = termo.replace(/\D/g, '');
    return outras
      .filter(
        (l) =>
          nomeCombina(termo, l.nome) ||
          (!!digitos && (l.contato || '').replace(/\D/g, '').includes(digitos))
      )
      .slice(0, 20);
  }, [a, par?.b, linhas, busca]);

  const final = principal && outro ? dadosJuntados(principal, outro, escolhas) : null;
  const dadosDiferentes = conflitos.filter((c) => c === 'cpf' || c === 'dataNascimento');

  const juntar = async () => {
    if (!lados) return;
    setSalvando(true);
    setErro(null);
    try {
      await onJuntar(lados[0], lados[1], escolhas);
      onFechar();
    } catch (e) {
      setErro(`Não foi possível juntar os cadastros: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const total = (campo: 'totalAtendimentos' | 'totalAnamneses' | 'totalOrcamentos') =>
    (a?.[campo] || 0) + (b?.[campo] || 0);

  return (
    <SidePanel
      aberto={!!par}
      onFechar={onFechar}
      titulo="Juntar cadastros"
      sobretitulo="Pacientes"
      subtitulo="Para quando a mesma pessoa tem dois cadastros: tudo passa a ficar num só."
      bloqueado={salvando}
      rodape={
        <BotaoPrincipal onClick={juntar} disabled={salvando || !lados}>
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
          {salvando ? 'Juntando…' : 'Juntar cadastros'}
        </BotaoPrincipal>
      }
    >
      {a && (
        <div className="px-5 sm:px-6 py-5 flex flex-col gap-4">
          {erro && (
            <AvisoTinta tom="erro" icone={AlertCircle}>
              {erro}
            </AvisoTinta>
          )}

          <CartaoDoCadastro linha={a} />

          {b ? (
            <>
              <div>
                <CartaoDoCadastro linha={b} />
                {!par?.b && (
                  <button
                    type="button"
                    onClick={() => setOutraId(null)}
                    disabled={salvando}
                    className="mt-1 min-h-[40px] px-1 text-[13px] font-semibold text-ink-soft hover:text-ink underline underline-offset-2"
                  >
                    Escolher outra
                  </button>
                )}
              </div>

              {conflitos.map((campo) => (
                <div key={campo}>
                  <RotuloTinta>{ROTULO_DO_CAMPO[campo]}</RotuloTinta>
                  <PilulasDeEscolha
                    rotulo={ROTULO_DO_CAMPO[campo]}
                    opcoes={[
                      { id: 'principal', rotulo: valorLegivel(principal!, campo) },
                      { id: 'outro', rotulo: valorLegivel(outro!, campo) },
                    ]}
                    valor={escolhas[campo] || 'principal'}
                    onMudar={(lado) => lado && setEscolhas((atual) => ({ ...atual, [campo]: lado }))}
                  />
                </div>
              ))}

              {dadosDiferentes.length > 0 && (
                <AvisoTinta tom="alerta" icone={AlertCircle}>
                  Os dois têm{' '}
                  {dadosDiferentes.length === 2
                    ? 'CPF e nascimento diferentes'
                    : dadosDiferentes[0] === 'cpf'
                      ? 'CPF diferente'
                      : 'nascimento diferente'}
                  . Confira se são mesmo a mesma pessoa antes de juntar.
                </AvisoTinta>
              )}

              {final && (
                <AvisoTinta icone={Merge}>
                  Fica um cadastro só, <strong>{final.nome}</strong>, com{' '}
                  {plural(total('totalAtendimentos'), 'atendimento', 'atendimentos')},{' '}
                  {plural(total('totalAnamneses'), 'anamnese', 'anamneses')} e{' '}
                  {plural(total('totalOrcamentos'), 'orçamento', 'orçamentos')}, além das avaliações e
                  dos recibos dos dois. O que só um dos cadastros tinha preenchido vem junto.
                  <br />
                  Orçamentos, recibos e anamneses continuam com o nome com que foram emitidos; a agenda
                  passa a mostrar o nome que fica. Não dá para desfazer.
                </AvisoTinta>
              )}
            </>
          ) : (
            <div>
              <RotuloTinta>Juntar com</RotuloTinta>
              {/* Buscar não é mexer no formulário: fechar o painel depois não pergunta nada. */}
              <div onInput={(e) => e.stopPropagation()} onChange={(e) => e.stopPropagation()}>
                <CampoDeBusca
                  valor={busca}
                  onMudar={setBusca}
                  placeholder="Nome ou telefone da outra"
                  rotulo="Buscar o outro cadastro"
                  autoFocus
                />
              </div>
              {!busca.trim() && candidatas.length > 0 && (
                <p className="mt-3 text-[13px] font-semibold text-ink-soft">Parecidas com ela</p>
              )}
              <ul className="mt-1 flex flex-col">
                {candidatas.map((l) => {
                  const motivo = motivoDeRepeticao(
                    { nome: a.nome, contato: a.contato, cpf: a.patient?.cpf },
                    { nome: l.nome, contato: l.contato, cpf: l.patient?.cpf }
                  );
                  return (
                    <li key={l.id} className="border-b border-ink/8">
                      <button
                        type="button"
                        onClick={() => setOutraId(l.id)}
                        className="w-full flex items-center gap-3 py-3 text-left group"
                      >
                        <Avatar nome={l.nome} tamanho={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-ink truncate group-hover:underline underline-offset-2">
                            {l.nome}
                          </span>
                          <span className="block text-[13px] text-ink-soft truncate">
                            {[
                              !l.patient ? 'sem cadastro' : null,
                              l.contato,
                              motivo ? ROTULO_DO_MOTIVO[motivo] : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || resumoDoHistorico(l)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {candidatas.length === 0 && (
                <p className="mt-3 text-[14px] text-ink-soft">
                  {busca.trim()
                    ? 'Ninguém encontrado com essa busca.'
                    : 'Nenhum cadastro parecido com o dela. Busque a outra pelo nome ou telefone.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </SidePanel>
  );
};
