import React, { useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { avisarMudanca, EscolhaNaJanela, OpcaoDaLista } from './JanelaDeEscolha';
import { chaveDeNome } from '../../utils/templateMatching';

/**
 * O campo que se preenche escolhendo de uma lista **ou** digitando o que não está nela: o
 * procedimento do atendimento ("Retorno" não é procedimento do catálogo), a paciente sem cadastro,
 * o tipo de produto novo.
 *
 * Tem a cara do `CampoTinta` — o rótulo dentro, o nome em negrito. Tocar nele abre a janela de
 * escolha no meio da tela, com a busca no topo: digitar filtra a lista, e o digitado pode ser usado
 * como está pela linha de baixo da janela (ou pelo Enter, quando nada da lista combina). Antes,
 * o campo era a própria busca e a lista abria colada embaixo dele, cortada pelo painel.
 */

interface CampoComListaProps {
  id?: string;
  rotulo: string;
  /** O que o campo mostra: o nome escolhido ou digitado. */
  texto: string;
  /** O que o campo mostra vazio. */
  placeholder: string;
  opcoes: OpcaoDaLista[] | ((busca: string) => OpcaoDaLista[]);
  /** O valor da opção de onde veio o texto. Ausente = o texto foi digitado (ou não há nada). */
  valor?: string;
  onEscolher: (o: OpcaoDaLista) => void;
  /** Usar o digitado como está. */
  textoLivre: { rotulo: (texto: string) => string; detalhe?: string; onUsar: (texto: string) => void };
  /** O X que esvazia o campo — aparece com algo preenchido. */
  onLimpar?: () => void;
  rotuloDoLimpar?: string;
  /** O X que tira o campo da tela (um procedimento a mais) — aparece sempre, no lugar do limpar. */
  onRemover?: () => void;
  rotuloDoRemover?: string;
  erro?: string;
  /** Abre a janela assim que o campo aparece — o campo novo do "+ outro procedimento". */
  abertaAoMontar?: boolean;
  tituloDaJanela?: string;
  placeholderDaBusca?: string;
  vazio?: string;
  limite?: number;
  className?: string;
  /** A linha de baixo do campo: o vínculo com o cadastro, a ajuda. Some quando há `erro`. */
  children?: React.ReactNode;
}

export const CampoComLista: React.FC<CampoComListaProps> = ({
  id,
  rotulo,
  texto,
  placeholder,
  opcoes,
  valor,
  onEscolher,
  textoLivre,
  onLimpar,
  rotuloDoLimpar,
  onRemover,
  rotuloDoRemover,
  erro,
  abertaAoMontar,
  tituloDaJanela,
  placeholderDaBusca,
  vazio,
  limite,
  className = '',
  children,
}) => {
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const [aberta, setAberta] = useState(!!abertaAoMontar);
  const preenchido = !!texto.trim();

  return (
    <div className={className}>
      <div
        className={`flex items-center gap-2 rounded-[14px] pl-4 pr-2 min-h-[56px] transition-colors ${
          erro
            ? 'bg-danger-bg ring-2 ring-danger'
            : aberta
            ? 'bg-card ring-2 ring-ink'
            : 'bg-line-soft hover:bg-[#E9E6DF] has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ink'
        }`}
      >
        <button
          ref={gatilhoRef}
          id={id}
          type="button"
          onClick={() => setAberta(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setAberta(true);
            }
          }}
          aria-haspopup="dialog"
          aria-expanded={aberta}
          aria-invalid={!!erro || undefined}
          className="min-w-0 flex-1 self-stretch pt-2 pb-2.5 text-left focus:outline-none"
        >
          <span className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">{rotulo}</span>
          <span className={`block truncate text-[16px] ${preenchido ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
            {preenchido ? texto : placeholder}
          </span>
        </button>
        {onRemover ? (
          <button
            type="button"
            onClick={onRemover}
            aria-label={rotuloDoRemover || `Remover ${rotulo}`}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-danger hover:bg-danger-bg"
          >
            <X className="w-4 h-4" />
          </button>
        ) : onLimpar && preenchido ? (
          <button
            type="button"
            onClick={() => {
              onLimpar();
              avisarMudanca(gatilhoRef.current);
              gatilhoRef.current?.focus();
            }}
            aria-label={rotuloDoLimpar || `Limpar ${rotulo}`}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <Search className="w-[18px] h-[18px] mr-2 shrink-0 text-ink-soft" aria-hidden />
        )}
      </div>

      {erro ? <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p> : children}

      {aberta && (
        <EscolhaNaJanela
          idBase={id ? `${id}-janela` : undefined}
          titulo={tituloDaJanela || rotulo}
          opcoes={opcoes}
          valor={valor ?? ''}
          // Texto digitado da última vez volta para a busca, pronto para corrigir; o escolhido da
          // lista abre a lista inteira, com ele marcado.
          buscaInicial={valor ? '' : texto.trim()}
          onEscolher={(o) => {
            onEscolher(o);
            avisarMudanca(gatilhoRef.current);
          }}
          textoLivre={{
            ...textoLivre,
            onUsar: (t) => {
              textoLivre.onUsar(t);
              avisarMudanca(gatilhoRef.current);
            },
          }}
          onFechar={() => setAberta(false)}
          placeholderDaBusca={placeholderDaBusca}
          vazio={vazio}
          limite={limite}
          origem={gatilhoRef}
        />
      )}
    </div>
  );
};

/**
 * Texto livre com sugestões — o tipo de produto, a unidade de uso. É o lugar do antigo `<datalist>`,
 * cuja lista o navegador abria colada ao campo: as sugestões vêm na janela de escolha, e o que não
 * está nelas entra como está.
 */
export const CampoComSugestoes: React.FC<{
  id?: string;
  rotulo: string;
  valor: string;
  onMudar: (valor: string) => void;
  sugestoes: string[];
  placeholder: string;
  /** A linha de usar o digitado: "Usar “Bioestimulador” como tipo novo". */
  rotuloDoNovo: (texto: string) => string;
  placeholderDaBusca?: string;
  vazio?: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ id, rotulo, valor, onMudar, sugestoes, placeholder, rotuloDoNovo, placeholderDaBusca, vazio, className, children }) => {
  const chave = chaveDeNome(valor.trim());
  const sugestao = chave ? sugestoes.find((s) => chaveDeNome(s) === chave) : undefined;
  return (
    <CampoComLista
      id={id}
      className={className}
      rotulo={rotulo}
      texto={valor}
      placeholder={placeholder}
      opcoes={sugestoes.map((s) => ({ valor: s, rotulo: s }))}
      valor={sugestao}
      onEscolher={(o) => onMudar(o.valor)}
      textoLivre={{ rotulo: rotuloDoNovo, onUsar: onMudar }}
      onLimpar={() => onMudar('')}
      rotuloDoLimpar={`Limpar ${rotulo.toLowerCase()}`}
      placeholderDaBusca={placeholderDaBusca}
      vazio={vazio}
    >
      {children}
    </CampoComLista>
  );
};
