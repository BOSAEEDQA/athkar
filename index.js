import { registerRootComponent } from 'expo';
import App from './App';
import { registerOffline } from './src/pwa-client';
registerRootComponent(App);
registerOffline();
