
import React from 'react';
import ReactDOMClient from 'react-dom/client';
import App from './App';

import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOMClient.createRoot(document.getElementById('root'));
root.render(<App />);

serviceWorkerRegistration.register();

