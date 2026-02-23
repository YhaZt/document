const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// ---------- SUC Office list (configurable) ----------
const SUC_OFFICES = [
  'Records Office',
  'Registrar',
  'Dean\'s Office',
  'VP for Academic Affairs',
  'VP for Administration',
  'President\'s Office',
  'Accounting Office',
  'Budget Office',
  'Cashier',
  'Human Resource Office',
  'Planning Office',
  'Legal Office',
  'Supply Office',
  'ICT Office',
  'Research Office',
  'Extension Office',
  'Library',
  'Guidance Office',
  'Student Affairs Office',
  'College Secretary',
];

const DOCUMENT_STATUSES = [
  'Pending',
  'Received',
  'In Transit',
  'Under Review',
  'Approved',
  'Rejected',
  'Returned',
  'Completed',
];

// ---------- Helpers ----------

/**
 * Generate a unique tracking code  e.g. "CARPEL-20260223-A3F7"
 * The first segment is a readable name, the rest ensures uniqueness.
 */
function generateTrackingCode() {
  const names = [
    'CARPEL', 'BAUTISTA', 'REYES', 'SANTOS', 'CRUZ',
    'GARCIA', 'TORRES', 'RAMOS', 'CASTRO', 'FLORES',
  ];
  const name = names[Math.floor(Math.random() * names.length)];
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hex  = uuidv4().split('-')[0].toUpperCase().slice(0, 4);
  return `${name}-${date}-${hex}`;
}

// ---------- In-memory store ----------
let documents = [];
let nextId = 1;

// ---------- Controller ----------

exports.getOffices = (_req, res) => {
  res.json(SUC_OFFICES);
};

exports.getStatuses = (_req, res) => {
  res.json(DOCUMENT_STATUSES);
};

exports.getAll = (_req, res) => {
  // Only return active (non-voided) documents
  const active = documents.filter(d => !d.isVoided);
  res.json(active);
};

exports.getById = (req, res) => {
  const doc = documents.find(d => d.id === parseInt(req.params.id));
  if (!doc)        return res.status(404).json({ error: 'Document not found' });
  if (doc.isVoided) return res.status(410).json({ error: 'Document QR has been voided' });
  res.json(doc);
};

exports.create = async (req, res) => {
  try {
    const {
      title,
      date,
      receivingOffices,   // ordered array of office names
      status,
      originOffice,       // came from what office
      targetDate,
      description,
      documentType,       // e.g. Memorandum, Resolution, Letter, etc.
      priorityLevel,      // Normal, Urgent, Highly Urgent
    } = req.body;

    // Validation
    if (!title)            return res.status(400).json({ error: 'Title is required' });
    if (!originOffice)     return res.status(400).json({ error: 'Origin office is required' });
    if (!receivingOffices || !receivingOffices.length)
      return res.status(400).json({ error: 'At least one receiving office is required' });

    const trackingCode = generateTrackingCode();

    // Build routing trail – first office is "current"
    const routingTrail = receivingOffices.map((office, i) => ({
      order: i + 1,
      office,
      status: i === 0 ? 'Pending' : 'Waiting',
      receivedAt: null,
      forwardedAt: null,
      remarks: '',
    }));

    // Generate QR code as base-64 data-URL
    const qrPayload = JSON.stringify({
      trackingCode,
      id: nextId,
      url: `http://localhost:3000/api/documents/track/${trackingCode}`,
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });

    const doc = {
      id: nextId++,
      trackingCode,
      title,
      date: date || new Date().toISOString(),
      originOffice,
      receivingOffices,
      currentOffice: receivingOffices[0],
      routingTrail,
      status: status || 'Pending',
      targetDate: targetDate || null,
      description: description || '',
      documentType: documentType || 'General',
      priorityLevel: priorityLevel || 'Normal',
      qrCode: qrDataUrl,
      isVoided: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    documents.push(doc);
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create document' });
  }
};

exports.update = (req, res) => {
  const index = documents.findIndex(d => d.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Document not found' });
  if (documents[index].isVoided) return res.status(410).json({ error: 'Cannot update a voided document' });

  const allowed = [
    'title', 'date', 'receivingOffices', 'status', 'originOffice',
    'targetDate', 'description', 'documentType', 'priorityLevel',
  ];

  allowed.forEach(key => {
    if (req.body[key] !== undefined) {
      documents[index][key] = req.body[key];
    }
  });
  documents[index].updatedAt = new Date().toISOString();
  res.json(documents[index]);
};

/** Forward document to next office in the routing trail */
exports.forward = (req, res) => {
  const doc = documents.find(d => d.id === parseInt(req.params.id));
  if (!doc)         return res.status(404).json({ error: 'Document not found' });
  if (doc.isVoided) return res.status(410).json({ error: 'Document QR has been voided' });

  const { remarks } = req.body;
  const currentStep = doc.routingTrail.find(s => s.status === 'Pending');
  if (!currentStep) return res.status(400).json({ error: 'No pending office to forward to' });

  // Mark current step done
  currentStep.status = 'Received';
  currentStep.receivedAt = new Date().toISOString();
  currentStep.forwardedAt = new Date().toISOString();
  if (remarks) currentStep.remarks = remarks;

  // Advance to next
  const nextStep = doc.routingTrail.find(s => s.status === 'Waiting');
  if (nextStep) {
    nextStep.status = 'Pending';
    doc.currentOffice = nextStep.office;
    doc.status = 'In Transit';
  } else {
    doc.status = 'Completed';
    doc.currentOffice = null;
  }
  doc.updatedAt = new Date().toISOString();
  res.json(doc);
};

/** Void / shade the QR – once voided the QR will not scan */
exports.voidDocument = (req, res) => {
  const doc = documents.find(d => d.id === parseInt(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  doc.isVoided = true;
  doc.status = 'Voided';
  doc.qrCode = null;           // remove QR data
  doc.updatedAt = new Date().toISOString();
  res.json({ message: 'Document QR has been voided and will no longer scan', doc });
};

/** Track by QR / tracking code */
exports.track = (req, res) => {
  const doc = documents.find(d => d.trackingCode === req.params.code);
  if (!doc)         return res.status(404).json({ error: 'Tracking code not found' });
  if (doc.isVoided) return res.status(410).json({ error: 'This QR code has been voided / shaded and is no longer valid' });
  res.json(doc);
};

/**
 * Scan QR to receive document at the current pending office.
 * This is what an office does when they physically receive the document:
 *   1. They scan the QR code
 *   2. The system marks their office step as "Received"
 *   3. The document automatically moves to the next office in the trail
 * If the QR is voided/shaded the scan is rejected.
 */
exports.scan = (req, res) => {
  const doc = documents.find(d => d.trackingCode === req.params.code);
  if (!doc)
    return res.status(404).json({ error: 'Tracking code not found' });

  // ---- VOID CHECK: QR shaded / removed → reject scan ----
  if (doc.isVoided)
    return res.status(410).json({
      error: 'SCAN REJECTED — This QR code has been voided / shaded and is no longer valid.',
      isVoided: true,
    });

  const { officeName, remarks } = req.body;

  // Find the current pending step
  const currentStep = doc.routingTrail.find(s => s.status === 'Pending');
  if (!currentStep)
    return res.status(400).json({ error: 'No pending office. Document routing is already completed.' });

  // Optional: verify the scanning office matches the expected office
  if (officeName && officeName !== currentStep.office)
    return res.status(403).json({
      error: `This document is currently assigned to "${currentStep.office}". Your office "${officeName}" cannot receive it yet.`,
      expectedOffice: currentStep.office,
    });

  // Mark current step as Received
  currentStep.status = 'Received';
  currentStep.receivedAt = new Date().toISOString();
  currentStep.forwardedAt = new Date().toISOString();
  if (remarks) currentStep.remarks = remarks;

  // Advance to next office in trail
  const nextStep = doc.routingTrail.find(s => s.status === 'Waiting');
  if (nextStep) {
    nextStep.status = 'Pending';
    doc.currentOffice = nextStep.office;
    doc.status = 'In Transit';
  } else {
    doc.status = 'Completed';
    doc.currentOffice = null;
  }
  doc.updatedAt = new Date().toISOString();

  res.json({
    message: `Document received by "${currentStep.office}" successfully.`,
    receivedBy: currentStep.office,
    nextOffice: nextStep ? nextStep.office : null,
    doc,
  });
};

exports.delete = (req, res) => {
  const index = documents.findIndex(d => d.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Document not found' });

  const deleted = documents.splice(index, 1);
  res.json(deleted[0]);
};
