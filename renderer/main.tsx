import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import IconApp from './components/IconApp';
import PairingApp from './components/PairingApp';
import './index.css';

// Determine which view to render based on URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const view = urlParams.get('view') || 'panel';

let RootComponent: React.ComponentType;
if (view === 'icon') {
  RootComponent = IconApp;
} else if (view === 'pairing') {
  RootComponent = PairingApp;
} else {
  RootComponent = App; // panel view (default)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);

