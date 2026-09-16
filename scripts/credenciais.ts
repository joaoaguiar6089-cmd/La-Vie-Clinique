/**
 * Pergunta o login da clínica no terminal, com a senha oculta.
 *
 * Por que não basta variável de ambiente: a forma `FIREBASE_EMAIL=... comando` só existe no bash.
 * No PowerShell — o terminal padrão do Windows, onde estes scripts rodam — ela nem é sintaxe
 * válida: o shell tenta executar `FIREBASE_EMAIL=...` como se fosse um programa. E mesmo onde
 * funciona, a senha fica gravada no histórico do terminal, que é um arquivo de texto comum.
 *
 * Perguntando na hora, o mesmo comando funciona em qualquer shell e a senha não fica em lugar
 * nenhum: nem em histórico, nem em arquivo, nem na tela.
 *
 * As variáveis de ambiente continuam valendo quando estão definidas — é o que permite rodar sem
 * ninguém na frente do teclado, e mantém funcionando quem já usa esse caminho.
 *
 * IMPORTANTE: a senha pedida aqui é a do **login do sistema da clínica** (Firebase
 * Authentication, o mesmo e-mail e senha da tela de login do app). NÃO é a senha da conta Google
 * usada no console do Firebase — são credenciais diferentes, mesmo quando o e-mail é igual.
 * Ver `src/services/authService.ts`: o app só usa login de e-mail e senha, sem "entrar com Google".
 */

import { deleteApp, type FirebaseApp } from 'firebase/app';

export interface Credenciais {
  email: string;
  senha: string;
}

/** Teclas que o modo bruto entrega como caractere de controle, e que este módulo precisa tratar. */
// Escritas com fromCharCode de propósito: sequências de escape neste bloco já foram corrompidas
// por ferramentas de edição que as interpretaram, deixando bytes de controle crus no arquivo.
const ENTER = String.fromCharCode(13);
const NOVA_LINHA = String.fromCharCode(10);
const FIM_DE_ARQUIVO = String.fromCharCode(4); // Ctrl+D
const INTERROMPER = String.fromCharCode(3); // Ctrl+C
const APAGAR = String.fromCharCode(127); // Backspace na maioria dos terminais
const APAGAR_ALT = String.fromCharCode(8); // Backspace em alguns terminais do Windows

/**
 * Quanto tempo esperar pelo encerramento natural antes de forçar a saída.
 *
 * Ver `encerrar`: o caminho normal é o processo terminar sozinho. Este limite existe só para o
 * caso de o SDK deixar algum recurso aberto e o programa ficar parado para sempre — parar de
 * responder seria pior do que sair de forma abrupta.
 */
const LIMITE_PARA_SAIDA_FORCADA_MS = 5000;

/**
 * Encerra o processo depois de desligar o SDK do Firebase.
 *
 * Por que não `process.exit()` direto: chamar `exit` com o SDK ainda vivo derruba o Node no
 * Windows com `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. O processo sai com código
 * 127 — o de "quebrou" — em vez do código pedido, e a mensagem de erro recém-impressa aparece ao
 * lado de um despejo de asserção bem mais assustador do que o problema real.
 *
 * O que funciona: `deleteApp` fecha o que o Firestore e o Auth abriram, e então basta registrar o
 * código de saída e deixar o Node terminar sozinho quando não houver mais nada pendente. O
 * temporizador é a rede de segurança, e leva `unref()` justamente para não ser ele a segurar o
 * processo de pé — se tudo correr bem, o programa termina antes e o temporizador nunca dispara.
 */
export async function encerrar(app: FirebaseApp, codigo: number): Promise<void> {
  try {
    await deleteApp(app);
  } catch {
    // Já estamos de saída; falhar ao desligar o SDK não muda nada para quem chamou.
  }

  process.exitCode = codigo;

  const saidaForcada = setTimeout(() => process.exit(codigo), LIMITE_PARA_SAIDA_FORCADA_MS);
  saidaForcada.unref();
}

/** Pergunta visível: o que for digitado aparece na tela. */
function perguntar(rotulo: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(rotulo);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    const aoReceber = (dados: string) => {
      process.stdin.pause();
      process.stdin.removeListener('data', aoReceber);
      resolve(dados.replace(/[\r\n]+$/, '').trim());
    };
    process.stdin.on('data', aoReceber);
  });
}

/**
 * Pergunta oculta: lê tecla a tecla em modo bruto e não ecoa nada.
 *
 * O modo bruto entrega o que foi digitado sem o terminal tratar nada por conta própria — inclusive
 * sem mostrar na tela, que é o ponto. Em troca, cada tecla especial passa a ser responsabilidade
 * daqui: Enter encerra, Ctrl+C cancela, Backspace apaga. Um texto colado chega como um pedaço só,
 * por isso o laço percorre caractere por caractere em vez de tratar `pedaco` como uma tecla.
 */
function perguntarOculto(rotulo: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(rotulo);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let senha = '';

    const soltarTeclado = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', aoReceber);
      stdout.write('\n');
    };

    const aoReceber = (pedaco: string) => {
      for (const tecla of pedaco) {
        if (tecla === ENTER || tecla === NOVA_LINHA || tecla === FIM_DE_ARQUIVO) {
          soltarTeclado();
          resolve(senha);
          return;
        }
        if (tecla === INTERROMPER) {
          // 130 é o código que os shells usam para "interrompido pelo usuário". Aqui `exit` direto
          // é seguro: ninguém se conectou ao Firebase ainda quando a senha está sendo digitada.
          soltarTeclado();
          process.exit(130);
        }
        if (tecla === APAGAR || tecla === APAGAR_ALT) {
          senha = senha.slice(0, -1);
          continue;
        }
        // Ignora os demais caracteres de controle (setas, F1…), que chegariam como lixo na senha.
        if (tecla >= ' ') senha += tecla;
      }
    };

    stdin.on('data', aoReceber);
  });
}

/**
 * Devolve o login a usar: o das variáveis de ambiente, se estiverem definidas; senão pergunta.
 *
 * `motivo` aparece antes da pergunta e explica por que o script precisa de login — as regras do
 * Firestore exigem autenticação para a maioria das coleções.
 */
export async function obterCredenciais(motivo: string): Promise<Credenciais> {
  const doAmbiente = process.env.FIREBASE_EMAIL;
  const senhaDoAmbiente = process.env.FIREBASE_SENHA;
  if (doAmbiente && senhaDoAmbiente) {
    return { email: doAmbiente.trim(), senha: senhaDoAmbiente };
  }

  // Sem terminal interativo (rodando por outro programa, ou com a entrada redirecionada) não há
  // como perguntar. Aí as variáveis de ambiente são o único caminho, e o erro precisa dizer isso.
  if (!process.stdin.isTTY) {
    throw new Error(
      'Sem terminal interativo para perguntar a senha. Defina FIREBASE_EMAIL e FIREBASE_SENHA ' +
        'como variáveis de ambiente e rode de novo.'
    );
  }

  console.log(motivo);
  console.log(
    'Use o MESMO e-mail e senha da tela de login do sistema da clínica.\n' +
      '(Não é a senha da sua conta Google do console do Firebase — são coisas diferentes.)\n'
  );

  const email = await perguntar('E-mail: ');
  const senha = await perguntarOculto('Senha (não aparece na tela): ');

  if (!email || !senha) {
    throw new Error('E-mail ou senha em branco.');
  }

  console.log('');
  return { email, senha };
}

/**
 * Traduz o erro para uma frase que diz o que fazer a respeito.
 *
 * Os scripts são rodados por quem cuida da clínica, não por quem escreveu o código: um rastro de
 * pilha do Node não informa nada acionável, e o código de erro do Firebase ('auth/invalid-
 * credential') some no meio dele. Cada caso abaixo é um erro que dá para prever e resolver
 * sozinho; qualquer outro cai no ramo final, que aí sim mostra o erro cru, porque é o que permite
 * pedir ajuda com a informação certa.
 */
export function explicarErro(err: unknown): string {
  const codigo = (err as { code?: string })?.code;
  const mensagem = (err as { message?: string })?.message || String(err);

  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return (
        'E-mail ou senha não conferem.\n\n' +
        'Lembre que é o login do SISTEMA DA CLÍNICA (a mesma tela onde a equipe entra no app),\n' +
        'e não a senha da sua conta Google do console do Firebase.\n' +
        'Se não souber a senha, use "Esqueci minha senha" na tela de login do sistema.'
      );

    case 'auth/too-many-requests':
      return 'O Firebase bloqueou temporariamente por excesso de tentativas. Espere alguns minutos.';

    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Sem conexão com o Firebase. Confira a internet e tente de novo.';

    case 'auth/operation-not-allowed':
      return (
        'O login por e-mail e senha está desativado no projeto.\n' +
        'Console do Firebase > Authentication > Sign-in method > Email/Password > Ativar.'
      );

    case 'permission-denied':
      return (
        'As regras do Firestore recusaram a operação. Duas causas comuns:\n' +
        '  1. As regras ainda não foram publicadas neste banco — rode: firebase deploy --only firestore\n' +
        '  2. O login usado não é de uma profissional cadastrada com acesso.'
      );

    case 'resource-exhausted':
      return (
        'A cota diária do Firestore se esgotou. Ela é renovada pelo Google por volta das 04:00 BRT.\n' +
        'Leitura e gravação têm cotas separadas, então exportar pode funcionar mesmo com a gravação bloqueada.'
      );

    case 'not-found':
      return (
        'O banco indicado não existe neste projeto do Firebase.\n' +
        'Confira o nome em --banco (ou o firestoreDatabaseId do firebase-applet-config.json)\n' +
        'contra o que aparece no console do Firebase, em Firestore Database.'
      );

    default:
      return mensagem;
  }
}
