import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '../shared/i18n';
import '../shared/styles/tailwind.css';
import App from './App';

async function bootstrap(): Promise<void> {
  await initI18n();

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    return;
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
