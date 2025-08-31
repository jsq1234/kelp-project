const { v4: uuidv4 } = require('uuid');
const { processFile } = require('../../jobs/ingestionProcessor');
const db = require('../../configs/db');

// The in-memory jobStatuses object has been removed.

async function startIngestionJob(filePath) {
  const queryText = `
    INSERT INTO ingestion_jobs (status, file_path)
    VALUES ('PENDING', $1) RETURNING job_id;
  `;

  const result = await db.query(queryText, [filePath]);
  const jobId = result.rows[0].job_id;

  processFile(jobId, filePath);

  return jobId;
}

async function getJobStatus(jobId) {
  const queryText = `SELECT * FROM ingestion_jobs WHERE job_id = $1`;
  const { rows } = await db.query(queryText, [jobId]);

  if (rows.length === 0) {
    return null; 
  }

  const job = rows[0];

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

async function getTimelineByRootEventId(rootEventId) {
  const queryText = `
    WITH RECURSIVE EventAncestors AS (
        SELECT
            event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata
        FROM
            historical_events
        WHERE
            event_id = $1
        UNION ALL

        SELECT
            e.event_id, e.event_name, e.description, e.start_date, e.end_date, e.duration_minutes, e.parent_event_id, e.metadata
        FROM
            historical_events e
        INNER JOIN
            EventAncestors ea ON e.event_id = ea.parent_event_id
    ),
    EventDescendants AS (
        SELECT
            event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata
        FROM
            historical_events
        WHERE
            event_id = $1

        UNION ALL

        SELECT
            e.event_id, e.event_name, e.description, e.start_date, e.end_date, e.duration_minutes, e.parent_event_id, e.metadata
        FROM
            historical_events e
        INNER JOIN
            EventDescendants ed ON e.parent_event_id = ed.event_id
    )
    SELECT * FROM EventAncestors
    UNION
    SELECT * FROM EventDescendants;
  `;

  const { rows : flatList } = await db.query(queryText, [rootEventId]);

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

async function searchEvents(params) {
  const { name, startDateAfter, endDateBefore, sortBy, sortOrder, page, limit } = params;

  const allowedSortBy = ['event_name', 'start_date', 'end_date'];
  const sortColumn = allowedSortBy.includes(sortBy) ? `"${sortBy}"` : 'start_date';

  const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const offset = (page - 1) * limit;

  let whereClauses = [];
  let queryValues = [];
  let paramIndex = 1;

  if (name) {
    whereClauses.push(`event_name ILIKE $${paramIndex++}`);
    queryValues.push(`%${name}%`);
  }
  if (startDateAfter) {
    whereClauses.push(`start_date >= $${paramIndex++}`);
    queryValues.push(startDateAfter);
  }
  if (endDateBefore) {
    whereClauses.push(`end_date <= $${paramIndex++}`);
    queryValues.push(endDateBefore);
  }

  const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) FROM historical_events ${whereString}`;
  const countResult = await db.query(countQuery, queryValues);
  const totalEvents = parseInt(countResult.rows[0].count, 10);

  // Then, fetch the actual data with sorting and pagination
  const dataQuery = `
    SELECT event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id
    FROM historical_events
    ${whereString}
    ORDER BY ${sortColumn} ${order}
    LIMIT $${paramIndex++}
    OFFSET $${paramIndex++}
  `;
  
  const finalQueryValues = [...queryValues, limit, offset];
  const { rows: events } = await db.query(dataQuery, finalQueryValues);

  return {
    totalEvents,
    page,
    limit,
    events,
  };
}

module.exports = {
  startIngestionJob,
  getJobStatus,
  getTimelineByRootEventId,
  searchEvents,
};

