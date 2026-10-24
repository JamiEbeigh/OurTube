import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import favicon from './assets/favicon.png';

const link = document.createElement('link');
link.rel = 'icon';
link.href = favicon;
document.head.appendChild(link);

// Hide images that fail to load (e.g. a removed video's thumbnail) instead of
// showing the browser's broken-image icon.
document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement) e.target.style.visibility = 'hidden';
}, true);

createRoot(document.getElementById('root')).render(<App />);
