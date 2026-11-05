import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import './styles/tokens.css';
import './styles/base.css';

import { IconContext } from '@phosphor-icons/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={{ size: 16, weight: 'regular' }}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
);
