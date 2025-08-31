const insightService = require('./insight.service');

async function getOverlappingEvents(req, res) {
  try {
    const params = {
      startDate: req.query.start_date,
      endDate: req.query.end_date
    };

    const result = await insightService.findOverlappingEvents(params.startDate, params.endDate);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error finding overlapping events:', error);
    res.status(500).json({ message: 'Failed to find overlapping events' });
  }
}

async function getTemporalGaps(req, res) {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Both startDate and endDate query parameters are required.' });
    }

    const result = await insightService.findTemporalGaps(startDate, endDate);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error finding temporal gaps:', error);
    res.status(500).json({ message: 'Failed to find temporal gaps.' });
  }
}

async function getEventInfluence(req, res) {
  try {
    const { sourceEventId, targetEventId } = req.query;
    if (!sourceEventId || !targetEventId) {
      return res.status(400).json({ message: 'Both sourceEventId and targetEventId query parameters are required.' });
    }
    const result = await insightService.findEventInfluencePath(sourceEventId, targetEventId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error finding event influence path:', error);
    res.status(500).json({ message: 'Failed to find event influence path.' });
  }
}

module.exports = {
    getOverlappingEvents,
    getTemporalGaps,
    getEventInfluence,
}