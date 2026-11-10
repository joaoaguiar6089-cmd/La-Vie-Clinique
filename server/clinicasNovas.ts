/**
 * Cria uma clínica na plataforma: o documento `clinicas/{id}`, o login da admin com as claims e os
 * perfis mínimos. Usado pelo cadastro sozinho (`server/cadastro.ts`, rota `/api/cadastro`) e pelo
 * `scripts/criar-clinica.ts`. Pelo Admin SDK: nada aqui passa pelas regras.
 *
 * O que faz:
 *   1. confere o login da admin: o de outra clínica e o do dono da plataforma são recusados;
 *   2. gera o id aleatório da clínica (`src/utils/clinicas.ts`), que nunca muda;
 *   3. grava `clinicas/{id}`: nome, plano, situação, dona, datas, `recursos` e o índice da equipe;
 *   4. cria o login da admin (ou reaproveita o que já existe, sem clínica) e grava as claims
 *      `clinicaId` e `papel: 'admin'`;
 *   5. grava `clinic_settings/main_profile` e `public_profile` mínimos, com o nome da clínica e a
 *      admin na equipe.
 *
 * As sementes (fichas padrão e os 2 procedimentos de exemplo) entram no primeiro login dela, pelo
 * painel. Nada da La Vie é copiado.
 */
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { gerarIdDeClinica, idDeClinicaValido } from '../src/utils/clinicas';
import type { AceiteDosTermos } from '../src/utils/documentosLegais';

/** O que a criação precisa do Admin SDK. */
export interface AcessoDeServidor {
  db: Firestore;
  auth: Auth;
}

export type Plano = 'gratuito' | 'completo';

export interface PedidoDeClinica {
  nome: string;
  email: string;
  /** O nome da admin na equipe. Ausente: a parte do e-mail antes do @. */
  admin?: string;
  plano?: Plano;
  /** Completo sem pagar (a La Vie, por exemplo). */
  cortesia?: boolean;
  googleAgenda?: boolean;
  /** Um id escolhido (testes, migração). Ausente: aleatório. */
  id?: string;
  /** Quem criou, gravado em `clinicas/{id}.criadaPor`. Ausente: o script. */
  criadaPor?: string;
  /** O aceite dos Termos (cadastro sozinho), gravado em `clinicas/{id}.aceites.termos`. */
  aceite?: AceiteDosTermos;
}

export interface ClinicaCriada {
  id: string;
  uid: string;
  loginJaExistia: boolean;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Um id que ainda não existe. */
async function idLivre(zulia: AcessoDeServidor, pedido?: string): Promise<string> {
  if (pedido) {
    const id = idDeClinicaValido(pedido);
    if (!id) throw new Error(`"${pedido}" não serve de id de clínica (letras, números, - e _, de 3 a 40).`);
    if ((await zulia.db.doc(`clinicas/${id}`).get()).exists) throw new Error(`A clínica ${id} já existe.`);
    return id;
  }
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const id = gerarIdDeClinica();
    if (!(await zulia.db.doc(`clinicas/${id}`).get()).exists) return id;
  }
  throw new Error('Não achei um id livre em 10 tentativas — algo está errado.');
}

export async function criarClinica(zulia: AcessoDeServidor, pedido: PedidoDeClinica): Promise<ClinicaCriada> {
  const nome = pedido.nome.trim();
  const email = pedido.email.trim().toLowerCase();
  if (!nome) throw new Error('Falta o nome da clínica (--nome).');
  if (!EMAIL.test(email)) throw new Error('Falta o e-mail da admin (--email), ou ele não é válido.');
  const plano: Plano = pedido.plano === 'completo' || pedido.cortesia ? 'completo' : 'gratuito';

  // O login primeiro: se o e-mail já é de outra clínica, nada é gravado.
  let usuario = await zulia.auth.getUserByEmail(email).catch(() => null);
  if (usuario?.customClaims?.clinicaId) {
    throw new Error(`O e-mail ${email} já é login da clínica ${usuario.customClaims.clinicaId}. Um login é de uma clínica só.`);
  }
  if (usuario?.customClaims?.donoDaPlataforma) {
    throw new Error(`O e-mail ${email} é o login do dono da plataforma. A admin da clínica precisa de outro.`);
  }
  const loginJaExistia = !!usuario;

  const id = await idLivre(zulia, pedido.id);
  if (!usuario) {
    usuario = await zulia.auth.createUser({
      email,
      // Ninguém usa esta senha: a admin define a dela pelo e-mail de convite.
      password: `${crypto.randomUUID()}-Aa1`,
      displayName: pedido.admin?.trim() || undefined,
    });
  }
  const uid = usuario.uid;
  const agora = new Date().toISOString();
  const nomeDaAdmin = pedido.admin?.trim() || email.split('@')[0];
  const profissional = { id: `prof-${uid.slice(0, 8)}`, name: nomeDaAdmin, email, uid, isAdmin: true };

  const base = `clinicas/${id}`;
  const lote = zulia.db.batch();
  lote.set(zulia.db.doc(base), {
    nome,
    plano,
    cortesia: !!pedido.cortesia,
    situacao: 'ativa',
    dona: { uid, email },
    recursos: { googleAgenda: !!pedido.googleAgenda },
    // Índice da equipe ({ uid: papel }), que só o servidor grava — ver server/equipe.ts.
    equipe: { [uid]: 'admin' },
    criadaEm: agora,
    atualizadaEm: agora,
    criadaPor: pedido.criadaPor || 'scripts/criar-clinica.ts',
    // Os contadores do plano (ver src/utils/planos.ts). As sementes do primeiro login sobem os
    // procedimentos para 2.
    uso: { clientes: 0, procedimentos: 0 },
    ...(pedido.aceite ? { aceites: { termos: pedido.aceite } } : {}),
  });
  lote.set(zulia.db.doc(`${base}/clinic_settings/main_profile`), {
    name: nome,
    tagline: '',
    professionals: [profissional],
    equipeUids: [uid],
    phone: '',
    instagram: '',
    address: '',
    cityState: '',
    updatedAt: agora,
  });
  lote.set(zulia.db.doc(`${base}/clinic_settings/public_profile`), {
    name: nome,
    tagline: '',
    phone: '',
    instagram: '',
    address: '',
    cityState: '',
    professionals: [{ id: profissional.id, name: profissional.name }],
    updatedAt: agora,
  });
  await lote.commit();

  // As claims depois do documento: quando ela entrar, a clínica já existe.
  await zulia.auth.setCustomUserClaims(uid, { ...(usuario.customClaims || {}), clinicaId: id, papel: 'admin' });
  if (usuario.disabled) await zulia.auth.updateUser(uid, { disabled: false });

  return { id, uid, loginJaExistia };
}
