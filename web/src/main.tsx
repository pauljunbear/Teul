import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const Feedback =
  import.meta.env.DEV && import.meta.env.MODE === 'feedback'
    ? lazy(() => import('agentation').then(module => ({ default: module.Agentation })))
    : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {Feedback && (
      <Suspense fallback={null}>
        <Feedback endpoint="http://127.0.0.1:4747" />
      </Suspense>
    )}
  </StrictMode>
);
