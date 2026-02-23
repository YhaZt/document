import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DocumentService } from '../../services/document.service';
import { Document } from '../../models/document.model';

@Component({
  selector: 'app-document-list',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './document-list.html',
  styleUrl: './document-list.css'
})
export class DocumentList implements OnInit {
  private svc = inject(DocumentService);

  documents = signal<Document[]>([]);
  offices = signal<string[]>([]);
  statuses = signal<string[]>([]);

  // Create form
  showForm = signal(false);
  formTitle = signal('');
  formDate = signal(new Date().toISOString().slice(0, 10));
  formOriginOffice = signal('');
  formSelectedOffices = signal<string[]>([]);
  formTargetDate = signal('');
  formDescription = signal('');
  formDocumentType = signal('General');
  formPriorityLevel = signal('Normal');

  // View detail / QR
  viewingDoc = signal<Document | null>(null);

  // Track
  trackCode = signal('');
  trackedDoc = signal<Document | null>(null);
  trackError = signal('');

  // Forward
  forwardRemarks = signal('');

  documentTypes = ['General', 'Memorandum', 'Resolution', 'Letter', 'Report', 'Request', 'Endorsement', 'Communication', 'Minutes', 'Other'];
  priorityLevels = ['Normal', 'Urgent', 'Highly Urgent'];

  ngOnInit() {
    this.svc.getOffices().subscribe(o => this.offices.set(o));
    this.svc.getStatuses().subscribe(s => this.statuses.set(s));
    this.loadDocuments();
  }

  loadDocuments() {
    this.svc.getAll().subscribe({
      next: docs => this.documents.set(docs),
      error: err => console.error('Failed to load', err),
    });
  }

  toggleOffice(office: string) {
    const current = this.formSelectedOffices();
    if (current.includes(office)) {
      this.formSelectedOffices.set(current.filter(o => o !== office));
    } else {
      this.formSelectedOffices.set([...current, office]);
    }
  }

  moveOffice(index: number, dir: number) {
    const arr = [...this.formSelectedOffices()];
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
    this.formSelectedOffices.set(arr);
  }

  removeOffice(index: number) {
    const arr = [...this.formSelectedOffices()];
    arr.splice(index, 1);
    this.formSelectedOffices.set(arr);
  }

  saveDocument() {
    if (!this.formTitle().trim()) return alert('Title is required');
    if (!this.formOriginOffice()) return alert('Origin office is required');
    if (!this.formSelectedOffices().length) return alert('Select at least one receiving office');

    this.svc.create({
      title: this.formTitle(),
      date: this.formDate(),
      originOffice: this.formOriginOffice(),
      receivingOffices: this.formSelectedOffices(),
      targetDate: this.formTargetDate() || undefined,
      description: this.formDescription(),
      documentType: this.formDocumentType(),
      priorityLevel: this.formPriorityLevel(),
    } as any).subscribe({
      next: doc => {
        this.viewingDoc.set(doc);
        this.resetForm();
        this.loadDocuments();
      },
      error: err => alert(err?.error?.error || 'Failed to create document'),
    });
  }

  resetForm() {
    this.showForm.set(false);
    this.formTitle.set('');
    this.formDate.set(new Date().toISOString().slice(0, 10));
    this.formOriginOffice.set('');
    this.formSelectedOffices.set([]);
    this.formTargetDate.set('');
    this.formDescription.set('');
    this.formDocumentType.set('General');
    this.formPriorityLevel.set('Normal');
  }

  viewDocument(doc: Document) {
    this.viewingDoc.set(doc);
  }

  closeViewer() {
    this.viewingDoc.set(null);
  }

  forwardDocument(doc: Document) {
    this.svc.forward(doc.id, this.forwardRemarks()).subscribe({
      next: updated => {
        this.viewingDoc.set(updated);
        this.forwardRemarks.set('');
        this.loadDocuments();
      },
      error: err => alert(err?.error?.error || 'Forward failed'),
    });
  }

  voidDocument(doc: Document) {
    if (!confirm('Void this document QR? It will no longer be scannable.')) return;
    this.svc.voidDocument(doc.id).subscribe({
      next: () => {
        this.closeViewer();
        this.loadDocuments();
      },
      error: err => alert(err?.error?.error || 'Void failed'),
    });
  }

  trackDocument() {
    const code = this.trackCode().trim();
    if (!code) return;
    this.trackError.set('');
    this.trackedDoc.set(null);
    this.svc.track(code).subscribe({
      next: doc => this.trackedDoc.set(doc),
      error: err => this.trackError.set(err?.error?.error || 'Not found'),
    });
  }

  deleteDocument(id: number) {
    if (!confirm('Permanently delete this document?')) return;
    this.svc.delete(id).subscribe({
      next: () => {
        this.closeViewer();
        this.loadDocuments();
      },
      error: err => alert(err?.error?.error || 'Delete failed'),
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Completed': return 'badge-success';
      case 'Pending':   return 'badge-warning';
      case 'In Transit': return 'badge-info';
      case 'Rejected':
      case 'Voided':    return 'badge-danger';
      default:          return 'badge-default';
    }
  }

  getPriorityClass(level: string): string {
    switch (level) {
      case 'Highly Urgent': return 'badge-danger';
      case 'Urgent':        return 'badge-warning';
      default:              return 'badge-default';
    }
  }
}
