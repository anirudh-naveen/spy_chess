import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { QueueProvider } from './queue';
import { SessionProvider } from './session';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <SessionProvider>
        <QueueProvider>
          <App />
        </QueueProvider>
      </SessionProvider>
    </HashRouter>
  </StrictMode>,
);
