import { auth } from '../lib/firebase';

/**
 * O painel do dono da plataforma, pelo servidor (`/api/dono`, ver `server/dono.ts`). Só o login do
 * dono, que entrou com o segundo fator.
 */

export interface ClinicaParaODono {
  id: string;
  nome: string;
  plano: 'gratuito' | 'completo';
  cortesia: boolean;
  situacao: string;
  criadaEm: string | null;
  criadaPor: string | null;
  dona: string | null;
  uso: { clientes: number; procedimentos: number };
  logins: number;
  ultimoAcesso: string | null;
  espacoBytes: number | null;
  aceiteEmDia: boolean;
  /** Conta encerrada: quando, e a partir de quando os dados podem ser apagados (90 dias depois). */
  encerramento: { em: string; por: string | null; apagarAPartirDe: string; apagarAte: string } | null;
}

export interface TotaisDoDono {
  clinicas: number;
  completo: number;
  cortesia: number;
  gratuito: number;
  suspensas: number;
  encerradas: number;
  /** Encerradas há 90 dias ou mais: o prazo de apagar já correu. */
  paraApagar: number;
  clientes: number;
  procedimentos: number;
  logins: number;
  espacoBytes: number;
}

export class ErroDoDono extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}

async function chamar<T>(metodo: 'GET' | 'POST', rota: string, corpo?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new ErroDoDono('login');
  let resposta: Response;
  try {
    resposta = await fetch(`/api/dono/${rota}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroDoDono('rede');
  }
  if (!(resposta.headers.get('content-type') || '').includes('application/json')) throw new ErroDoDono('sem-servidor');
  const json = (await resposta.json().catch(() => ({}))) as T & { erro?: string };
  if (!resposta.ok) throw new ErroDoDono(json.erro || `http-${resposta.status}`);
  return json;
}

export const listarClinicasDoDono = () => chamar<{ clinicas: ClinicaParaODono[]; totais: TotaisDoDono }>('GET', 'clinicas');

export const mudarPlanoDaClinica = (clinicaId: string, plano: 'gratuito' | 'completo', cortesia: boolean) =>
  chamar<{ ok: true; uso: { clientes: number; procedimentos: number } }>('POST', 'plano', { clinicaId, plano, cortesia });

export const mudarSituacaoDaClinica = (clinicaId: string, situacao: 'ativa' | 'suspensa') =>
  chamar<{ ok: true }>('POST', 'situacao', { clinicaId, situacao });

export const encerrarContaDaClinica = (clinicaId: string) =>
  chamar<{ ok: true; apagarAPartirDe: string }>('POST', 'encerrar', { clinicaId });

export const desfazerEncerramentoDaClinica = (clinicaId: string) =>
  chamar<{ ok: true }>('POST', 'desfazer-encerramento', { clinicaId });

/** Apaga de vez uma clínica encerrada há 90 dias. `confirmacao` é o id digitado pelo dono. */
export const apagarDadosDaClinica = (clinicaId: string, confirmacao: string) =>
  chamar<{ ok: true; arquivos: number; logins: number }>('POST', 'apagar', { clinicaId, confirmacao });

export function mensagemDoDono(erro: unknown): string {
  const codigo = erro instanceof ErroDoDono ? erro.codigo : '';
  switch (codigo) {
    case 'duas-etapas':
      return 'Esta sessão entrou sem o código do autenticador. Saia e entre de novo com a senha e o código.';
    case 'so-dono':
      return 'Este login não é o do dono da plataforma.';
    case 'login':
      return 'Sua sessão expirou. Saia e entre de novo.';
    case 'servidor-nao-configurado':
      return 'O servidor da plataforma está sem a credencial. Confira os Secrets do AI Studio.';
    case 'sem-servidor':
      return 'O servidor da plataforma não respondeu. Abra o painel pelo endereço do site (não pela prévia de edição).';
    case 'rede':
      return 'Sem conexão. Confira a internet e tente de novo.';
    case 'clinica-nao-encontrada':
      return 'A clínica não existe mais.';
    case 'encerrada':
      return 'Esta conta está encerrada. Para voltar a usar, desfaça o encerramento.';
    case 'nao-encerrada':
      return 'Só uma conta encerrada pode ter os dados apagados.';
    case 'prazo-nao-venceu':
      return 'Os 90 dias de guarda depois do encerramento ainda não passaram.';
    case 'sem-permissao-arquivos':
      return 'A conta do servidor não pode apagar arquivos. No Google Cloud, dê à conta do servidor o papel "Administrador de objetos do Storage" e tente de novo — nada foi apagado.';
    case 'pedido-invalido':
      return 'Confira o que foi digitado e tente de novo.';
    default:
      return 'Não foi possível concluir agora. Tente de novo em alguns minutos.';
  }
}
