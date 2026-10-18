import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setupIonicReact } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import './styles.css';

setupIonicReact({ mode: 'ios', animated: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
