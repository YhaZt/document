import { Routes } from '@angular/router';
import { DocumentList } from './components/document-list/document-list';
import { ScanReceive } from './components/scan-receive/scan-receive';

export const routes: Routes = [
  { path: '', component: DocumentList },
  { path: 'scan', component: ScanReceive },
  { path: 'scan/:code', component: ScanReceive },
  { path: '**', redirectTo: '' }
];
