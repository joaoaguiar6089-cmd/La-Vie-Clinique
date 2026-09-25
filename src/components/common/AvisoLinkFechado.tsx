import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { motivoEnderecoFechado } from '../../utils/publicLinks';

interface AvisoLinkFechadoProps {
  /** O link que vai sair para a paciente. */
  link: string;
}

/**
 * Aviso de que o link que está para sair vai pedir login para a paciente.
 *
 * Aparece só quando nenhum endereço aberto é conhecido — ver `resolvePublicBase`. É o caso de
 * quem só trabalha pelo AI Studio e nunca abriu o site publicado: a janela é o endereço de
 * desenvolvimento, e o perfil não tem outro. Sem este aviso, a equipe só descobria quando a
 * cliente reclamava da tela de senha.
 */
export const AvisoLinkFechado: React.FC<AvisoLinkFechadoProps> = ({ link }) => {
  const motivo = motivoEnderecoFechado(link);
  if (!motivo) return null;

  let host = link;
  try {
    host = new URL(link).host;
  } catch {
    // Mostra o link inteiro.
  }

  return (
    <div className="text-body leading-relaxed text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2 flex items-start gap-2">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>
        <strong>Este link vai pedir senha para a cliente.</strong> O endereço{' '}
        <span className="break-all">{host}</span> {motivo}. Abra o painel uma vez pelo endereço
        publicado do site (o que o AI Studio mostra ao publicar) — o sistema passa a usá-lo sozinho
        —, ou preencha <strong>Endereço público do sistema</strong> nas Configurações.
      </span>
    </div>
  );
};
