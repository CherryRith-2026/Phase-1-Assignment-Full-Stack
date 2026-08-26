import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

// The main setting/configuration for the Angular application
export const appConfig: ApplicationConfig = { 
  providers: [
    provideBrowserGlobalErrorListeners(), //It help with the error handling in the angular application and browser
    provideRouter(routes), //It make navigation possible to different pages in the app using routes from app.routes.ts
    provideHttpClient() //Allows the angular to communicate and send request to the node/express server 
  ]
};
