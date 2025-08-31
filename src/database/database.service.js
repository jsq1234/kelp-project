const db = require('../configs/db');

/**
 * A service class to centralize all database interactions.
 */
class DatabaseService {
  /**
   * Creates a new ingestion job record in the database.
   * @param {string} filePath The path to the file being ingested.
   * @returns {Promise<string>} The ID of the newly created job.
   */
  async createIngestionJob(filePath) {
    const queryText = `
      INSERT INTO ingestion_jobs (status, file_path)
      VALUES ('PENDING', $1) RETURNING job_id;
    `;
    const { rows } = await db.query(queryText, [filePath]);
    return rows[0].job_id;
  }

  /**
   * Retrieves a specific ingestion job from the database by its ID.
   * @param {string} jobId The ID of the job to retrieve.
   * @returns {Promise<object|null>} The job object, or null if not found.
   */
  async getIngestionJob(jobId) {
    const queryText = `SELECT * FROM ingestion_jobs WHERE job_id = $1`;
    const { rows } = await db.query(queryText, [jobId]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Fetches the entire family tree of an event (all ancestors and all descendants).
   * @param {string} eventId The starting event's UUID.
   * @returns {Promise<Array<object>>} A flat array of all related event objects.
   */
  async getEventFamily(eventId) {
    const queryText = `
      WITH RECURSIVE EventAncestors AS (
          -- Base case: Select the starting event
          SELECT
              event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata
          FROM
              historical_events
          WHERE
              event_id = $1
          UNION ALL
          -- Recursive step: Find the parent of the current event in the set
          SELECT
              e.event_id, e.event_name, e.description, e.start_date, e.end_date, e.duration_minutes, e.parent_event_id, e.metadata
          FROM
              historical_events e
          INNER JOIN
              EventAncestors ea ON e.event_id = ea.parent_event_id
      ),
      EventDescendants AS (
          -- Base case: Select the starting event
          SELECT
              event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata
          FROM
              historical_events
          WHERE
              event_id = $1
          UNION ALL
          -- Recursive step: Find the children of the current event in the set
          SELECT
              e.event_id, e.event_name, e.description, e.start_date, e.end_date, e.duration_minutes, e.parent_event_id, e.metadata
          FROM
              historical_events e
          INNER JOIN
              EventDescendants ed ON e.parent_event_id = ed.event_id
      )
      -- Combine both sets, ensuring uniqueness
      SELECT * FROM EventAncestors
      UNION
      SELECT * FROM EventDescendants;
    `;
    const { rows } = await db.query(queryText, [eventId]);
    return rows;
  }

  /**
   * Searches for events with dynamic filtering, sorting, and pagination.
   * @param {object} params - The search parameters.
   * @param {string} [params.name] - Partial name to filter by.
   * @param {string} [params.startDateAfter] - ISO date string.
   * @param {string} [params.endDateBefore] - ISO date string.
   * @param {string} [params.sortBy] - Column to sort by.
   * @param {string} [params.sortOrder] - 'asc' or 'desc'.
   * @param {number} [params.page] - Page number for pagination.
   * @param {number} [params.limit] - Number of items per page.
   * @returns {Promise<{totalEvents: number, events: Array<object>}>} The search results.
   */
  async searchEvents(params) {
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

    return { totalEvents, events };
  }

  /**
   * Retrieves all events that occur within a given date range.
   * @param {string} startDate - The start of the date range (ISO 8601).
   * @param {string} endDate - The end of the date range (ISO 8601).
   * @returns {Promise<Array<object>>} An array of event objects.
   */
  async getEventsInRange(startDate, endDate) {
    const queryText = `
      SELECT
        event_id,
        event_name,
        start_date,
        end_date
      FROM
        historical_events
      WHERE
        start_date <= $2 AND end_date >= $1; -- Corrected logic for any overlap
    `;
    const { rows } = await db.query(queryText, [startDate, endDate]);
    return rows;
  }

  /**
   * Retrieves events within a date range, sorted by their start date.
   * @param {string} startDate - The start of the date range (ISO 8601).
   * @param {string} endDate - The end of the date range (ISO 8601).
   * @returns {Promise<Array<object>>} A sorted array of event objects.
   */
  async getSortedEventsInRange(startDate, endDate) {
    const queryText = `
      SELECT event_id, event_name, start_date, end_date
      FROM historical_events
      WHERE start_date <= $2 AND end_date >= $1 -- Corrected logic for any overlap
      ORDER BY start_date;
    `;
    const { rows } = await db.query(queryText, [startDate, endDate]);
    return rows;
  }

  /**
   * Fetches all descendants for a given root event.
   * @param {string} rootEventId The root event's UUID.
   * @returns {Promise<Array<object>>} A flat array of all descendant event objects, including the root.
   */
  async getEventDescendants(rootEventId) {
    const queryText = `
      WITH RECURSIVE event_hierarchy AS (
        -- Base case: Select the root event
        SELECT
          event_id, event_name, duration_minutes, parent_event_id
        FROM
          historical_events
        WHERE
          event_id = $1

        UNION ALL

        -- Recursive step: Find the direct children of events in the hierarchy
        SELECT
          e.event_id, e.event_name, e.duration_minutes, e.parent_event_id
        FROM
          historical_events e
        INNER JOIN
          event_hierarchy eh ON e.parent_event_id = eh.event_id
      )
      SELECT * FROM event_hierarchy;
    `;
    const { rows } = await db.query(queryText, [rootEventId]);
    return rows;
  }
}

// Export a singleton instance of the service
module.exports = new DatabaseService();
