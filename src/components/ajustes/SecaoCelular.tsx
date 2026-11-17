import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  Copy,
  Download,
  EllipsisVertical,
  Maximize2,
  MonitorDown,
  RefreshCw,
  Share,
  SquarePlus,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import {
  type Aparelho,
  abertoComoApp,
  acompanharInstalacao,
  aparelhoAtual,
  instalarAgora,
  podeInstalarAgora,
} from '../../lib/instalacao';
import { MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { AvisoTinta, BotaoPilula, PilulasDeEscolha } from '../common/Tinta';

/**
 * Ajustes → Instalar no celular: o passo a passo para pôr o sistema na tela inicial, como um app.
 *
 * Não é um app de loja: é o próprio site, que o celular guarda com ícone e abre em tela cheia, sem a
 * barra do navegador (o manifesto e as metas `apple-*` estão no `vite.config.ts`). Por isso as
 * atualizações chegam sozinhas, e não há nada para baixar.
 *
 * O passo a passo abre já no aparelho em que a pessoa está. No Android e no Chrome do computador,
 * quando o navegador oferece a instalação, aparece também o botão "Instalar agora".
 */

const ABAS: { id: Aparelho; rotulo: string }[] = [
  { id: 'iphone', rotulo: 'iPhone' },
  { id: 'android', rotulo: 'Android' },
  { id: 'computador', rotulo: 'Computador' },
];

/** Um passo numerado, com o ícone do botão que a pessoa vai procurar na tela. */
const Passo: React.FC<{ numero: number; icone?: React.ElementType; children: React.ReactNode }> = ({ numero, icone: Icone, children }) => (
  <li className="flex gap-3.5">
    <span className="w-8 h-8 shrink-0 rounded-full bg-ink text-white text-[14px] font-bold flex items-center justify-center tabular-nums">
      {numero}
    </span>
    <div className="flex-1 min-w-0 pt-1 text-[15px] leading-relaxed text-ink">
      {children}
      {Icone && (
        <span className="ml-1.5 inline-flex align-middle items-center justify-center w-7 h-7 rounded-lg bg-line-soft text-ink">
          <Icone className="w-4 h-4" />
        </span>
      )}
    </div>
  </li>
);

export const SecaoCelular: React.FC<{ endereco: string }> = ({ endereco }) => {
  const [aba, setAba] = useState<Aparelho>(() => aparelhoAtual());
  const [, setVersao] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [instalando, setInstalando] = useState(false);

  // O pedido de instalação do navegador pode chegar depois desta tela abrir.
  useEffect(() => acompanharInstalacao(() => setVersao((v) => v + 1)), []);

  const jaInstalado = abertoComoApp();
  const ofereceInstalar = podeInstalarAgora() && aba !== 'iphone';
  const enderecoCurto = endereco.replace(/^https?:\/\//, '');

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de cópia: o endereço está escrito na tela para copiar à mão.
    }
  };

  const instalar = async () => {
    setInstalando(true);
    try {
      await instalarAgora();
    } finally {
      setInstalando(false);
    }
  };

  return (
    <div className="space-y-6">
      {jaInstalado ? (
        <AvisoTinta tom="info" icone={CheckCircle2}>
          Você já está usando o {MARCA_DA_PLATAFORMA} instalado neste aparelho. Para instalar em outro celular, siga o
          passo a passo abaixo nele.
        </AvisoTinta>
      ) : (
        <div className="rounded-2xl bg-ink text-white p-4 sm:p-5">
          <p className="text-[17px] font-semibold">O sistema na tela inicial, como um app</p>
          <ul className="mt-2.5 space-y-1.5 text-[14px] text-cream/90">
            <li className="flex items-start gap-2">
              <Smartphone className="w-4 h-4 mt-0.5 shrink-0 text-brand-pale" />
              Um ícone do {MARCA_DA_PLATAFORMA} junto dos outros apps, a um toque.
            </li>
            <li className="flex items-start gap-2">
              <Maximize2 className="w-4 h-4 mt-0.5 shrink-0 text-brand-pale" />
              Abre em tela cheia, sem a barra de endereço do navegador.
            </li>
            <li className="flex items-start gap-2">
              <RefreshCw className="w-4 h-4 mt-0.5 shrink-0 text-brand-pale" />
              Nada para baixar da loja: as novidades chegam sozinhas.
            </li>
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <PilulasDeEscolha opcoes={ABAS} valor={aba} onMudar={(v) => v && setAba(v)} rotulo="Aparelho" compacta />

        {ofereceInstalar && (
          <div className="rounded-2xl border-2 border-ink p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-ink flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Este navegador instala com um toque
              </p>
              <p className="text-[13px] text-ink-soft">Ou siga os passos abaixo, que dão no mesmo.</p>
            </div>
            <BotaoPilula tom="preto" icone={Download} onClick={() => void instalar()} disabled={instalando}>
              Instalar agora
            </BotaoPilula>
          </div>
        )}

        {aba === 'iphone' && (
          <ol className="space-y-4" aria-label="Passo a passo no iPhone">
            <Passo numero={1}>
              Abra <strong>{enderecoCurto}</strong> no <strong>Safari</strong>, o navegador do iPhone.
            </Passo>
            <Passo numero={2} icone={Share}>
              Toque no botão <strong>Compartilhar</strong> — o quadrado com uma seta para cima. Nos iPhones com o sistema
              mais novo, ele fica dentro do botão <strong>•••</strong>, ao lado do endereço.
            </Passo>
            <Passo numero={3} icone={SquarePlus}>
              Role as opções e toque em <strong>Adicionar à Tela de Início</strong>.
            </Passo>
            <Passo numero={4}>
              Confira o nome <strong>{MARCA_DA_PLATAFORMA}</strong> e toque em <strong>Adicionar</strong>. Se aparecer a
              opção <strong>Abrir como app web</strong>, deixe ligada.
            </Passo>
            <Passo numero={5}>
              Pronto: o ícone está na tela inicial. Abra por ele e entre com seu e-mail e senha — na primeira vez o app
              pede o login de novo, porque ele guarda a sessão separada do Safari.
            </Passo>
          </ol>
        )}

        {aba === 'android' && (
          <ol className="space-y-4" aria-label="Passo a passo no Android">
            <Passo numero={1}>
              Abra <strong>{enderecoCurto}</strong> no <strong>Chrome</strong>.
            </Passo>
            <Passo numero={2} icone={EllipsisVertical}>
              Toque nos <strong>três pontinhos</strong>, no canto de cima, à direita.
            </Passo>
            <Passo numero={3} icone={Smartphone}>
              Toque em <strong>Instalar app</strong> — em alguns celulares o nome é{' '}
              <strong>Adicionar à tela inicial</strong>.
            </Passo>
            <Passo numero={4}>
              Confirme em <strong>Instalar</strong>. O ícone do {MARCA_DA_PLATAFORMA} aparece na tela inicial e na lista de
              apps.
            </Passo>
            <Passo numero={5}>Abra pelo ícone e entre com seu e-mail e senha.</Passo>
            <li className="text-[13px] text-ink-soft leading-relaxed pl-[46px]">
              No navegador da Samsung: menu <strong>☰</strong> → <strong>Adicionar página a</strong> →{' '}
              <strong>Tela inicial</strong>.
            </li>
          </ol>
        )}

        {aba === 'computador' && (
          <ol className="space-y-4" aria-label="Passo a passo no computador">
            <Passo numero={1}>
              Abra <strong>{enderecoCurto}</strong> no <strong>Chrome</strong> ou no <strong>Edge</strong>.
            </Passo>
            <Passo numero={2} icone={MonitorDown}>
              Clique no ícone de <strong>instalar</strong>, na ponta direita da barra de endereço. Se ele não aparecer:
              menu <strong>⋮</strong> → <strong>Transmitir, salvar e compartilhar</strong> →{' '}
              <strong>Instalar página como app</strong>.
            </Passo>
            <Passo numero={3}>
              Confirme em <strong>Instalar</strong>. O painel passa a abrir numa janela própria, como um programa, com
              atalho na área de trabalho e na barra de tarefas.
            </Passo>
            <li className="text-[13px] text-ink-soft leading-relaxed pl-[46px]">
              No Mac, pelo Safari: menu <strong>Arquivo</strong> → <strong>Adicionar ao Dock</strong>.
            </li>
          </ol>
        )}
      </div>

      {/* Quem está no computador abre o site no celular pela câmera, sem digitar o endereço. */}
      <div className="rounded-2xl bg-line-soft p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="bg-white p-2.5 rounded-xl shrink-0">
          <QRCodeSVG value={endereco} size={120} level="M" />
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-[15px] font-semibold text-ink">Está no computador?</p>
          <p className="text-[13px] text-ink-soft leading-snug mt-0.5">
            Aponte a câmera do celular para o código: o site abre no celular, e é só seguir os passos acima.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <code className="px-2.5 py-1.5 rounded-lg bg-card text-[13px] text-ink break-all">{enderecoCurto}</code>
            <button
              type="button"
              onClick={() => void copiar()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-ink/15 text-[13px] font-semibold text-ink hover:border-ink/40"
            >
              {copiado ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
