const express = require('express');
const eventController = require('./event.controller');

const router = express.Router();

router.post('/ingest', eventController.ingestEvents);
router.get('/ingestion-status/:jobId', eventController.getIngestionStatus);
router.get('/timeline/:rootEventId', eventController.getTimeline);
router.get('/search', eventController.searchEvents);

module.exports = router;