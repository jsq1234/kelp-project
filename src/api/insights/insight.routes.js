const express = require('express');
const eventController = require('./insight.controller');

const router = express.Router();

router.get('/overlapping-events', eventController.getOverlappingEvents);
router.get('/temporal-gaps', eventController.getTemporalGaps);
router.get('/event-influence', eventController.getEventInfluence);

module.exports = router;