import crypto from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type {
  Attendance,
  ClinicProfile,
  ContaGoogleAgenda,
  MarcaGoogleAgenda,
  Patient,
  Procedure,
} from '../src/types';
import {
  AGENDA_DEFAULTS,
  almocoDoDia,
  conflitosDe,
  conflitosDeSala,
  dataExtensa,
  diaDaSemanaDe,
  duracaoDoProcedimento,
  duracaoDosProcedimentos,
  expedienteDoDia,
  hhmmDeMinutos,
  horariosLivresDoDia,
  intervaloDaGrade,
  intervaloDoAtendimento,
  minutosDoHHMM,
  nomeLongoDoDia,
  salasDaClinica,
} from '../src/utils/agenda';
import { mensagemDoLink, montarSnapshotDoLink } from '../src/utils/agendamentoLink';
import { nomeDosProcedimentos, type DataISO } from '../src/utils/attendances';
import { assinaturaDoEvento, eventoDoAtendimento, idDoEventoGoogle, type EventoGoogle } from '../src/utils/googleAgenda';
import { cabeMaisUm, mensagemDoLimite, usoDe } from '../src/utils/planos';
import {
  limparCamposDaAvaliacao,
  PROCEDIMENTO_AVALIACAO_ID,
  procedimentoAvaliacaoPadrao,
} from '../src/utils/procedimentoAvaliacao';
import { resolvePublicBase } from '../src/utils/publicLinks';
import { duracoesDasLinhas, horariosEmSequencia, membrosDaVisita, visitaComoUmAtendimento } from '../src/utils/visitas';
import { buildWhatsAppUrl } from '../src/utils/whatsapp';
import { colecaoDaClinica } from './clinicas';

/**
 * A agenda pelo conector do Claude: ler opções, pacientes e horários, cadastrar paciente, agendar
 * e gerar o link de confirmação — **as mesmas regras do painel**, com as funções puras do painel.
 *
 * O painel grava pelo navegador; aqui é o servidor que grava, com o Admin SDK, no mesmo formato.
 * Por isso este módulo repete com cuidado o que o painel faz ao salvar (ver
 * `AttendanceFormModal.salvar`, `salvarVisita`, `garantirLinkDoAgendamento` e
 * `gravarCadastroContado`), e só isso:
 *   - um atendimento por procedimento, em sequência, com o mesmo `grupoId` (`utils/visitas.ts`);
 *   - sala ocupada **impede**; profissional ocupada, fora do expediente ou no almoço **pede
 *     confirmação** (no painel, o aviso aparece e a recepção decide);
 *   - o link da cliente nasce junto com o agendamento (`appointment_links/{token}`, a mesma cópia
 *     enxuta), e a mensagem do WhatsApp é a mesma do painel (`mensagemDoLink`);
 *   - cadastro novo de paciente sobe o contador do plano, na mesma gravação.
 *
 * O acesso ao banco passa pela interface `BancoDaClinica`: no ar, o Firestore
 * (`bancoDaClinicaNoFirestore`); no `scripts/verificar-conector-claude.ts`, a memória.
 *
 * Fuso: o servidor do AI Studio roda em UTC, e as funções do painel usam o fuso de quem está na
 * tela. Tudo que depende de "hoje" e "agora" aqui passa por `agoraNaClinica`.
 */

export const FUSO_DA_CLINICA = 'America/Sao_Paulo';

/** Erro que o Claude deve ler e contar à pessoa — a mensagem é para gente, em português. */
export class ErroDoConector extends Error {}

// ==========================================
// HORA DA CLÍNICA
// ==========================================

export interface AgoraNaClinica {
  data: DataISO;
  minutos: number;
  hhmm: string;
}

/** Hoje e agora no fuso da clínica, qualquer que seja o fuso do servidor. */
export const agoraNaClinica = (instante: Date = new Date()): AgoraNaClinica => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO_DA_CLINICA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value])
  );
  const minutos = Number(partes.hour) * 60 + Number(partes.minute);
  return { data: `${partes.year}-${partes.month}-${partes.day}`, minutos, hhmm: hhmmDeMinutos(minutos) };
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A data existe no calendário (2026-02-30 não). */
export const dataValida = (data: string): boolean => {
  if (!DATA_ISO.test(data)) return false;
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const diasEntre = (de: DataISO, ate: DataISO): number => {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
};

const proximoDia = (data: DataISO): DataISO => {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
};

// ==========================================
// O BANCO
// ==========================================

export interface LinkParaGravar {
  token: string;
  /** O documento de `appointment_links/{token}`, já sem campos vazios. */
  dados: Record<string, unknown>;
}

export interface BancoDaClinica {
  /** O id da clínica na Zulia (vai no `c=` do link), ou `null` no legado. */
  readonly clinicaId: string | null;
  perfil(): Promise<ClinicProfile | null>;
  /** O catálogo como o painel o mostra: a Avaliação primeiro, sem os arquivados. */
  procedimentos(): Promise<Procedure[]>;
  /** As pacientes ativas: sem as juntadas a outra e sem as arquivadas. */
  pacientes(): Promise<Patient[]>;
  paciente(id: string): Promise<Patient | null>;
  atendimentosEntre(de: DataISO, ate: DataISO): Promise<Attendance[]>;
  atendimento(id: string): Promise<Attendance | null>;
  atendimentosDoGrupo(grupoId: string): Promise<Attendance[]>;
  /** Cria o cadastro (nunca sobrescreve) e sobe o contador do plano. Lança `ErroDoConector` no limite. */
  criarPaciente(paciente: Patient): Promise<void>;
  /** Cria os atendimentos da visita e o link, tudo numa gravação. Nunca sobrescreve. */
  criarVisita(registros: Attendance[], link: LinkParaGravar): Promise<void>;
  /**
   * Cria o link de uma visita que já existe, ou renova a cópia dele; aponta para ele os
   * atendimentos que ainda não apontam.
   */
  gravarLink(token: string, snapshot: Record<string, unknown>, atendimentosSemToken: string[]): Promise<void>;
  marcarGoogle(atendimentoId: string, marca: MarcaGoogleAgenda): Promise<void>;
  /** As contas do Google Agenda da clínica, e se o recurso está ligado para ela. */
  googleAgenda(): Promise<{ ligado: boolean; contas: Record<string, ContaGoogleAgenda> }>;
}

/** Tira `undefined` de tudo, também dentro de listas e objetos — como o `cleanForFirestore` do painel. */
export const limpar = <T>(valor: T): T => {
  if (Array.isArray(valor)) return valor.map((v) => limpar(v)) as T;
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, limpar(v)])
    ) as T;
  }
  return valor;
};

/** A Avaliação lida do banco, como o painel a monta (`avaliacaoLida`). */
const avaliacaoLida = (dados: Record<string, unknown> | undefined): Procedure => {
  const padrao = procedimentoAvaliacaoPadrao();
  if (!dados) return padrao;
  return limparCamposDaAvaliacao({
    ...padrao,
    ...(dados as unknown as Procedure),
    title: typeof dados.title === 'string' && dados.title.trim() ? dados.title : padrao.title,
    images: Array.isArray(dados.images) ? (dados.images as string[]) : [],
    focos: Array.isArray(dados.focos) ? (dados.focos as string[]) : [],
  });
};

const pacientesGuardadas = new Map<string, { ate: number; lista: Patient[] }>();
const PACIENTES_VALEM_MS = 60 * 1000;

export function bancoDaClinicaNoFirestore(db: Firestore, clinicaId: string | null): BancoDaClinica {
  const col = (nome: string) => colecaoDaClinica(db, clinicaId, nome);
  const docDaClinica = clinicaId ? db.doc(`clinicas/${clinicaId}`) : null;
  const chaveDoCache = clinicaId || '(legado)';

  return {
    clinicaId,
    async perfil() {
      const snap = await col('clinic_settings').doc('main_profile').get();
      return snap.exists ? (snap.data() as ClinicProfile) : null;
    },
    async procedimentos() {
      const [lista, avaliacao] = await Promise.all([
        col('procedures').orderBy('order', 'asc').get(),
        col('clinic_settings').doc('procedimento_avaliacao').get(),
      ]);
      const itens: Procedure[] = [];
      lista.forEach((d) => {
        if (d.id === PROCEDIMENTO_AVALIACAO_ID) return;
        const p = { ...(d.data() as Procedure), id: d.id };
        if (!p.arquivado) itens.push(p);
      });
      return [avaliacaoLida(avaliacao.exists ? avaliacao.data() : undefined), ...itens];
    },
    async pacientes() {
      const guardada = pacientesGuardadas.get(chaveDoCache);
      if (guardada && guardada.ate > Date.now()) return guardada.lista;
      // Só os campos da busca: nada de fotos, observações ou CPF trafegando à toa.
      const snap = await col('patients').select('nome', 'contato', 'dataNascimento', 'juntadoA', 'arquivadoEm', 'createdAt').get();
      const lista: Patient[] = [];
      snap.forEach((d) => {
        const p = { ...(d.data() as Patient), id: d.id };
        if (!p.juntadoA && !p.arquivadoEm && typeof p.nome === 'string') lista.push(p);
      });
      if (pacientesGuardadas.size > 200) pacientesGuardadas.clear();
      pacientesGuardadas.set(chaveDoCache, { ate: Date.now() + PACIENTES_VALEM_MS, lista });
      return lista;
    },
    async paciente(id) {
      const snap = await col('patients').doc(id).get();
      return snap.exists ? ({ ...(snap.data() as Patient), id: snap.id } as Patient) : null;
    },
    async atendimentosEntre(de, ate) {
      const snap = await col('attendances').where('data', '>=', de).where('data', '<=', ate).get();
      return snap.docs.map((d) => ({ ...(d.data() as Attendance), id: d.id }));
    },
    async atendimento(id) {
      const snap = await col('attendances').doc(id).get();
      return snap.exists ? ({ ...(snap.data() as Attendance), id: snap.id } as Attendance) : null;
    },
    async atendimentosDoGrupo(grupoId) {
      const snap = await col('attendances').where('grupoId', '==', grupoId).get();
      return snap.docs.map((d) => ({ ...(d.data() as Attendance), id: d.id }));
    },
    async criarPaciente(paciente) {
      const ref = col('patients').doc(paciente.id);
      const dados = limpar({ ...paciente, updatedAt: new Date().toISOString() });
      if (!docDaClinica) {
        await ref.create(dados);
      } else {
        // Como `gravarCadastroContado`: no gratuito, o cadastro só nasce se couber, e o contador
        // sobe na mesma gravação. No completo também conta (o uso aparece no painel do dono).
        await db.runTransaction(async (tx) => {
          const clinica = await tx.get(docDaClinica);
          const plano = clinica.data()?.plano;
          if (!cabeMaisUm(plano, 'clientes', usoDe(clinica.data()))) {
            throw new ErroDoConector(mensagemDoLimite('clientes'));
          }
          tx.create(ref, dados);
          tx.update(docDaClinica, { 'uso.clientes': FieldValue.increment(1), 'uso.ultimoCliente': paciente.id });
        });
      }
      pacientesGuardadas.delete(chaveDoCache);
    },
    async criarVisita(registros, link) {
      const lote = db.batch();
      registros.forEach((r) => lote.create(col('attendances').doc(r.id), limpar(r) as unknown as Record<string, unknown>));
      lote.create(col('appointment_links').doc(link.token), link.dados);
      await lote.commit();
    },
    async gravarLink(token, snapshot, atendimentosSemToken) {
      const ref = col('appointment_links').doc(token);
      const agora = new Date().toISOString();
      await db.runTransaction(async (tx) => {
        const existente = await tx.get(ref);
        if (existente.exists) {
          // Campo que deixou de existir (a hora, a foto) precisa ser apagado no link.
          const renovacao: Record<string, unknown> = { updatedAt: agora };
          Object.entries(snapshot).forEach(([k, v]) => {
            renovacao[k] = v === undefined ? FieldValue.delete() : limpar(v);
          });
          tx.update(ref, renovacao);
        } else {
          tx.create(ref, limpar({ ...snapshot, respostaPendente: false, createdAt: agora, updatedAt: agora }));
        }
        atendimentosSemToken.forEach((id) => tx.update(col('attendances').doc(id), { linkToken: token }));
      });
    },
    async marcarGoogle(atendimentoId, marca) {
      await col('attendances').doc(atendimentoId).update({ googleAgenda: marca });
    },
    async googleAgenda() {
      const [clinica, config] = await Promise.all([
        docDaClinica ? docDaClinica.get() : Promise.resolve(null),
        col('clinic_settings').doc('google_agenda').get(),
      ]);
      const ligado = !docDaClinica || clinica?.data()?.recursos?.googleAgenda === true;
      return { ligado, contas: (config.data()?.contas || {}) as Record<string, ContaGoogleAgenda> };
    },
  };
}

// ==========================================
// O QUE O CLAUDE VÊ
// ==========================================

const normalizar = (texto: string): string =>
  (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const digitosDe = (texto?: string): string => (texto || '').replace(/\D/g, '');

const perfilOuErro = async (banco: BancoDaClinica): Promise<ClinicProfile> => {
  const perfil = await banco.perfil();
  if (!perfil) throw new ErroDoConector('A clínica ainda não tem perfil configurado no painel.');
  return perfil;
};

const textoDoExpediente = (perfil: ClinicProfile, data: DataISO): string => {
  const expediente = expedienteDoDia(perfil, data);
  if (!expediente) return 'fechado';
  const almoco = almocoDoDia(perfil, data);
  return (
    `${hhmmDeMinutos(expediente.abreMin)}–${hhmmDeMinutos(expediente.fechaMin)}` +
    (almoco ? ` (almoço ${hhmmDeMinutos(almoco.inicioMin)}–${hhmmDeMinutos(almoco.fimMin)})` : '')
  );
};

/** Profissionais, procedimentos, salas e expediente: o que o Claude precisa para montar um pedido. */
export async function opcoesDeAgendamento(banco: BancoDaClinica, agora: AgoraNaClinica) {
  const [perfil, catalogo] = await Promise.all([perfilOuErro(banco), banco.procedimentos()]);
  // Uma semana a partir de hoje: cobre todos os dias da semana.
  const semana: DataISO[] = [];
  let dia = agora.data;
  for (let i = 0; i < 7; i++) {
    semana.push(dia);
    dia = proximoDia(dia);
  }
  const profissionais = perfil.professionals || [];
  return {
    clinica: perfil.name,
    hoje: agora.data,
    agora: agora.hhmm,
    fuso: FUSO_DA_CLINICA,
    profissionais: profissionais.map((p) => ({ id: p.id, nome: p.name, titulo: p.title || undefined })),
    procedimentos: catalogo.map((p) => ({
      id: p.id,
      nome: p.title,
      categoria: p.category || undefined,
      focos: p.focos && p.focos.length > 0 ? p.focos : undefined,
      duracao_min: duracaoDoProcedimento(p.duration),
      profissionais: p.assignedDoctorIds && p.assignedDoctorIds.length > 0
        ? p.assignedDoctorIds
            .map((id) => profissionais.find((pr) => pr.id === id)?.name)
            .filter((n): n is string => !!n)
        : undefined,
    })),
    salas: salasDaClinica(perfil).map((s) => ({ id: s.id, nome: s.nome })),
    expediente: semana
      .sort((a, b) => diaDaSemanaDe(a) - diaDaSemanaDe(b))
      .map((d) => ({ dia: nomeLongoDoDia(d), horario: textoDoExpediente(perfil, d) })),
    grade_min: intervaloDaGrade(perfil),
    duracao_padrao_min: AGENDA_DEFAULTS.duracaoMin,
  };
}

/** Pacientes pelo nome (sem acento, em qualquer ordem) ou pelo telefone (4 dígitos ou mais). */
export async function buscarPacientes(banco: BancoDaClinica, busca: string) {
  const termo = normalizar(busca);
  const digitos = digitosDe(busca);
  const palavras = termo.split(' ').filter((p) => p && !/^\d+$/.test(p));
  if (palavras.length === 0 && digitos.length < 4) {
    throw new ErroDoConector('Busque por pelo menos uma parte do nome ou 4 dígitos do telefone.');
  }
  const lista = await banco.pacientes();
  const achadas = lista
    .map((p) => {
      const nome = normalizar(p.nome);
      const tel = digitosDe(p.contato);
      let nota = 0;
      if (digitos.length >= 4 && tel.includes(digitos)) nota += 3;
      if (palavras.length > 0 && palavras.every((w) => nome.includes(w))) {
        nota += 2;
        if (nome.startsWith(palavras[0])) nota += 1;
        if (nome === palavras.join(' ')) nota += 1;
      }
      return { p, nota };
    })
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  return {
    total: achadas.length,
    pacientes: achadas.slice(0, 10).map(({ p }) => ({
      id: p.id,
      nome: p.nome,
      telefone: p.contato || undefined,
      data_nascimento: p.dataNascimento || undefined,
    })),
  };
}

export interface NovoCadastro {
  nome: string;
  telefone: string;
  dataNascimento?: string;
  email?: string;
  cadastrarMesmoAssim?: boolean;
}

/**
 * Cadastra paciente. Antes, procura quem já tenha o mesmo telefone ou o mesmo nome: cadastro
 * repetido é o erro mais comum de quem agenda com pressa, e juntar depois dá trabalho.
 */
export async function cadastrarPaciente(banco: BancoDaClinica, novo: NovoCadastro) {
  const nome = (novo.nome || '').replace(/\s+/g, ' ').trim();
  if (nome.length < 2 || nome.length > 120) throw new ErroDoConector('Informe o nome completo da paciente.');
  const telefone = (novo.telefone || '').trim();
  if (!buildWhatsAppUrl(telefone)) {
    throw new ErroDoConector('Telefone inválido: informe DDD e número (é por ele que sai o link no WhatsApp).');
  }
  if (novo.dataNascimento && !dataValida(novo.dataNascimento)) {
    throw new ErroDoConector('Data de nascimento inválida (use AAAA-MM-DD).');
  }
  const email = (novo.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroDoConector('E-mail inválido.');

  if (!novo.cadastrarMesmoAssim) {
    const final = digitosDe(telefone).slice(-8);
    const nomeNormalizado = normalizar(nome);
    const parecidas = (await banco.pacientes()).filter(
      (p) => (final.length === 8 && digitosDe(p.contato).endsWith(final)) || normalizar(p.nome) === nomeNormalizado
    );
    if (parecidas.length > 0) {
      return {
        cadastrada: false,
        motivo:
          'Já existe cadastro com este telefone ou este nome. Use o id de uma delas; se for mesmo outra pessoa, ' +
          'chame de novo com cadastrar_mesmo_assim = true.',
        parecidas: parecidas.slice(0, 5).map((p) => ({ id: p.id, nome: p.nome, telefone: p.contato || undefined })),
      };
    }
  }

  const agora = new Date().toISOString();
  const paciente: Patient = {
    id: `pat-${Date.now()}`,
    nome,
    contato: telefone,
    dataNascimento: novo.dataNascimento || undefined,
    email: email || undefined,
    createdAt: agora,
  };
  await banco.criarPaciente(paciente);
  return { cadastrada: true, paciente: { id: paciente.id, nome, telefone } };
}

const situacaoDoAtendimento = (a: Attendance): string => {
  if (a.status === 'faltou') return 'faltou';
  if (a.status === 'compareceu' || !a.status) return 'realizado';
  if (a.pedidoRemarcacao) return 'agendado — a cliente pediu outro horário';
  if (a.avisoAusenciaEm) return 'agendado — a cliente avisou que não vai';
  return a.confirmadoEm ? 'agendado — confirmado pela cliente' : 'agendado — aguardando confirmação';
};

export interface PedidoDeAgenda {
  dataInicial: string;
  dataFinal?: string;
  profissionalId?: string;
}

/** A agenda de um a 14 dias: o que está marcado e os horários livres de cada dia. */
export async function verAgenda(banco: BancoDaClinica, pedido: PedidoDeAgenda, agora: AgoraNaClinica) {
  const de = pedido.dataInicial;
  const ate = pedido.dataFinal || de;
  if (!dataValida(de) || !dataValida(ate)) throw new ErroDoConector('Datas no formato AAAA-MM-DD.');
  const dias = diasEntre(de, ate);
  if (dias < 0) throw new ErroDoConector('A data final vem antes da inicial.');
  if (dias > 13) throw new ErroDoConector('Consulte no máximo 14 dias por vez.');

  const [perfil, catalogo, atendimentos] = await Promise.all([
    perfilOuErro(banco),
    banco.procedimentos(),
    banco.atendimentosEntre(de, ate),
  ]);
  const profissionais = perfil.professionals || [];
  if (pedido.profissionalId && !profissionais.some((p) => p.id === pedido.profissionalId)) {
    throw new ErroDoConector('Profissional não encontrada. Veja os ids em ver_opcoes_de_agendamento.');
  }
  const salas = salasDaClinica(perfil);
  const visiveis = atendimentos.filter((a) => a.status !== 'remarcado');

  const resultado = [];
  for (let data = de; data <= ate; data = proximoDia(data)) {
    const doDia = visiveis
      .filter((a) => a.data === data && (!pedido.profissionalId || a.professionalId === pedido.profissionalId))
      .sort((a, b) => (minutosDoHHMM(a.hora) ?? 9999) - (minutosDoHHMM(b.hora) ?? 9999));
    // `horariosLivresDoDia` descarta o que já passou pelo relógio do servidor (UTC). Com um
    // "agora" à meia-noite ele não descarta nada, e o filtro de hoje é feito aqui, no fuso certo.
    const meiaNoite = new Date(2000, 0, 1, 0, 0);
    const livres = horariosLivresDoDia(data, doDia, perfil, catalogo, meiaNoite).filter(
      (h) => data > agora.data || (data === agora.data && (minutosDoHHMM(h) ?? 0) >= agora.minutos)
    );
    resultado.push({
      data,
      dia: nomeLongoDoDia(data),
      expediente: textoDoExpediente(perfil, data),
      atendimentos: doDia.map((a) => {
        const intervalo = intervaloDoAtendimento(a, catalogo);
        return {
          id: a.id,
          hora: a.hora || undefined,
          fim: intervalo ? hhmmDeMinutos(intervalo.fimMin) : undefined,
          paciente: a.pacienteNome,
          procedimento: nomeDosProcedimentos(a),
          profissional: a.profissionalNome || profissionais.find((p) => p.id === a.professionalId)?.name,
          sala: a.salaId ? salas.find((s) => s.id === a.salaId)?.nome : undefined,
          situacao: situacaoDoAtendimento(a),
        };
      }),
      horarios_livres: data < agora.data ? [] : livres,
    });
  }
  return {
    profissional: pedido.profissionalId
      ? profissionais.find((p) => p.id === pedido.profissionalId)?.name
      : 'todas (horário livre = ninguém marcado)',
    dias: resultado,
  };
}

// ==========================================
// AGENDAR
// ==========================================

export interface ProcedimentoPedido {
  procedimentoId: string;
  focos?: string[];
}

export interface PedidoDeAgendamento {
  pacienteId: string;
  procedimentos: ProcedimentoPedido[];
  profissionalId: string;
  data: string;
  hora: string;
  duracaoMin?: number;
  salaId?: string;
  observacoes?: string;
  /** A pessoa viu os avisos (profissional ocupada, fora do expediente) e quer agendar assim. */
  confirmarAvisos?: boolean;
}

/** Leva os atendimentos ao Google Agenda da profissional. Devolve o que dizer à pessoa. */
export type EnviarAoGoogle = (registros: Attendance[], perfil: ClinicProfile, catalogo: Procedure[]) => Promise<string>;

/** O endereço que a cliente abre — o mesmo do `buildPublicLink` do painel. */
export const enderecoDoLink = (perfil: ClinicProfile, token: string, clinicaId: string | null): string =>
  `${resolvePublicBase(perfil)}?agendamento=${encodeURIComponent(token)}` +
  (clinicaId ? `&c=${encodeURIComponent(clinicaId)}` : '');

/** A cópia pública da visita (`appointment_links`), como `garantirLinkDoAgendamento` monta. */
const snapshotDaVisita = (membros: Attendance[], perfil: ClinicProfile, catalogo: Procedure[]) => ({
  ...montarSnapshotDoLink(visitaComoUmAtendimento(membros), perfil, catalogo),
  attendanceIds: membros.length > 1 ? membros.map((m) => m.id) : undefined,
});

/** O que acompanha o link: a mensagem do painel e o atalho do WhatsApp para o telefone dela. */
const mensagemEWhatsApp = (perfil: ClinicProfile, membros: Attendance[], link: string, telefone?: string) => {
  const mensagem = mensagemDoLink(perfil, visitaComoUmAtendimento(membros), link);
  return { mensagem_whatsapp: mensagem, abrir_whatsapp: buildWhatsAppUrl(telefone, mensagem) || undefined };
};

export async function agendar(
  banco: BancoDaClinica,
  pedido: PedidoDeAgendamento,
  agora: AgoraNaClinica,
  enviarAoGoogle?: EnviarAoGoogle
) {
  // ---- O pedido em si ----
  if (!dataValida(pedido.data)) throw new ErroDoConector('Data inválida (use AAAA-MM-DD).');
  if (!HORA_HHMM.test(pedido.hora)) throw new ErroDoConector('Hora inválida (use HH:MM, 24 horas).');
  if (pedido.data < agora.data || (pedido.data === agora.data && (minutosDoHHMM(pedido.hora) ?? 0) < agora.minutos - 5)) {
    throw new ErroDoConector(`Esse horário já passou (agora são ${agora.hhmm} de ${agora.data}).`);
  }
  if (!pedido.procedimentos?.length) throw new ErroDoConector('Informe pelo menos um procedimento.');
  if (pedido.procedimentos.length > 5) throw new ErroDoConector('No máximo 5 procedimentos por visita.');
  if (pedido.duracaoMin !== undefined && !(Number.isInteger(pedido.duracaoMin) && pedido.duracaoMin >= 5 && pedido.duracaoMin <= 480)) {
    throw new ErroDoConector('Duração entre 5 e 480 minutos.');
  }
  const observacoes = (pedido.observacoes || '').trim();
  if (observacoes.length > 1000) throw new ErroDoConector('Observações com no máximo 1000 caracteres.');

  const [perfil, catalogo, paciente, doDia] = await Promise.all([
    perfilOuErro(banco),
    banco.procedimentos(),
    banco.paciente(pedido.pacienteId),
    banco.atendimentosEntre(pedido.data, pedido.data),
  ]);
  if (!paciente || paciente.juntadoA || paciente.arquivadoEm) {
    throw new ErroDoConector('Paciente não encontrada. Busque com buscar_pacientes ou cadastre com cadastrar_paciente.');
  }
  const profissional = (perfil.professionals || []).find((p) => p.id === pedido.profissionalId);
  if (!profissional) throw new ErroDoConector('Profissional não encontrada. Veja os ids em ver_opcoes_de_agendamento.');
  const sala = pedido.salaId ? salasDaClinica(perfil).find((s) => s.id === pedido.salaId) : undefined;
  if (pedido.salaId && !sala) throw new ErroDoConector('Sala não encontrada. Veja os ids em ver_opcoes_de_agendamento.');

  const avisos: string[] = [];
  const linhas = pedido.procedimentos.map((pp) => {
    const proc = catalogo.find((c) => c.id === pp.procedimentoId);
    if (!proc) {
      throw new ErroDoConector(`Procedimento "${pp.procedimentoId}" não encontrado. Veja os ids em ver_opcoes_de_agendamento.`);
    }
    const disponiveis = proc.focos || [];
    const focos = (pp.focos || []).map((f) => {
      const achado = disponiveis.find((d) => normalizar(d) === normalizar(f));
      if (!achado) {
        throw new ErroDoConector(
          disponiveis.length > 0
            ? `"${f}" não é um foco de ${proc.title}. Os focos são: ${disponiveis.join(', ')}.`
            : `${proc.title} não tem focos cadastrados; agende sem foco.`
        );
      }
      return achado;
    });
    if (proc.assignedDoctorIds?.length && !proc.assignedDoctorIds.includes(profissional.id)) {
      avisos.push(`${profissional.name} não está entre as profissionais cadastradas para ${proc.title}.`);
    }
    return { procedureId: proc.id, procedimentoNome: proc.title.trim(), focos: Array.from(new Set(focos)) };
  });

  // ---- Os atendimentos, como o formulário do painel monta ----
  // O total é o digitado ou, sem ele, a soma do catálogo — o formulário grava sempre um dos dois
  // (`duracaoDigitada ?? duracaoSugerida`), e o agendamento não muda de tamanho se o catálogo mudar.
  const total = pedido.duracaoMin ?? duracaoDosProcedimentos(linhas, catalogo);
  const duracoes = duracoesDasLinhas(linhas, total, catalogo);
  const horas = horariosEmSequencia(
    pedido.hora,
    duracoes.map((d) => d ?? AGENDA_DEFAULTS.duracaoMin)
  );
  const agoraIso = new Date().toISOString();
  const carimbo = Date.now();
  const grupoId = linhas.length > 1 ? `vis-${crypto.randomUUID().slice(0, 13)}` : undefined;
  const token = crypto.randomUUID();
  const registros: Attendance[] = linhas.map((l, i) => ({
    id: linhas.length > 1 ? `atd-${carimbo}-${i}` : `atd-${carimbo}`,
    pacienteId: paciente.id,
    pacienteNome: paciente.nome,
    data: pedido.data,
    hora: horas[i],
    duracaoMin: duracoes[i],
    procedureId: l.procedureId,
    procedimentoNome: l.procedimentoNome,
    focos: l.focos.length > 0 ? l.focos : undefined,
    grupoId,
    professionalId: profissional.id,
    profissionalNome: profissional.name,
    salaId: sala?.id,
    observacoes: observacoes || undefined,
    status: 'agendado',
    linkToken: token,
    createdAt: agoraIso,
    updatedAt: agoraIso,
  }));

  // ---- Conflitos: sala impede, o resto pede confirmação ----
  const descrever = (a: Attendance) => {
    const i = intervaloDoAtendimento(a, catalogo);
    return `${a.pacienteNome} (${nomeDosProcedimentos(a)}, ${a.hora}${i ? `–${hhmmDeMinutos(i.fimMin)}` : ''})`;
  };
  const ocupandoSala = registros.flatMap((r) => conflitosDeSala(r, doDia, catalogo));
  if (ocupandoSala.length > 0) {
    throw new ErroDoConector(
      `A sala ${sala?.nome} já está ocupada nesse horário: ${Array.from(new Set(ocupandoSala.map(descrever))).join('; ')}. ` +
        'Escolha outro horário ou outra sala.'
    );
  }
  const daProfissional = Array.from(new Set(registros.flatMap((r) => conflitosDe(r, doDia, catalogo)).map(descrever)));
  if (daProfissional.length > 0) {
    avisos.push(`${profissional.name} já tem atendimento nesse horário: ${daProfissional.join('; ')}.`);
  }
  const expediente = expedienteDoDia(perfil, pedido.data);
  const almoco = almocoDoDia(perfil, pedido.data);
  const inicio = minutosDoHHMM(pedido.hora)!;
  const ultimo = intervaloDoAtendimento(registros[registros.length - 1], catalogo);
  const fim = ultimo ? ultimo.fimMin : inicio + AGENDA_DEFAULTS.duracaoMin;
  if (!expediente) {
    avisos.push(`A clínica não abre ${nomeLongoDoDia(pedido.data).toLowerCase()}.`);
  } else if (inicio < expediente.abreMin || fim > expediente.fechaMin) {
    avisos.push(`O horário (${pedido.hora}–${hhmmDeMinutos(fim)}) passa do expediente (${textoDoExpediente(perfil, pedido.data)}).`);
  }
  if (almoco && inicio < almoco.fimMin && almoco.inicioMin < fim) {
    avisos.push(`O horário cai no almoço (${hhmmDeMinutos(almoco.inicioMin)}–${hhmmDeMinutos(almoco.fimMin)}).`);
  }
  if (avisos.length > 0 && !pedido.confirmarAvisos) {
    return {
      agendado: false,
      precisa_confirmar: true,
      avisos,
      orientacao:
        'Nada foi gravado. Conte os avisos à pessoa; se ela quiser agendar assim mesmo, chame de novo ' +
        'com confirmar_avisos = true.',
    };
  }

  // ---- Gravar: atendimentos e link, juntos ----
  const snapshot = snapshotDaVisita(registros, perfil, catalogo);
  await banco.criarVisita(registros, {
    token,
    dados: limpar({ ...snapshot, respostaPendente: false, createdAt: agoraIso, updatedAt: agoraIso }),
  });

  let googleAgenda = 'não enviado';
  if (enviarAoGoogle) {
    try {
      googleAgenda = await enviarAoGoogle(registros, perfil, catalogo);
    } catch (e) {
      console.warn('[conector-claude] Google Agenda falhou depois de agendar:', (e as Error).message);
      googleAgenda = 'não foi possível enviar agora; o painel envia quando for aberto';
    }
  }

  const link = enderecoDoLink(perfil, token, banco.clinicaId);
  return {
    agendado: true,
    atendimentos: registros.map((r) => ({ id: r.id, hora: r.hora, procedimento: nomeDosProcedimentos(r) })),
    resumo: {
      paciente: paciente.nome,
      quando: `${dataExtensa(pedido.data)} às ${pedido.hora}, até ${hhmmDeMinutos(fim)}`,
      procedimentos: registros.map((r) => r.procedimentoNome + (r.focos?.length ? ` (${r.focos.join(', ')})` : '')).join(' + '),
      profissional: profissional.name,
      sala: sala?.nome,
    },
    avisos_confirmados: avisos.length > 0 ? avisos : undefined,
    link_de_confirmacao: link,
    ...mensagemEWhatsApp(perfil, registros, link, paciente.contato),
    google_agenda: googleAgenda,
  };
}

/** O link de confirmação de um agendamento que já existe (feito pelo painel ou pelo Claude). */
export async function linkDeConfirmacao(banco: BancoDaClinica, atendimentoId: string) {
  const atendimento = await banco.atendimento(atendimentoId);
  if (!atendimento) throw new ErroDoConector('Agendamento não encontrado. Veja os ids em ver_agenda.');
  if (atendimento.status !== 'agendado') {
    throw new ErroDoConector('Só agendamentos ainda em aberto têm link de confirmação (este já foi realizado, faltou ou foi remarcado).');
  }
  const [perfil, catalogo, doGrupo, paciente] = await Promise.all([
    perfilOuErro(banco),
    banco.procedimentos(),
    atendimento.grupoId ? banco.atendimentosDoGrupo(atendimento.grupoId) : Promise.resolve([] as Attendance[]),
    banco.paciente(atendimento.pacienteId),
  ]);
  const membros = membrosDaVisita(atendimento, doGrupo);
  const token = atendimento.linkToken || membros.find((m) => m.linkToken)?.linkToken || crypto.randomUUID();
  await banco.gravarLink(
    token,
    snapshotDaVisita(membros, perfil, catalogo),
    membros.filter((m) => m.linkToken !== token).map((m) => m.id)
  );
  const link = enderecoDoLink(perfil, token, banco.clinicaId);
  return {
    paciente: atendimento.pacienteNome,
    quando: `${dataExtensa(atendimento.data)}${atendimento.hora ? ` às ${atendimento.hora}` : ''}`,
    link_de_confirmacao: link,
    ...mensagemEWhatsApp(perfil, membros, link, paciente?.contato),
  };
}

// ==========================================
// GOOGLE AGENDA
// ==========================================

/** Salva eventos num calendário (ver `salvarEventosPeloServidor`, em `server/googleAgenda.ts`). */
export type SalvarEventos = (
  tokenCifrado: string,
  calendarioId: string,
  eventos: { eventoId: string; evento: EventoGoogle }[]
) => Promise<{ eventoId: string; ok: boolean }[]>;

/**
 * Leva ao Google Agenda os atendimentos recém-criados, como o painel faria ao abrir, e grava a
 * marca de cada um (`googleAgenda`) — assim o painel, ao abrir, vê que já está em dia e não
 * reenvia. Se nada disso der certo, não há perda: o painel aberto envia o que estiver sem marca.
 */
export const criarEnvioAoGoogle =
  (banco: BancoDaClinica, salvar: SalvarEventos): EnviarAoGoogle =>
  async (registros, perfil, catalogo) => {
    const { ligado, contas } = await banco.googleAgenda();
    if (!ligado) return 'Google Agenda não está ligado para esta clínica';
    const profissionalId = registros[0]?.professionalId;
    const conta = profissionalId ? contas[profissionalId] : undefined;
    if (!conta || conta.erro || !conta.tokenCifrado || !conta.calendarioId) {
      return conta?.erro
        ? 'a profissional precisa reconectar o Google Agenda no painel (Configurações → Agenda)'
        : 'a profissional não conectou o Google Agenda';
    }
    const eventos = registros
      .map((a) => ({ a, evento: eventoDoAtendimento(a, catalogo, perfil) }))
      .filter((x): x is { a: Attendance; evento: EventoGoogle } => !!x.evento);
    const resultados = await salvar(
      conta.tokenCifrado,
      conta.calendarioId,
      eventos.map(({ a, evento }) => ({ eventoId: idDoEventoGoogle(a.id), evento }))
    );
    let enviados = 0;
    for (const { a, evento } of eventos) {
      if (!resultados.find((r) => r.eventoId === idDoEventoGoogle(a.id))?.ok) continue;
      await banco.marcarGoogle(a.id, {
        profissionalId: profissionalId!,
        calendarioId: conta.calendarioId,
        assinatura: assinaturaDoEvento(a.id, conta.calendarioId, evento),
      });
      enviados++;
    }
    return enviados === eventos.length
      ? 'enviado ao Google Agenda da profissional'
      : 'não foi possível enviar agora; o painel envia quando for aberto';
  };
