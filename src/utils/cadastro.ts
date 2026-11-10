/**
 * O cadastro sozinho de uma clínica na plataforma (etapa 3 de docs/zulia-plataforma.md).
 *
 * Puro (sem Firebase), para valer igual no painel (`src/components/auth/CadastroDaClinica.tsx`)
 * e no servidor (`server/cadastro.ts`).
 */

/**
 * O cadastro está aberto para qualquer pessoa? Com `false`, o link "Criar conta da clínica" some da
 * tela de login e o servidor recusa clínica nova (quem já tem clínica continua entrando).
 */
export const CADASTRO_ABERTO = true;

export const NOME_MINIMO = 2;
export const NOME_MAXIMO = 80;

/** Uma senha nova precisa de pelo menos isto (o Firebase aceita 6; a plataforma pede mais). */
export const SENHA_MINIMA = 8;

/**
 * O nome (da clínica ou da pessoa) como deve ser gravado: sem espaços sobrando e sem caracteres de
 * controle. `null` quando não serve (vazio, curto ou longo demais).
 */
export function nomeLimpo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (limpo.length < NOME_MINIMO || limpo.length > NOME_MAXIMO) return null;
  return limpo;
}

/** Os motivos de recusa do servidor (`erro` da resposta), e a frase para a tela. */
export function mensagemDoCadastro(codigo: string): string {
  switch (codigo) {
    case 'email-nao-confirmado':
      return 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos e tente de novo.';
    case 'ja-tem-clinica':
      return 'Este login já é de uma clínica. Saia e entre de novo para abrir o painel.';
    case 'dono':
      return 'O login do dono da plataforma não cria clínica. Use outro e-mail.';
    case 'nome-invalido':
      return `Informe o nome da clínica (de ${NOME_MINIMO} a ${NOME_MAXIMO} letras).`;
    case 'cadastro-fechado':
      return 'O cadastro de clínicas novas está fechado no momento.';
    case 'muitos-pedidos':
      return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
    case 'aceite-pendente':
      return 'Para continuar, marque que você aceita os Termos de Uso, a Política de Privacidade e o Acordo de Tratamento de Dados.';
    case 'so-admin':
      return 'Só a administradora da clínica aceita os documentos em nome dela.';
    case 'versao-antiga':
      return 'Os documentos foram atualizados. Recarregue a página e leia a versão nova.';
    case 'em-andamento':
      return 'Sua clínica já está sendo criada. Aguarde um instante.';
    case 'login':
      return 'Sua sessão expirou. Saia e entre de novo.';
    case 'servidor-nao-configurado':
      return 'O servidor da plataforma está em manutenção. Tente de novo em alguns minutos.';
    case 'sem-servidor':
      // Acontece na prévia do AI Studio, que roda só a parte visual do site, sem o servidor.
      return 'O servidor da plataforma não respondeu. Abra o painel pelo endereço do site (não pela prévia de edição) e tente de novo.';
    case 'rede':
      return 'Sem conexão. Confira a internet e tente de novo.';
    default:
      return 'Não foi possível criar a clínica agora. Tente de novo em alguns minutos.';
  }
}

/** A frase para a tela quando o aceite dos documentos não deu certo. */
export function mensagemDoAceite(codigo: string): string {
  const conhecidas = ['so-admin', 'versao-antiga', 'login', 'servidor-nao-configurado', 'sem-servidor', 'rede'];
  return conhecidas.includes(codigo)
    ? mensagemDoCadastro(codigo)
    : 'Não foi possível registrar o aceite agora. Tente de novo em alguns minutos.';
}
