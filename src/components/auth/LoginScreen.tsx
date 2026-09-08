import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { login, sendResetPasswordEmail } from '../../services/authService';

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

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(friendlyError(err));
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

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#1A1A1A] flex items-center justify-center text-[#C49B74] font-serif-luxury text-2xl font-semibold mx-auto mb-4">
            LV
          </div>
          <h1 className="font-serif-luxury text-[26px] font-medium text-[#1A1A1A]">La Vie Clinique</h1>
          <p className="text-[13px] text-[#8a8578] mt-1">Painel administrativo — acesso restrito à equipe</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 space-y-4"
        >
          <div>
            <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">E-mail</label>
            <div className="relative">
              <Mail className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@lavieclinique.com"
                autoComplete="username"
                required
                className="w-full h-[50px] pl-11 pr-4 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">Senha</label>
            <div className="relative">
              <Lock className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full h-[50px] pl-11 pr-4 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
              />
            </div>
          </div>

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
            className="w-full h-[50px] rounded-xl bg-[#A67C52] text-white text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-[#8E653D] active:scale-97 transition-all disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            className="w-full text-center text-[13px] text-[#8a8578] hover:text-[#1A1A1A] font-medium transition-colors"
          >
            Esqueci minha senha
          </button>
        </form>
      </div>
    </div>
  );
};
