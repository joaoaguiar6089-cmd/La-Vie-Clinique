import type { AnamnesisRecord, LaserAreaRef, Patient } from '../types';
import { clinicaAtual } from '../lib/estadoDaClinica';

/**
 * A página da paciente fala com o servidor para abrir e salvar a ficha — ver `server/fichaPublica.ts`.
 *
 * Antes ela lia e gravava `patients` e `anamnesis_records` direto no banco, o que obrigava as
 * regras a deixar essas coleções abertas para qualquer pessoa. Agora só o servidor toca nelas em
 * nome da paciente, e só no que o link dela dá direito.
 */

export class ErroDaFichaPublica extends Error {
  constructor(
    readonly codigo: string,
    readonly status: number
  ) {
    super(codigo);
  }
}

export interface RespostaAbrirFicha {
  ficha: AnamnesisRecord | null;
  paciente: Patient | null;
  respostasAnteriores: Record<string, any> | null;
  precisaConfirmar?: { pedeNascimento: boolean };
}

export interface ContextoDoLink {
  ficha?: string;
  anamnese?: string;
  paciente?: string;
}

export interface PedidoSalvarFicha extends ContextoDoLink {
  dadosPaciente: Pick<Patient, 'nome' | 'contato' | 'dataNascimento' | 'genero' | 'cpf' | 'email'>;
  dadosFicha: {
    respostasGerais: Record<string, any>;
    respostasEspecificas: Record<string, any>;
    fotoPacienteUrl?: string;
    fotoModeloUrl?: string;
    areasSolicitadas?: LaserAreaRef[];
    professionalId?: string;
    profissionalNome?: string;
    perguntasSnapshot?: AnamnesisRecord['perguntasSnapshot'];
    procedimentoNome?: string;
  };
}

const PRAZO_MS = 20000;

async function chamar<T>(rota: string, corpo: unknown): Promise<T> {
  // AbortController à mão, e não AbortSignal.timeout: celulares mais antigos (iOS 15) não têm o
  // segundo, e é no celular da paciente que esta página abre.
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), PRAZO_MS);
  let resposta: Response;
  try {
    resposta = await fetch(`/api/ficha-publica/${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Na Zulia, a clínica do link (`c`) vai junto: o servidor lê e grava só nela.
      body: JSON.stringify({ ...(corpo as object), ...(clinicaAtual() ? { c: clinicaAtual() } : {}) }),
      signal: controle.signal,
    });
  } finally {
    clearTimeout(prazo);
  }
  const json: any = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroDaFichaPublica(json?.erro || `http-${resposta.status}`, resposta.status);
  return json as T;
}

/** A ficha e a paciente do link. Com `cpf` e `nascimento`, confirma a identidade para abrir uma ficha fechada. */
export const abrirFichaPublica = (pedido: ContextoDoLink & { cpf?: string; nascimento?: string }) =>
  chamar<RespostaAbrirFicha>('abrir', pedido);

export const salvarFichaPublica = async (pedido: PedidoSalvarFicha): Promise<AnamnesisRecord> =>
  (await chamar<{ ficha: AnamnesisRecord }>('salvar', pedido)).ficha;

/** Uma frase para a paciente, a partir do erro do servidor. `padrao` quando não há nada melhor a dizer. */
export function mensagemDoErroDaFicha(erro: unknown, padrao: string): string {
  if (!(erro instanceof ErroDaFichaPublica)) return padrao;
  switch (erro.codigo) {
    case 'ficha-nao-encontrada':
      return 'Não encontramos essa ficha. O link pode estar incorreto ou ter expirado.';
    case 'modelo-nao-encontrado':
      return 'Não encontramos essa ficha de anamnese. Peça um novo link à clínica.';
    case 'link-invalido':
      return 'Link inválido — faltam informações para abrir a ficha de anamnese.';
    case 'ficha-fechada':
      return 'Seu atendimento já foi realizado e esta ficha não pode mais ser editada.';
    case 'identidade':
      return 'CPF ou data de nascimento não confere. Confira os dados e tente novamente.';
    case 'tentativas':
      return 'Muitas tentativas com dados que não conferem. Aguarde uma hora ou fale com a clínica.';
    case 'muitos-pedidos':
      return 'Muitos acessos em pouco tempo. Aguarde alguns minutos e tente novamente.';
    case 'nome-obrigatorio':
      return 'Preencha o seu nome para enviar a ficha.';
    case 'servidor-nao-configurado':
      return 'A ficha online está temporariamente indisponível. Avise a clínica, por favor.';
    case 'clinica-nao-encontrada':
      return 'Este link está incompleto. Peça um novo link à clínica.';
    default:
      return padrao;
  }
}
