const { v4: uuidv4 } = require('uuid');
const { processFile } = require('../../jobs/ingestionProcessor');
const databaseService = require('../../database/database.service');

/**
 * Initiates an ingestion job.
 * It creates a job record in the database and then starts the file processing in the background.
 * @param {string} filePath The path to the file to be ingested.
 * @returns {Promise<string>} The ID of the initiated job.
 */
async function startIngestionJob(filePath) {
  // Use the database service to create the job record
  const jobId = await databaseService.createIngestionJob(filePath);

  // Start the background processing job
  processFile(jobId, filePath);

  return jobId;
}

/**
 * Retrieves the status of a specific ingestion job.
 * @param {string} jobId The ID of the job to check.
 * @returns {Promise<object|null>} The formatted job status object, or null if not found.
 */
async function getJobStatus(jobId) {
  // Use the database service to get the raw job data
  const job = await databaseService.getIngestionJob(jobId);

  if (!job) {
    return null;
  }

  // Map the database record to the required API response format
  const response = {
    jobId: job.job_id,
    status: job.status,
    processedLines: job.processed_lines,
    errorLines: job.error_lines,
    totalLines: job.total_lines,
    errors: job.errors,
  };

  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    response.startTime = job.start_time;
    response.endTime = job.end_time;
  }

  return response;
}

/**
 * Constructs a full hierarchical timeline, including all ancestors and descendants, for a given event.
 * @param {string} rootEventId The UUID of the event to start the timeline from.
 * @returns {Promise<object|null>} A nested object representing the full timeline, or null if the event is not found.
 */
async function getTimelineByRootEventId(rootEventId) {
  // Fetch the entire family (ancestors and descendants) in a flat list
  const flatList = await databaseService.getEventFamily(rootEventId);

  if (flatList.length === 0) {
    return null; 
  }

  const nodeMap = new Map();

  for (const item of flatList) {
      const id = item.event_id;
      nodeMap.set(id, {
          id: id,
          ...item,
          children: []
      });
  }

  for (const item of flatList) {
      const parentId = item.parent_event_id;
      if (parentId && nodeMap.has(parentId)) {
          const node = nodeMap.get(item.event_id);
          const parentNode = nodeMap.get(parentId);
          parentNode.children.push(node);
      }
  }

  const resultNode = nodeMap.get(rootEventId);

  if (!resultNode) {
      return null;
  }

  let current = resultNode;
  let parentId = current.parent_event_id;

  while (parentId && nodeMap.has(parentId)) {
      const parentNodeData = nodeMap.get(parentId);
      delete parentNodeData.children;

      current.parent = parentNodeData;
      current = current.parent;
      parentId = current.parent_event_id;
  }

  return resultNode;
}

/**
 * Searches for events based on a set of filter, sort, and pagination parameters.
 * @param {object} params The search parameters.
 * @returns {Promise<object>} The paginated search results.
 */
async function searchEvents(params) {
  // This function now acts as a pass-through to the database service,
  // which handles all the query building and execution logic.
  return databaseService.searchEvents(params);
}

module.exports = {
  startIngestionJob,
  getJobStatus,
  getTimelineByRootEventId,
  searchEvents,
};

