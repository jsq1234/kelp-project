const eventService = require('./event.service');
const fs = require('fs');

async function ingestEvents(req, res) {
  const { filePath } = req.body;

  // Basic validation to ensure a file path is provided
  if (!filePath) {
    return res.status(400).json({ message: 'filePath is required.' });
  }

  // Check if the file actually exists before starting the job
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: `File not found at path: ${filePath}` });
  }

  try {
    // Call the service to start the ingestion job in the background
    const jobId = await eventService.startIngestionJob(filePath);
    // Immediately respond to the client, confirming the job has been initiated.
    // The client can use the jobId to check the status later.
    res.status(202).json({
      status: 'Ingestion initiated',
      jobId: jobId,
      message: `Check /api/events/ingestion-status/${jobId} for updates.`,
    });
  } catch (error) {
    console.error('Error initiating ingestion job:', error);
    res.status(500).json({ message: 'Failed to initiate ingestion job.' });
  }
}


async function getIngestionStatus(req, res) {
  try {
    const { jobId } = req.params;
    const jobStatus = await eventService.getJobStatus(jobId);

    if (!jobStatus) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.status(200).json(jobStatus);
  } catch (error) {
    console.error(`Error fetching status for job ${req.params.jobId}:`, error);
    res.status(500).json({ message: 'Failed to retrieve job status' });
  }
}

async function getTimeline(req, res) {
  try {
    const { rootEventId } = req.params;
    const timeline = await eventService.getTimelineByRootEventId(rootEventId);

    if (!timeline) {
      return res.status(404).json({ message: 'Timeline not found for the given root event ID' });
    }

    res.status(200).json(timeline);
  } catch (error) {
    console.error(`Error fetching timeline for root event ${req.params.rootEventId}:`, error);
    res.status(500).json({ message: 'Failed to retrieve timeline' });
  }
}

async function searchEvents(req, res) {
  try {
    // Extract and provide default values for query parameters
    const params = {
      name: req.query.name,
      startDateAfter: req.query.start_date_after,
      endDateBefore: req.query.end_date_before,
      sortBy: req.query.sortBy || 'start_date',
      sortOrder: req.query.sortOrder || 'asc',
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 10,
    };

    const result = await eventService.searchEvents(params);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error searching events:', error);
    res.status(500).json({ message: 'Failed to search events' });
  }
}


module.exports = {
  ingestEvents,
  getIngestionStatus,
  getTimeline,
  searchEvents,
};