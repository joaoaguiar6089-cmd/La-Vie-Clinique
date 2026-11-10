import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile, type User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { documentoDaPlataforma } from '../lib/clinicaAtual';
import { aceiteEmDia, VERSAO_DOS_DOCUMENTOS } from '../utils/documentosLegais';

/**
 * O cadastro sozinho de uma clínica, do lado do navegador (ver `server/cadastro.ts`):
 * criar o login, confirmar o e-mail e pedir ao servidor a clínica.
 */

/** O que a pessoa digitou no formulário, para preencher a tela de criar a clínica depois de confirmar o e-mail. */
export interface CadastroPendente {
  clinica: string;
  nome: string;
  email: string;
  /** Marcou o aceite dos documentos no formulário (vale para a versão em vigor). */
  aceitou?: string;
}

const CHAVE_PENDENTE = 'venus:cadastro-pendente';

/** Guarda neste navegador. Se a confirmação for aberta em outro aparelho, a tela pede o nome de novo. */
function guardarCadastroPendente(pendente: CadastroPendente): void {
  try {
    localStorage.setItem(CHAVE_PENDENTE, JSON.stringify(pendente));
  } catch {
    // Sem armazenamento (aba anônima, por exemplo): a tela pede o nome de novo.
  }
}

export function lerCadastroPendente(email: string | null | undefined): CadastroPendente | null {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_PENDENTE) || 'null') as CadastroPendente | null;
    if (!dados || typeof dados.clinica !== 'string') return null;
    // De outro login neste mesmo navegador, não serve.
    if (email && dados.email && dados.email.toLowerCase() !== email.toLowerCase()) return null;
    return dados;
  } catch {
    return null;
  }
}

function esquecerCadastroPendente(): void {
  try {
    localStorage.removeItem(CHAVE_PENDENTE);
  } catch {
    // nada a fazer
  }
}

/** Para onde o link do e-mail de confirmação leva de volta: o próprio site. */
const voltarParaOSite = () => ({ url: `${window.location.origin}/` });

/** Manda (ou reenvia) o e-mail de confirmação, em português. */
export async function enviarConfirmacaoDeEmail(usuario: User | null = auth.currentUser): Promise<void> {
  if (!usuario) throw Object.assign(new Error('sem login'), { code: 'login' });
  auth.languageCode = 'pt-BR';
  try {
    await sendEmailVerification(usuario, voltarParaOSite());
  } catch (erro) {
    const codigo = (erro as { code?: string })?.code || '';
    // Endereço fora dos domínios autorizados do login (um teste local, por exemplo): manda sem o
    // botão de voltar ao site. A confirmação vale do mesmo jeito.
    if (codigo === 'auth/unauthorized-continue-uri' || codigo === 'auth/invalid-continue-uri') {
      await sendEmailVerification(usuario);
      return;
    }
    throw erro;
  }
}

/**
 * Cria o login da futura admin e manda o e-mail de confirmação. Quando isto termina, o login já
 * está aberto: o painel passa sozinho para a tela de confirmar o e-mail.
 */
export async function criarContaDaClinica(dados: CadastroPendente & { senha: string }): Promise<void> {
  const email = dados.email.trim();
  guardarCadastroPendente({ clinica: dados.clinica.trim(), nome: dados.nome.trim(), email, aceitou: dados.aceitou });
  auth.languageCode = 'pt-BR';
  const { user } = await createUserWithEmailAndPassword(auth, email, dados.senha);
  await updateProfile(user, { displayName: dados.nome.trim() }).catch(() => {});
  await enviarConfirmacaoDeEmail(user);
}

/**
 * O e-mail já foi confirmado? Recarrega o login (a confirmação acontece em outra aba) e, se sim,
 * pede um token novo, que é o que o servidor confere.
 */
export async function emailFoiConfirmado(): Promise<boolean> {
  const usuario = auth.currentUser;
  if (!usuario) return false;
  await usuario.reload();
  if (!auth.currentUser?.emailVerified) return false;
  await auth.currentUser.getIdToken(true);
  return true;
}

/**
 * A resposta veio do servidor da plataforma? Ele sempre responde em JSON. Sem ele (a prévia do AI
 * Studio roda só a parte visual do site), vem um 404 ou a própria página do painel.
 */
const respostaDoServidor = (resposta: Response): boolean =>
  (resposta.headers.get('content-type') || '').includes('application/json');

export class ErroDoCadastro extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}

/**
 * Pede ao servidor a clínica, com este login de admin. Depois pede um token novo, já com a claim
 * da clínica: é com ele que o painel abre. Devolve o id da clínica.
 */
export async function criarMinhaClinica(nome: string, admin: string): Promise<string> {
  const usuario = auth.currentUser;
  if (!usuario) throw new ErroDoCadastro('login');
  const token = await usuario.getIdToken();
  let resposta: Response;
  try {
    resposta = await fetch('/api/cadastro/clinica', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nome: nome.trim(), admin: admin.trim(), aceite: VERSAO_DOS_DOCUMENTOS }),
    });
  } catch {
    throw new ErroDoCadastro('rede');
  }
  if (!respostaDoServidor(resposta)) throw new ErroDoCadastro('sem-servidor');
  const json: { clinicaId?: string; erro?: string } = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !json.clinicaId) throw new ErroDoCadastro(json.erro || `http-${resposta.status}`);
  await usuario.getIdToken(true);
  esquecerCadastroPendente();
  return json.clinicaId;
}

// ==========================================
// ACEITE DOS DOCUMENTOS (clínica que já existe)
// ==========================================

/**
 * O aceite da clínica está na versão em vigor? Acompanha `clinicas/{c}.aceites.termos`. No modo
 * legado não há documento da clínica: sempre em dia.
 */
export function assinarAceiteDosDocumentos(onUpdate: (emDia: boolean) => void): () => void {
  const ref = documentoDaPlataforma();
  if (!ref) {
    onUpdate(true);
    return () => {};
  }
  return onSnapshot(
    ref,
    (snap) => onUpdate(aceiteEmDia(snap.data()?.aceites?.termos)),
    // Sem ler, não incomoda: o pedido de aceite volta na próxima leitura.
    () => onUpdate(true)
  );
}

/** A admin aceita a versão em vigor, em nome da clínica (`POST /api/cadastro/aceite`). */
export async function aceitarDocumentos(): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new ErroDoCadastro('login');
  let resposta: Response;
  try {
    resposta = await fetch('/api/cadastro/aceite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ versao: VERSAO_DOS_DOCUMENTOS }),
    });
  } catch {
    throw new ErroDoCadastro('rede');
  }
  if (!respostaDoServidor(resposta)) throw new ErroDoCadastro('sem-servidor');
  if (!resposta.ok) {
    const json: { erro?: string } = await resposta.json().catch(() => ({}));
    throw new ErroDoCadastro(json.erro || `http-${resposta.status}`);
  }
}
