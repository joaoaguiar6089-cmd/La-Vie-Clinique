import React, { useState } from 'react';
import { FormularioDeCadastro } from './CadastroDaClinica';
import { Lock, Mail, AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import type { MultiFactorResolver } from 'firebase/auth';
import {
  entrarComCodigo,
  login,
  mensagemDoSegundoFator,
  PedeSegundoFator,
  sendResetPasswordEmail,
} from '../../services/authService';
import { ehZulia } from '../../lib/projetoFirebase';
import { DESCRICAO_DA_PLATAFORMA, MARCA_DA_LA_VIE, MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { CADASTRO_ABERTO } from '../../utils/cadastro';
import { PAGINAS_LEGAIS } from '../../utils/documentosLegais';

/** O cadastro de clínica nova existe só na plataforma, e só com ele aberto. */
const TEM_CADASTRO = ehZulia && CADASTRO_ABERTO;

/** `?cadastro` no endereço abre direto o formulário de criar conta (para mandar por link). */
const pediuCadastro = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('cadastro');
  } catch {
    return false;
  }
};

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe cadastro com este e-mail.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
};

function friendlyError(err: any): string {
  const code = err?.code as string | undefined;
  return (code && FIREBASE_ERROR_MESSAGES[code]) || 'Não foi possível entrar. Verifique seus dados e tente novamente.';
}

/**
 * As figuras de traço que flutuam sobre o relevo (`public/login/figura-N.webp`: só linhas, fundo
 * transparente). Cada uma tem lugar, tamanho e ritmo próprios; no celular ficam só duas, nos
 * cantos, para não disputar espaço com os campos.
 */
const FIGURAS: { arquivo: number; classes: string; duracao: number; atraso: number }[] = [
  { arquivo: 1, classes: 'left-[-3%] bottom-[-4%] h-[58vh] hidden md:block', duracao: 19, atraso: 0 },
  { arquivo: 5, classes: 'right-[1%] top-[6%] h-[40vh] hidden md:block', duracao: 23, atraso: -6 },
  { arquivo: 4, classes: 'right-[5%] bottom-[-6%] h-[52vh] hidden lg:block', duracao: 21, atraso: -11 },
  { arquivo: 3, classes: 'left-[19%] top-[15%] h-[36vh] hidden xl:block', duracao: 25, atraso: -3 },
  { arquivo: 2, classes: 'right-[23%] top-[3%] h-[30vh] hidden xl:block', duracao: 27, atraso: -15 },
  { arquivo: 5, classes: 'right-[-16%] top-[38%] h-[26vh] md:hidden', duracao: 23, atraso: -6 },
  { arquivo: 1, classes: 'left-[-24%] top-[9%] h-[30vh] md:hidden', duracao: 19, atraso: 0 },
];

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [cadastrando, setCadastrando] = useState(() => TEM_CADASTRO && pediuCadastro());
  // Segundo passo do login com verificação em duas etapas (o dono da plataforma).
  const [segundoFator, setSegundoFator] = useState<MultiFactorResolver | null>(null);
  const [codigo, setCodigo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (segundoFator) await entrarComCodigo(segundoFator, codigo);
      else await login(email, password);
    } catch (err) {
      if (err instanceof PedeSegundoFator) {
        setSegundoFator(err.resolver);
        setCodigo('');
      } else if (segundoFator) {
        setError(mensagemDoSegundoFator(err));
        if (/tempo para digitar/.test(mensagemDoSegundoFator(err))) setSegundoFator(null);
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Informe seu e-mail no campo acima para receber o link de redefinição.');
      return;
    }
    setError(null);
    try {
      await sendResetPasswordEmail(email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 6000);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const marca = ehZulia ? MARCA_DA_PLATAFORMA : MARCA_DA_LA_VIE;

  return (
    <div className="relative min-h-dvh bg-cream">
      {/* O relevo de fundo fica preso à tela (o formulário de cadastro é longo e rola por cima).
          `bg-center` é o que serve ao celular e ao tablet em pé: o recorte do meio da imagem
          guarda a lua em cima e o vão entre as árvores, onde entram os campos. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/login-fundo.webp)' }}
      />

      <div aria-hidden="true" className="fixed inset-0 overflow-hidden pointer-events-none">
        {FIGURAS.map((f, i) => (
          <img
            key={i}
            src={`/login/figura-${f.arquivo}.webp`}
            alt=""
            className={`figura-flutuante absolute w-auto max-w-none ${f.classes}`}
            style={{ animationDuration: `${f.duracao}s`, animationDelay: `${f.atraso}s` }}
          />
        ))}
      </div>

      <div className="relative min-h-dvh flex flex-col">
        {/* Na Zulia a tela de login é da plataforma (várias clínicas entram por ela); no legado,
            a da La Vie, como sempre. */}
        <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-7 lg:px-11 lg:pt-9">
          <h1 className="font-marca marca-em-relevo text-[28px] sm:text-[36px] lg:text-[46px] leading-none text-brand-deep">
            {marca}
          </h1>
          {ehZulia && (
            <p className="font-serif-luxury marca-em-relevo italic font-medium text-[16px] sm:text-[19px] lg:text-[22px] text-ink mt-1.5 lg:mt-2">
              {DESCRICAO_DA_PLATAFORMA}
            </p>
          )}
        </header>

        {/* No celular os campos descem para a metade de baixo, deixando a lua à mostra; do tablet
            em diante ficam no meio, um pouco abaixo do centro (o vão entre as árvores). */}
        <main className="flex-1 flex items-end sm:items-center justify-center px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-8 lg:pt-[20vh]">
          <div className="w-full max-w-[21rem]">
        {cadastrando ? (
          <FormularioDeCadastro onVoltar={() => setCadastrando(false)} />
        ) : (
        <form
          onSubmit={handleSubmit}
          className="clareira-no-relevo relative isolate px-2 py-4 space-y-4"
        >
          <p className="font-marca marca-em-relevo text-center text-[13px] text-brand-deep">
            {segundoFator ? 'Verificação em duas etapas' : ehZulia ? 'Acesso da clínica' : 'Acesso da equipe'}
          </p>
          {segundoFator ? (
            <div className="space-y-2">
              <p className="marca-em-relevo text-center text-[13px] text-ink leading-snug">
                Digite o código de 6 dígitos que aparece agora no seu aplicativo autenticador.
              </p>
              <div className="relative">
                <ShieldCheck className="w-[18px] h-[18px] absolute z-10 left-5 top-1/2 -translate-y-1/2 text-brand-deep pointer-events-none" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Código"
                  aria-label="Código do aplicativo autenticador"
                  autoFocus
                  required
                  className="campo-entalhado w-full h-[54px] pl-[3.1rem] pr-5 text-[18px] tracking-[0.3em] rounded-full text-ink placeholder:text-ink-soft placeholder:tracking-normal focus:outline-hidden"
                />
              </div>
            </div>
          ) : (
          <>
          <div>
                        <div className="relative">
              <Mail className="w-[18px] h-[18px] absolute z-10 left-5 top-1/2 -translate-y-1/2 text-brand-deep pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                aria-label="E-mail"
                autoComplete="username"
                required
                className="campo-entalhado w-full h-[54px] pl-[3.1rem] pr-5 text-[15px] rounded-full text-ink placeholder:text-ink-soft focus:outline-hidden"
              />
            </div>
          </div>

          <div>
                        <div className="relative">
              <Lock className="w-[18px] h-[18px] absolute z-10 left-5 top-1/2 -translate-y-1/2 text-brand-deep pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                aria-label="Senha"
                autoComplete="current-password"
                required
                className="campo-entalhado w-full h-[54px] pl-[3.1rem] pr-5 text-[15px] rounded-full text-ink placeholder:text-ink-soft focus:outline-hidden"
              />
            </div>
          </div>
          </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {resetSent && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Enviamos um link de redefinição de senha para {email}.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="botao-em-relevo font-marca w-full h-[54px] rounded-full text-[14px] text-brand-deep flex items-center justify-center gap-2 active:scale-97 transition-all disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSubmitting ? 'Entrando...' : segundoFator ? 'Confirmar código' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={
              segundoFator
                ? () => {
                    setSegundoFator(null);
                    setError(null);
                  }
                : handleForgotPassword
            }
            className="marca-em-relevo w-full text-center text-[13px] text-ink hover:text-brand-deep font-medium transition-colors"
          >
            {segundoFator ? 'Voltar' : 'Esqueci minha senha'}
          </button>
        </form>
        )}

            {/* O rodapé fica solto sobre o relevo, com o mesmo halo creme do nome (sem caixa). */}
            {ehZulia && (
              <div className="marca-em-relevo relative mt-1 px-2 space-y-1.5 font-medium">
                {TEM_CADASTRO && !cadastrando && (
                  <p className="text-center text-[13px] text-ink">
                    Sua clínica ainda não usa a {MARCA_DA_PLATAFORMA}?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setCadastrando(true);
                      }}
                      className="font-semibold text-brand-deep underline underline-offset-2 hover:text-ink"
                    >
                      Criar conta da clínica
                    </button>
                  </p>
                )}
                <p className="text-center text-[12px] text-ink space-x-3">
                  <a href={PAGINAS_LEGAIS.termos} target="_blank" rel="noopener" className="hover:text-ink underline-offset-2 hover:underline">
                    Termos de Uso
                  </a>
                  <span aria-hidden="true">·</span>
                  <a href={PAGINAS_LEGAIS.politicaDePrivacidade} target="_blank" rel="noopener" className="hover:text-ink underline-offset-2 hover:underline">
                    Política de Privacidade
                  </a>
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
