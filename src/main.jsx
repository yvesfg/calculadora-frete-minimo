import React from 'react';
import ReactDOM from 'react-dom/client';
import { sincronizarBase } from './utils/anttUpdate.js'; // aplica o cache local da base ANTT
import { storeSupabase } from './utils/anttStore.js';
import App from './App.jsx';
import './index.css';

const render = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Base ANTT é geral (Supabase). Espera até 3 s; se falhar, segue com cache/embutida.
const sync = sincronizarBase(storeSupabase)
  .catch(e => console.warn('[ANTT] base geral indisponível, usando local:', e.message));
Promise.race([sync, new Promise(r => setTimeout(r, 3000))]).then(render);
