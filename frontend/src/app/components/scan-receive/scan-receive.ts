import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentService } from '../../services/document.service';
import { Document } from '../../models/document.model';

@Component({
  selector: 'app-scan-receive',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './scan-receive.html',
  styleUrl: './scan-receive.css'
})
export class ScanReceive implements OnInit {
  private svc = inject(DocumentService);
  private route = inject(ActivatedRoute);

  offices = signal<string[]>([]);

  // Input
  scanCode = signal('');
  selectedOffice = signal('');
  remarks = signal('');

  // State
  scannedDoc = signal<Document | null>(null);
  scanMessage = signal('');
  scanError = signal('');
  isVoidedError = signal(false);
  isProcessing = signal(false);
  scanSuccess = signal(false);
  receivedBy = signal('');
  nextOffice = signal<string | null>(null);

  ngOnInit() {
    this.svc.getOffices().subscribe(o => this.offices.set(o));

    // If tracking code was passed in route
    const code = this.route.snapshot.paramMap.get('code');
    if (code) {
      this.scanCode.set(code);
      this.lookupDocument();
    }
  }

  /** Step 1: Look up document by QR / tracking code */
  lookupDocument() {
    const code = this.scanCode().trim();
    if (!code) return;

    this.resetState();
    this.isProcessing.set(true);

    this.svc.track(code).subscribe({
      next: doc => {
        this.scannedDoc.set(doc);
        this.isProcessing.set(false);
      },
      error: err => {
        const msg = err?.error?.error || 'Document not found';
        this.scanError.set(msg);
        if (err.status === 410) {
          this.isVoidedError.set(true);
        }
        this.isProcessing.set(false);
      },
    });
  }

  /** Step 2: Confirm receipt — office scans QR to mark as received */
  confirmReceive() {
    const code = this.scanCode().trim();
    if (!code) return;
    if (!this.selectedOffice()) return alert('Please select your office first');

    this.scanError.set('');
    this.scanMessage.set('');
    this.isProcessing.set(true);

    this.svc.scanReceive(code, this.selectedOffice(), this.remarks()).subscribe({
      next: result => {
        this.scanSuccess.set(true);
        this.scanMessage.set(result.message);
        this.receivedBy.set(result.receivedBy);
        this.nextOffice.set(result.nextOffice);
        this.scannedDoc.set(result.doc);
        this.isProcessing.set(false);
      },
      error: err => {
        const msg = err?.error?.error || 'Scan failed';
        this.scanError.set(msg);
        if (err.status === 410) {
          this.isVoidedError.set(true);
        }
        this.isProcessing.set(false);
      },
    });
  }

  resetState() {
    this.scannedDoc.set(null);
    this.scanMessage.set('');
    this.scanError.set('');
    this.isVoidedError.set(false);
    this.scanSuccess.set(false);
    this.receivedBy.set('');
    this.nextOffice.set(null);
  }

  resetAll() {
    this.scanCode.set('');
    this.selectedOffice.set('');
    this.remarks.set('');
    this.resetState();
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
}
