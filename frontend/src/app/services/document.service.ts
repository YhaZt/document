import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Document } from '../models/document.model';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private baseUrl = 'http://localhost:3000/api';
  private http = inject(HttpClient);

  // Lookups
  getOffices(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/offices`);
  }

  getStatuses(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/statuses`);
  }

  // CRUD
  getAll(): Observable<Document[]> {
    return this.http.get<Document[]>(`${this.baseUrl}/documents`);
  }

  getById(id: number): Observable<Document> {
    return this.http.get<Document>(`${this.baseUrl}/documents/${id}`);
  }

  create(doc: Partial<Document>): Observable<Document> {
    return this.http.post<Document>(`${this.baseUrl}/documents`, doc);
  }

  update(id: number, doc: Partial<Document>): Observable<Document> {
    return this.http.put<Document>(`${this.baseUrl}/documents/${id}`, doc);
  }

  delete(id: number): Observable<Document> {
    return this.http.delete<Document>(`${this.baseUrl}/documents/${id}`);
  }

  // Workflow
  forward(id: number, remarks: string): Observable<Document> {
    return this.http.post<Document>(`${this.baseUrl}/documents/${id}/forward`, { remarks });
  }

  voidDocument(id: number): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/documents/${id}/void`, {});
  }

  track(code: string): Observable<Document> {
    return this.http.get<Document>(`${this.baseUrl}/documents/track/${code}`);
  }

  /** Office scans QR to receive the document */
  scanReceive(code: string, officeName: string, remarks?: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/documents/scan/${code}`, { officeName, remarks });
  }
}
