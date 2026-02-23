const express = require('express');
const router = express.Router();
const documentController = require('../controllers/document.controller');

// Lookup routes
router.get('/offices', documentController.getOffices);
router.get('/statuses', documentController.getStatuses);

// Document CRUD
router.get('/documents', documentController.getAll);
// Tracking must be before :id to avoid conflict
router.get('/documents/track/:code', documentController.track);
router.get('/documents/:id', documentController.getById);
router.post('/documents', documentController.create);
router.put('/documents/:id', documentController.update);
router.delete('/documents/:id', documentController.delete);

// Tracking & workflow
router.post('/documents/scan/:code', documentController.scan);
router.post('/documents/:id/forward', documentController.forward);
router.post('/documents/:id/void', documentController.voidDocument);

module.exports = router;
