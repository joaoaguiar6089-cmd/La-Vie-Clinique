import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// Escuta desde a abertura o aviso de "pode instalar" do navegador, que só vem uma vez (ver o módulo).
import './lib/instalacao';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
