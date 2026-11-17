import React, { useEffect } from 'react';
import { Check, Info } from 'lucide-react';
import type { ClinicProfile, FontesDosDocumentos } from '../../types';
import {
  COR_PADRAO_DOS_DOCUMENTOS,
  CORES_SUGERIDAS,
  LISTA_DE_FONTES,
  carregarFontesDosDocumentos,
  corFoiAjustada,
  corNoPapel,
  corValida,
} from '../../utils/marcaDosDocumentos';
import { ProvedorDaMarcaDosDocumentos, useEstiloDaMarca } from '../documentos/MarcaDosDocumentos';
import { MarcaDoCabecalho } from '../quotes/QuotePrintable';
import {
  BEGE_DA_LINHA,
  BEGE_DO_TOTAL,
  BRONZE,
  BRONZE_SOBRE_PRETO,
  CINZA,
  FILETE_SOBRE_PRETO,
  HAIRLINE,
  OFFWHITE,
  PRETO,
} from '../documentos/estiloA4';
import { resolveClinicLogoUrl } from '../ClinicLogo';
import { AvisoTinta, Interruptor, RotuloTinta } from '../common/Tinta';
import { formatBRL } from '../../utils/formatters';

/**
 * Ajustes → Documentos: a cara dos PDFs da clínica (orçamento, recibo, simulação de custo, fichas e
 * catálogo). Três escolhas — a cor de destaque, o par de fontes e o logo no cabeçalho — e, ao lado,
 * uma folha de exemplo que muda na hora. Nada é gravado até o "Salvar" da página.
 *
 * A cor e as fontes são aplicadas pelas variáveis de `utils/marcaDosDocumentos.ts`; esta tela só
 * edita os três campos do perfil.
 */

type Campo = 'corDosDocumentos' | 'fontesDosDocumentos' | 'logoNosDocumentos';

export const SecaoDocumentos: React.FC<{
  perfil: ClinicProfile;
  onMudar: (campo: Campo, valor: string | boolean) => void;
  /** Leva à seção Identidade, onde se envia o logo. */
  onIrParaIdentidade: () => void;
}> = ({ perfil, onMudar, onIrParaIdentidade }) => {
  const cor = corValida(perfil.corDosDocumentos) || COR_PADRAO_DOS_DOCUMENTOS;
  const fontes: FontesDosDocumentos = perfil.fontesDosDocumentos || 'classica';
  const temLogo = !!resolveClinicLogoUrl(perfil.logoUrl);
  const logoLigado = perfil.logoNosDocumentos !== false;
  const sugerida = CORES_SUGERIDAS.some((s) => s.cor === cor);

  // As quatro fontes para os cartões de escolha mostrarem cada uma de verdade.
  useEffect(() => {
    LISTA_DE_FONTES.forEach((f) => void carregarFontesDosDocumentos(f.id));
  }, []);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="space-y-8 min-w-0">
        {/* COR */}
        <section aria-labelledby="doc-cor" className="space-y-3">
          <div>
            <RotuloTinta>
              <span id="doc-cor">Cor de destaque</span>
            </RotuloTinta>
            <p className="text-[13px] text-ink-soft -mt-1">
              Vai nos títulos pequenos, nos números e nos detalhes. O texto continua preto.
            </p>
          </div>
          <div role="radiogroup" aria-labelledby="doc-cor" className="flex flex-wrap gap-2.5">
            {CORES_SUGERIDAS.map((s) => {
              const ativa = s.cor === cor;
              return (
                <button
                  key={s.cor}
                  type="button"
                  role="radio"
                  aria-checked={ativa}
                  aria-label={s.nome}
                  title={s.nome}
                  onClick={() => onMudar('corDosDocumentos', s.cor === COR_PADRAO_DOS_DOCUMENTOS ? '' : s.cor)}
                  className={`group flex flex-col items-center gap-1 w-[64px] rounded-xl py-1.5 transition-colors ${
                    ativa ? 'bg-line-soft' : 'hover:bg-line-soft/60'
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center ring-offset-2 ring-offset-surface ${
                      ativa ? 'ring-2 ring-ink' : ''
                    }`}
                    style={{ backgroundColor: s.cor }}
                  >
                    {ativa && <Check className="w-5 h-5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-[11.5px] font-medium text-ink-soft leading-tight">{s.nome}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2.5 h-11 pl-1.5 pr-3 rounded-full bg-line-soft cursor-pointer">
              <span
                className={`relative w-8 h-8 rounded-full overflow-hidden ${!sugerida ? 'ring-2 ring-ink ring-offset-2 ring-offset-line-soft' : ''}`}
                style={{ backgroundColor: cor }}
              >
                <input
                  type="color"
                  value={cor.toLowerCase()}
                  onChange={(e) => onMudar('corDosDocumentos', e.target.value.toUpperCase())}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Escolher outra cor"
                />
              </span>
              <span className="text-[14px] font-semibold text-ink">Outra cor</span>
            </label>
            <label className="inline-flex items-center gap-2 h-11 px-3 rounded-full bg-line-soft">
              <span className="text-[13px] text-ink-soft">Código</span>
              <input
                type="text"
                defaultValue={cor}
                key={cor}
                maxLength={7}
                spellCheck={false}
                aria-label="Código da cor (#RRGGBB)"
                onBlur={(e) => {
                  const valida = corValida(e.target.value);
                  if (valida) onMudar('corDosDocumentos', valida === COR_PADRAO_DOS_DOCUMENTOS ? '' : valida);
                  else e.target.value = cor;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-[84px] bg-transparent text-[14px] font-semibold text-ink uppercase tabular-nums focus:outline-none"
              />
            </label>
          </div>

          {corFoiAjustada(cor) && (
            <AvisoTinta tom="info" icone={Info}>
              Esta cor é clara demais para texto sobre o papel branco. Nos documentos ela sai um pouco mais
              escura (<span className="inline-block w-3 h-3 rounded-full align-[-1px]" style={{ backgroundColor: corNoPapel(cor) }} />{' '}
              {corNoPapel(cor)}), para os títulos continuarem legíveis.
            </AvisoTinta>
          )}
        </section>

        {/* FONTES */}
        <section aria-labelledby="doc-fontes" className="space-y-3">
          <div>
            <RotuloTinta>
              <span id="doc-fontes">Fontes</span>
            </RotuloTinta>
            <p className="text-[13px] text-ink-soft -mt-1">Uma para os títulos e os valores, outra para o texto.</p>
          </div>
          <div role="radiogroup" aria-labelledby="doc-fontes" className="grid grid-cols-2 gap-2.5">
            {LISTA_DE_FONTES.map((f) => {
              const ativa = f.id === fontes;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={ativa}
                  onClick={() => onMudar('fontesDosDocumentos', f.id)}
                  className={`text-left rounded-2xl p-3.5 border-2 transition-colors ${
                    ativa ? 'border-ink bg-card' : 'border-transparent bg-line-soft hover:bg-[#E9E6DF]'
                  }`}
                >
                  <span className="block text-[26px] leading-none text-ink" style={{ fontFamily: f.titulo }}>
                    Aa <span className="text-[20px]">R$ 480</span>
                  </span>
                  <span className="block mt-2 text-[12.5px] text-ink-soft leading-snug" style={{ fontFamily: f.texto }}>
                    Limpeza de pele profunda
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ink">{f.rotulo}</span>
                    {ativa && <Check className="w-4 h-4 text-ink" strokeWidth={3} />}
                  </span>
                  <span className="block text-[12px] text-muted">{f.descricao}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* LOGO */}
        <section className="space-y-2">
          <Interruptor
            ligado={temLogo && logoLigado}
            disabled={!temLogo}
            onMudar={(v) => onMudar('logoNosDocumentos', v)}
            rotulo="Logo no cabeçalho"
            descricao={
              temLogo
                ? 'No lugar das iniciais da clínica, no topo do orçamento, do recibo e das fichas.'
                : 'Envie o logo da clínica para ele aparecer nos documentos.'
            }
          />
          {!temLogo && (
            <button type="button" onClick={onIrParaIdentidade} className="text-[14px] font-semibold text-ink underline underline-offset-4">
              Enviar o logo em Identidade
            </button>
          )}
        </section>
      </div>

      {/* PRÉVIA */}
      <div className="xl:sticky xl:top-24 space-y-2">
        <p className="text-[13px] font-semibold text-ink">Como fica no papel</p>
        <ProvedorDaMarcaDosDocumentos perfil={perfil}>
          <FolhaDeExemplo nome={perfil.name} detalhe={[perfil.tagline, perfil.cityState].filter(Boolean).join(' · ')} />
        </ProvedorDaMarcaDosDocumentos>
        <p className="text-[12px] text-muted leading-snug">
          Vale para os documentos gerados daqui em diante e para os que forem abertos de novo — inclusive os
          que a cliente baixa pelo link. Para ver um de verdade, abra a prévia de um orçamento.
        </p>
      </div>
    </div>
  );
};

/**
 * Um pedaço de orçamento desenhado com as mesmas peças das folhas A4 (`estiloA4`), na escala de uma
 * miniatura. Não é o orçamento de verdade — é o bastante para ver cor, fontes e logo juntos.
 */
const FolhaDeExemplo: React.FC<{ nome: string; detalhe: string }> = ({ nome, detalhe }) => {
  const estilo = useEstiloDaMarca();
  const rotulo: React.CSSProperties = { fontSize: 8, textTransform: 'uppercase', letterSpacing: '.16em', color: BRONZE };
  return (
    <div
      aria-label="Exemplo de orçamento com a cor e as fontes escolhidas"
      role="img"
      className="rounded-xl overflow-hidden shadow-[0_6px_24px_rgba(0,0,0,.08)] border border-line"
      style={{ ...estilo, background: OFFWHITE, color: PRETO, fontFamily: 'var(--font-sans)', padding: 18 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ transform: 'scale(.8)', transformOrigin: 'left center' }}>
            <MarcaDoCabecalho nome={nome} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, lineHeight: 1.1 }}>{nome || 'Sua clínica'}</div>
            {detalhe && (
              <div style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: '.12em', color: CINZA, marginTop: 2 }}>{detalhe}</div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={rotulo}>Orçamento</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 14 }}>Nº 2026-0042</div>
        </div>
      </div>
      <div style={{ height: 1, background: HAIRLINE, margin: '10px 0' }} />
      <div style={rotulo}>Preparado para</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginTop: 2 }}>Mariana Alves</div>

      <div style={{ marginTop: 12, fontSize: 10.5 }}>
        {[
          ['Limpeza de pele profunda', 280],
          ['Peeling de diamante · 3 sessões', 450],
        ].map(([titulo, valor], i) => (
          <div
            key={String(titulo)}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: i % 2 ? BEGE_DA_LINHA : 'transparent' }}
          >
            <span>{titulo}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBRL(Number(valor))}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: BEGE_DO_TOTAL, fontWeight: 700 }}>
          <span>Soma</span>
          <span>{formatBRL(730)}</span>
        </div>
      </div>

      <div style={{ marginTop: 12, marginLeft: 'auto', width: '62%', background: PRETO, color: OFFWHITE, padding: '10px 12px' }}>
        <div style={{ height: 1, background: FILETE_SOBRE_PRETO, marginBottom: 6 }} />
        <div style={{ ...rotulo, color: BRONZE_SOBRE_PRETO }}>Total</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, textAlign: 'right' }}>{formatBRL(730)}</div>
      </div>
    </div>
  );
};

