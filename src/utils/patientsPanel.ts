import { AnamnesisRecord, Attendance, Patient, Quote } from '../types';
import {
  DataISO,
  ehPendente,
  ehRealizado,
  hojeISO,
  instanteDoAtendimento,
  nomeDosProcedimentos,
} from './attendances';

/**
 * As linhas do painel de clientes — quem aparece na lista, em que ordem e o que ainda falta
 * completar em cada um.
 *
 * Mora fora do componente porque a lista não é só `patients`: uma cliente pode existir apenas
 * como nome digitado num orçamento avulso, sem cadastro nenhum. Antes disso, ela simplesmente
 * não aparecia em lugar algum — o orçamento estava lá, a pessoa não.
 */

/** Ordem escolhida na lista. */
export type OrdemDaLista = 'alfabetica' | 'interacao';

/**
 * O filtro do topo da lista: todas, só quem já foi atendida, só quem tem horário marcado.
 *
 * Os dois recortes respondem às perguntas que a recepção faz à lista — "quem já é cliente de
 * verdade?" e "quem vem por aí?" — e por isso não olham anamnese nem orçamento: quem só pediu um
 * orçamento ainda não passou pela cadeira.
 */
export type FiltroDaLista = 'todas' | 'com_atendimento' | 'com_agendamento';

export type TipoDeInteracao = 'atendimento' | 'anamnese' | 'orcamento';

export interface UltimaInteracao {
  tipo: TipoDeInteracao;
  /** Como veio do documento: ISO completo ou "YYYY-MM-DD". */
  data: string;
}

/** Uma visita resumida para a linha da lista — a última feita ou a próxima marcada. */
export interface VisitaDaLinha {
  atendimentoId: string;
  data: DataISO;
  hora?: string;
  /** "Botox + Preenchimento labial" — todos os procedimentos da visita. */
  procedimento: string;
}

/**
 * O que falta completar nesta linha.
 *
 * `sem_cadastro` — a pessoa só existe como nome em um orçamento ou ficha; não há documento em
 * `patients` para ela. `sem_contato` — tem cadastro, mas nenhum jeito de falar com ela.
 */
export type PendenciaDeCadastro = 'sem_cadastro' | 'sem_contato';

export interface LinhaDePaciente {
  /**
   * Chave de lista e identidade do paciente. Nos sem cadastro é sintética, derivada do nome — e
   * já no formato de um id de documento, porque é ela que vira o id do cadastro se a equipe
   * resolver salvar os dados a partir da página dele.
   */
  id: string;
  nome: string;
  contato?: string;
  /** O cadastro. Ausente exatamente quando `pendencia === 'sem_cadastro'`. */
  patient?: Patient;
  ultimaInteracao?: UltimaInteracao;
  pendencia?: PendenciaDeCadastro;
  totalAnamneses: number;
  totalOrcamentos: number;
  totalAtendimentos: number;
  /** A visita feita mais recente — o que o filtro "Com atendimento" mostra na linha. */
  ultimoAtendimento?: VisitaDaLinha;
  /**
   * O agendamento mais próximo, de hoje em diante, ainda sem desfecho. O que o filtro "Com
   * agendamento" mostra na linha. Agendamento de dia que já passou não entra: aquele é trabalho
   * represado da agenda, não horário marcado.
   */
  proximoAgendamento?: VisitaDaLinha;
}

/**
 * Normaliza para comparar nomes digitados à mão com nomes do cadastro (acento, caixa e espaço
 * repetido não contam).
 */
export const chaveDoNome = (nome: string): string =>
  (nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

/**
 * "Este documento é desta pessoa?" — a regra da página da paciente, e por isso também a da junção
 * de cadastros, que precisa mover exatamente o que a página mostra.
 *
 * O vínculo por id resolve o caso normal; o nome cobre os documentos que não têm a quem apontar —
 * o orçamento avulso, emitido antes de o cadastro existir, e a ficha cujo cadastro foi excluído
 * depois. Documento que aponta para **outro** cadastro não entra, mesmo com o nome igual: é de
 * uma homônima.
 */
export const pertenceA = (
  paciente: Pick<Patient, 'id' | 'nome'>,
  idsCadastrados: Set<string>
): ((doc: { pacienteId?: string; pacienteNome?: string }) => boolean) => {
  const chave = chaveDoNome(paciente.nome);
  return (doc) =>
    doc.pacienteId === paciente.id ||
    (!idsCadastrados.has(doc.pacienteId || '') && chaveDoNome(doc.pacienteNome || '') === chave);
};

/**
 * Id de quem ainda não tem cadastro — "bruna carvalho" vira "pat-bruna-carvalho".
 *
 * Derivado do nome, e não sorteado, por duas razões: precisa ser o mesmo entre um render e outro
 * (é o id que a página aberta guarda) e entre uma sessão e outra; e, quando a equipe completa os
 * dados na página dela, é este id que o documento em `patients` recebe. Os ids do cadastro normal
 * são `pat-<timestamp>`, então não há como os dois se cruzarem.
 */
export const idSinteticoDoNome = (chave: string): string => {
  const slug = chave
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `pat-${slug || 'sem-nome'}`;
};

/**
 * Data de preenchimento da ficha. `createdAt` e não `dataAtendimento`: a segunda é a data do
 * atendimento, que a profissional pode datar para trás ou para frente — o que a lista quer saber
 * é quando a clínica tocou no assunto pela última vez.
 */
const dataDaFicha = (r: AnamnesisRecord): string => r.createdAt || r.dataAtendimento || '';

const dataDoOrcamento = (q: Quote): string => q.dataEmissao || q.createdAt || '';

/**
 * A data da visita. Só entra quem **aconteceu**: um agendamento para o Natal faria a lista dizer
 * "última interação 25/12/26", uma data que ainda não chegou.
 */
const dataDoAtendimento = (a: Attendance): string => a.data || '';

/** Datas chegam em dois formatos; comparar como string ordenaria "27/04" antes de "2026-04-27". */
const emMs = (valor?: string): number => {
  if (!valor) return 0;
  const d = valor.length === 10 ? new Date(`${valor}T12:00:00Z`) : new Date(valor);
  const t = d.getTime();
  return isNaN(t) ? 0 : t;
};

const maisRecente = (
  a: UltimaInteracao | undefined,
  b: UltimaInteracao | undefined
): UltimaInteracao | undefined => {
  if (!a) return b;
  if (!b) return a;
  return emMs(b.data) > emMs(a.data) ? b : a;
};

interface FontesDaLista {
  patients: Patient[];
  records: AnamnesisRecord[];
  quotes: Quote[];
  atendimentos?: Attendance[];
  /** "Hoje", para decidir o que é agendamento futuro. Parâmetro só para os testes. */
  hoje?: DataISO;
}

const resumoDaVisita = (a: Attendance): VisitaDaLinha => ({
  atendimentoId: a.id,
  data: a.data,
  hora: a.hora,
  procedimento: nomeDosProcedimentos(a),
});

/** Fica com a visita certa entre a guardada e a nova: a mais recente, ou a mais próxima. */
const guardarVisita = (
  mapa: Map<string, Attendance>,
  chave: string,
  a: Attendance,
  ganha: 'mais_recente' | 'mais_proxima'
) => {
  const atual = mapa.get(chave);
  if (!atual) {
    mapa.set(chave, a);
    return;
  }
  const diferenca = instanteDoAtendimento(a) - instanteDoAtendimento(atual);
  if (ganha === 'mais_recente' ? diferenca > 0 : diferenca < 0) mapa.set(chave, a);
};

/** Acumulador de uma pessoa sem cadastro, montado a partir dos documentos que a citam. */
interface Pendente {
  nome: string;
  contato?: string;
  ultima?: UltimaInteracao;
  /** Data do documento de onde veio o `contato` — o telefone mais recente ganha. */
  contatoEm: number;
  totalAnamneses: number;
  totalOrcamentos: number;
  totalAtendimentos: number;
}

/**
 * Monta as linhas da lista a partir das três coleções.
 *
 * Um orçamento avulso é atribuído ao cadastro de mesmo nome quando existe um — é a mesma regra
 * que a página do paciente usa para listar os orçamentos dele. Quando não existe, o nome vira uma
 * linha própria, marcada como pendente.
 */
export const montarLinhasDePacientes = ({
  patients,
  records,
  quotes,
  atendimentos = [],
  hoje = hojeISO(),
}: FontesDaLista): LinhaDePaciente[] => {
  /** Cadastro por chave de nome, para acolher o que veio avulso. Em homônimos, o 1º leva. */
  const porNome = new Map<string, Patient>();
  patients.forEach((p) => {
    const chave = chaveDoNome(p.nome);
    if (!porNome.has(chave)) porNome.set(chave, p);
  });

  const porId = new Map<string, Patient>(patients.map((p) => [p.id, p]));

  const interacoes = new Map<string, UltimaInteracao>();
  const contagens = new Map<
    string,
    { anamneses: number; orcamentos: number; atendimentos: number }
  >();
  const pendentes = new Map<string, Pendente>();
  /**
   * Última visita feita e próximo agendamento, por id do cadastro — ou por chave do nome, para
   * quem não tem cadastro.
   */
  const ultimos = new Map<string, Attendance>();
  const proximos = new Map<string, Attendance>();

  const contar = (patientId: string, tipo: TipoDeInteracao) => {
    const atual = contagens.get(patientId) || { anamneses: 0, orcamentos: 0, atendimentos: 0 };
    if (tipo === 'anamnese') atual.anamneses += 1;
    else if (tipo === 'orcamento') atual.orcamentos += 1;
    else atual.atendimentos += 1;
    contagens.set(patientId, atual);
  };

  const registrar = (patientId: string, interacao: UltimaInteracao) => {
    interacoes.set(patientId, maisRecente(interacoes.get(patientId), interacao)!);
    contar(patientId, interacao.tipo);
  };

  const registrarPendente = (
    nome: string,
    contato: string | undefined,
    interacao: UltimaInteracao
  ) => {
    const chave = chaveDoNome(nome);
    if (!chave) return;
    const atual: Pendente = pendentes.get(chave) || {
      nome: nome.trim(),
      contatoEm: -1,
      totalAnamneses: 0,
      totalOrcamentos: 0,
      totalAtendimentos: 0,
    };
    atual.ultima = maisRecente(atual.ultima, interacao);
    const quando = emMs(interacao.data);
    if (contato && quando >= atual.contatoEm) {
      atual.contato = contato;
      atual.contatoEm = quando;
    }
    if (interacao.tipo === 'anamnese') atual.totalAnamneses += 1;
    else if (interacao.tipo === 'orcamento') atual.totalOrcamentos += 1;
    else atual.totalAtendimentos += 1;
    pendentes.set(chave, atual);
  };

  records.forEach((r) => {
    const interacao: UltimaInteracao = { tipo: 'anamnese', data: dataDaFicha(r) };
    const dono = (r.pacienteId && porId.get(r.pacienteId)) || porNome.get(chaveDoNome(r.pacienteNome));
    if (dono) registrar(dono.id, interacao);
    // Ficha órfã: o cadastro foi excluído depois dela. A pessoa continua tendo histórico aqui.
    else registrarPendente(r.pacienteNome, r.pacienteContato, interacao);
  });

  quotes.forEach((q) => {
    const interacao: UltimaInteracao = { tipo: 'orcamento', data: dataDoOrcamento(q) };
    const dono = (q.pacienteId && porId.get(q.pacienteId)) || porNome.get(chaveDoNome(q.pacienteNome));
    if (dono) registrar(dono.id, interacao);
    else registrarPendente(q.pacienteNome, q.pacienteContato, interacao);
  });

  atendimentos.forEach((a) => {
    const dono = (a.pacienteId && porId.get(a.pacienteId)) || porNome.get(chaveDoNome(a.pacienteNome));
    const chave = dono ? dono.id : chaveDoNome(a.pacienteNome);

    // O horário marcado de hoje em diante — o que o filtro "Com agendamento" procura.
    if (ehPendente(a) && !!a.data && a.data >= hoje) {
      if (chave) guardarVisita(proximos, chave, a, 'mais_proxima');
      return;
    }

    // Agendamento futuro não conta como interação: ele ainda não aconteceu. Falta e remarcação
    // também não — ninguém veio à clínica.
    if (!ehRealizado(a)) return;
    const interacao: UltimaInteracao = { tipo: 'atendimento', data: dataDoAtendimento(a) };
    if (dono) registrar(dono.id, interacao);
    else registrarPendente(a.pacienteNome, undefined, interacao);
    if (chave) guardarVisita(ultimos, chave, a, 'mais_recente');
  });

  const visita = (mapa: Map<string, Attendance>, chave: string): VisitaDaLinha | undefined => {
    const a = mapa.get(chave);
    return a ? resumoDaVisita(a) : undefined;
  };

  const doCadastro: LinhaDePaciente[] = patients.map((p) => {
    const totais = contagens.get(p.id) || { anamneses: 0, orcamentos: 0, atendimentos: 0 };
    return {
      id: p.id,
      nome: p.nome,
      contato: p.contato,
      patient: p,
      ultimaInteracao: interacoes.get(p.id),
      // Sem telefone e sem e-mail, o cadastro não serve para o que a recepção mais faz: chamar.
      pendencia: !p.contato?.trim() && !p.email?.trim() ? 'sem_contato' : undefined,
      totalAnamneses: totais.anamneses,
      totalOrcamentos: totais.orcamentos,
      totalAtendimentos: totais.atendimentos,
      ultimoAtendimento: visita(ultimos, p.id),
      proximoAgendamento: visita(proximos, p.id),
    };
  });

  const semCadastro: LinhaDePaciente[] = Array.from(pendentes.entries()).map(([chave, p]) => ({
    id: idSinteticoDoNome(chave),
    nome: p.nome,
    contato: p.contato,
    ultimaInteracao: p.ultima,
    pendencia: 'sem_cadastro',
    totalAnamneses: p.totalAnamneses,
    totalOrcamentos: p.totalOrcamentos,
    totalAtendimentos: p.totalAtendimentos,
    ultimoAtendimento: visita(ultimos, chave),
    // Quem só tem um horário marcado e nenhum outro documento não vira linha: sem cadastro e sem
    // histórico, não há página a abrir. Na prática não acontece — agendar cria o cadastro.
    proximoAgendamento: visita(proximos, chave),
  }));

  return [...doCadastro, ...semCadastro];
};

/**
 * Ordena a lista já montada. Em "última interação", quem nunca teve nenhuma vai para o fim — e
 * não para o topo, que é onde um `0` os colocaria.
 */
export const ordenarLinhas = (
  linhas: LinhaDePaciente[],
  ordem: OrdemDaLista
): LinhaDePaciente[] => {
  const porNome = (a: LinhaDePaciente, b: LinhaDePaciente) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

  if (ordem === 'alfabetica') return [...linhas].sort(porNome);

  return [...linhas].sort((a, b) => {
    const ta = emMs(a.ultimaInteracao?.data);
    const tb = emMs(b.ultimaInteracao?.data);
    if (ta !== tb) return tb - ta;
    return porNome(a, b);
  });
};

/** As linhas que passam no filtro do topo da lista. */
export const filtrarLinhas = (linhas: LinhaDePaciente[], filtro: FiltroDaLista): LinhaDePaciente[] =>
  filtro === 'com_atendimento'
    ? linhas.filter((l) => l.totalAtendimentos > 0)
    : filtro === 'com_agendamento'
    ? linhas.filter((l) => !!l.proximoAgendamento)
    : linhas;

/**
 * No filtro "Com agendamento" a ordem é a da agenda: o horário mais próximo primeiro. Em ordem
 * alfabética, a paciente de amanhã ficaria no meio da lista, atrás de quem vem só em março.
 */
export const ordenarPorAgendamento = (linhas: LinhaDePaciente[]): LinhaDePaciente[] => {
  const instante = (l: LinhaDePaciente) => {
    const v = l.proximoAgendamento;
    if (!v) return Number.MAX_SAFE_INTEGER;
    const t = new Date(`${v.data}T${v.hora || '12:00'}:00`).getTime();
    return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  };
  return [...linhas].sort(
    (a, b) =>
      instante(a) - instante(b) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  );
};

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Quando é o agendamento, para a linha da lista: "Hoje", "Amanhã" ou "qui, 05/11" — com o ano só
 * quando não é o deste ano ("qua, 06/01/27"). O dia da semana fica porque é por ele que a
 * recepção pensa a semana; a data sozinha obriga a abrir o calendário.
 */
export const diaDoAgendamento = (data: DataISO, hoje: DataISO = hojeISO()): string => {
  const meioDia = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const d = meioDia(data);
  if (isNaN(d.getTime())) return '';
  if (data === hoje) return 'Hoje';
  const amanha = new Date(meioDia(hoje).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (data === amanha) return 'Amanhã';
  const pad = (n: number) => String(n).padStart(2, '0');
  const diaMes = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
  const ano = data.slice(0, 4) === hoje.slice(0, 4) ? '' : `/${data.slice(2, 4)}`;
  return `${DIAS_DA_SEMANA[d.getUTCDay()]}, ${diaMes}${ano}`;
};

export const ROTULO_DA_INTERACAO: Record<TipoDeInteracao, string> = {
  atendimento: 'Atendimento',
  anamnese: 'Anamnese',
  orcamento: 'Orçamento',
};

/**
 * O cadastro provisório de quem ainda não tem um.
 *
 * Existe para a página do paciente poder abrir normalmente para essas pessoas — o histórico dela
 * é real, só o documento em `patients` é que não existe ainda. Completar os dados pessoais ali é
 * o que grava o cadastro de verdade, com este mesmo id.
 */
export const pacienteProvisorio = (linha: LinhaDePaciente): Patient => ({
  id: linha.id,
  nome: linha.nome,
  contato: linha.contato,
  createdAt: new Date().toISOString(),
});
