import { AnalyticsObserver } from './analytics/AnalyticsObserver';
import { HashRouter } from 'react-router-dom';
import './styles/app.css';
import { AppRoutes } from './router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/Toaster';

function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AnalyticsObserver />
        <AppRoutes />
      </HashRouter>
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
