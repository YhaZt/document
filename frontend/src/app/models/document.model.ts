export interface RoutingStep {
  order: number;
  office: string;
  status: 'Waiting' | 'Pending' | 'Received';
  receivedAt: string | null;
  forwardedAt: string | null;
  remarks: string;
}

export interface Document {
  id: number;
  trackingCode: string;
  title: string;
  date: string;
  originOffice: string;
  receivingOffices: string[];
  currentOffice: string | null;
  routingTrail: RoutingStep[];
  status: string;
  targetDate: string | null;
  description: string;
  documentType: string;
  priorityLevel: string;
  qrCode: string | null;
  isVoided: boolean;
  createdAt: string;
  updatedAt: string;
}
