const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { createCanvas, loadImage } = require('canvas');

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

/**
 * Simple seeded PRNG (mulberry32) – deterministic per tracking code.
 */
function seededRNG(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  let t = (h >>> 0) + 0x6D2B79F5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Render text into a high-res module grid (boolean[][]).
 * moduleSize=2 gives 2× resolution → smoother letters.
 */
function textToModuleGrid(text, fontSize, moduleSize) {
  const tmpW = 600;
  const tmpH = fontSize + 8;
  const tmpCanvas = createCanvas(tmpW, tmpH);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.fillStyle = '#ffffff';
  tmpCtx.fillRect(0, 0, tmpW, tmpH);
  tmpCtx.fillStyle = '#000000';
  tmpCtx.font = `bold ${fontSize}px "Arial Black", Impact, sans-serif`;
  tmpCtx.textBaseline = 'top';
  tmpCtx.textAlign = 'left';
  tmpCtx.fillText(text, 2, 2);

  const textPxW = Math.ceil(tmpCtx.measureText(text).width) + 4;
  const textPxH = fontSize + 4;
  const imgData = tmpCtx.getImageData(0, 0, textPxW, textPxH);

  const cols = Math.ceil(textPxW / moduleSize);
  const rows = Math.ceil(textPxH / moduleSize);
  const grid = [];

  for (let mr = 0; mr < rows; mr++) {
    const row = [];
    for (let mc = 0; mc < cols; mc++) {
      let darkCount = 0;
      let total = 0;
      for (let dy = 0; dy < moduleSize; dy++) {
        for (let dx = 0; dx < moduleSize; dx++) {
          const px = mc * moduleSize + dx;
          const py = mr * moduleSize + dy;
          if (px < textPxW && py < textPxH) {
            const idx = (py * textPxW + px) * 4;
            if (imgData.data[idx] < 128) darkCount++;
            total++;
          }
        }
      }
      row.push(darkCount > total * 0.35);
    }
    grid.push(row);
  }
  return { grid, cols, rows };
}

/**
 * Generate QR with retro pixel-block "CARPEL" + "iBIBES" in center.
 * White space around text filled with unique seeded QR-shade modules.
 */
async function generateQRWithOverlay(payload, trackingCode) {
  // 1. Raw QR matrix
  const qrData = QRCode.create(payload, { errorCorrectionLevel: 'L' });
  const modules = qrData.modules;
  const modCount = modules.size;          // e.g. 41, 45 …
  const modPx = 10;                       // pixel size per module on canvas

  const qrPx = modCount * modPx;
  const pad = 24;
  const bottomArea = 40;
  const canvasW = qrPx + pad * 2;
  const canvasH = qrPx + pad * 2 + bottomArea;

  // Copy to mutable 2D grid
  const grid = [];
  for (let r = 0; r < modCount; r++) {
    const row = [];
    for (let c = 0; c < modCount; c++) {
      row.push(modules.get(r, c) ? 1 : 0);
    }
    grid.push(row);
  }

  // 2. Render text to module grids (moduleSize=2 → higher resolution)
  const nameMods  = textToModuleGrid('CARPEL', 18, 2);
  const labelMods = textToModuleGrid('iBIBES', 14, 2);

  // Layout: name on top, 1 module gap, label below
  const gap = 1;
  const blockRows = nameMods.rows + gap + labelMods.rows;
  const blockCols = Math.max(nameMods.cols, labelMods.cols);

  // Tight padding: 1 module border around text block
  const padC = 1;
  const padR = 1;
  const totalCols = blockCols + padC * 2;
  const totalRows = blockRows + padR * 2;
  const startC = Math.floor((modCount - totalCols) / 2);
  const startR = Math.floor((modCount - totalRows) / 2);

  // 3. Fill cleared area with seeded random QR-shade modules (unique pattern)
  const rand = seededRNG(trackingCode);
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const gr = startR + r;
      const gc = startC + c;
      if (gr >= 0 && gr < modCount && gc >= 0 && gc < modCount) {
        // ~30% chance dark module for background texture
        grid[gr][gc] = rand() < 0.30 ? 1 : 0;
      }
    }
  }

  // 4. Stamp "CARPEL" text modules (with 1-module white outline for contrast)
  const nameOffC = Math.floor((blockCols - nameMods.cols) / 2);
  // First pass: clear a 1-module halo around each dark text module
  for (let r = 0; r < nameMods.rows; r++) {
    for (let c = 0; c < nameMods.cols; c++) {
      if (nameMods.grid[r][c]) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const gr = startR + padR + r + dr;
            const gc = startC + padC + nameOffC + c + dc;
            if (gr >= 0 && gr < modCount && gc >= 0 && gc < modCount) {
              grid[gr][gc] = 0;
            }
          }
        }
      }
    }
  }
  // Second pass: stamp dark text modules
  for (let r = 0; r < nameMods.rows; r++) {
    for (let c = 0; c < nameMods.cols; c++) {
      if (nameMods.grid[r][c]) {
        const gr = startR + padR + r;
        const gc = startC + padC + nameOffC + c;
        if (gr >= 0 && gr < modCount && gc >= 0 && gc < modCount) {
          grid[gr][gc] = 1;
        }
      }
    }
  }

  // 5. Stamp "iBIBES" with same halo technique
  const labelOffC = Math.floor((blockCols - labelMods.cols) / 2);
  const labelTopR = nameMods.rows + gap;
  for (let r = 0; r < labelMods.rows; r++) {
    for (let c = 0; c < labelMods.cols; c++) {
      if (labelMods.grid[r][c]) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const gr = startR + padR + labelTopR + r + dr;
            const gc = startC + padC + labelOffC + c + dc;
            if (gr >= 0 && gr < modCount && gc >= 0 && gc < modCount) {
              grid[gr][gc] = 0;
            }
          }
        }
      }
    }
  }
  for (let r = 0; r < labelMods.rows; r++) {
    for (let c = 0; c < labelMods.cols; c++) {
      if (labelMods.grid[r][c]) {
        const gr = startR + padR + labelTopR + r;
        const gc = startC + padC + labelOffC + c;
        if (gr >= 0 && gr < modCount && gc >= 0 && gc < modCount) {
          grid[gr][gc] = 1;
        }
      }
    }
  }

  // 6. Render all modules as uniform square blocks
  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      ctx.fillStyle = grid[r][c] ? '#000000' : '#ffffff';
      ctx.fillRect(pad + c * modPx, pad + r * modPx, modPx, modPx);
    }
  }

  // 7. Tracking code below QR (plain text, outside)
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(trackingCode, canvasW / 2, pad + qrPx + 22);

  return canvas.toDataURL('image/png');
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

    // Generate QR code with name overlay in center
    const qrPayload = JSON.stringify({
      trackingCode,
      id: nextId,
      url: `http://localhost:3000/api/documents/track/${trackingCode}`,
    });
    const qrDataUrl = await generateQRWithOverlay(qrPayload, trackingCode);

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
