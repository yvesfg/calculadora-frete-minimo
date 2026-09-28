import React from 'react';
import ReactDOM from 'react-dom/client';
import './utils/anttUpdate.js'; // reaplica a base ANTT ativa (localStorage) antes do 1º render
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
