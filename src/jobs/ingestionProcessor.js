const fs = require('fs');
const readline = require('readline');
const db = require('../configs/db');

// Regular expression to validate if a string is a UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FK_VIOLATION_CODE = '23503';

async function processFile(jobId, filePath) {
  let hasUpdatedStatusToProcessing = false;

  try {
    // Set initial status to PROCESSING in the DB
    await db.query(`UPDATE ingestion_jobs SET status = 'PROCESSING' WHERE job_id = $1`, [jobId]);
    hasUpdatedStatusToProcessing = true;

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    let localErrorCount = 0;
    let localSuccessCount = 0;
    let queryParams = [];

    for await (const line of rl) {
      lineNumber++;

      try {
        const parts = line.split('|');
        if (parts.length !== 7) {
          throw new Error(`Invalid number of fields. Expected 7, got ${parts.length}.`);
        }

        const [eventId, eventName, startDateIso, endDateIso, parentIdOrNull, researchValue, ...rest] = parts;
        const description = rest.join('|');

        if (!UUID_REGEX.test(eventId)) {
          throw new Error(`Invalid UUID format for event_id: '${eventId}'`);
        }
        
        const parentEventId = parentIdOrNull.toUpperCase() === 'NULL' ? null : parentIdOrNull;

        if (parentEventId && !UUID_REGEX.test(parentEventId)) {
          throw new Error(`Invalid UUID format for parent_event_id: '${parentEventId}'`);
        }

        const startDate = new Date(startDateIso);
        const endDate = new Date(endDateIso);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error(`Invalid date format. Start: '${startDateIso}', End: '${endDateIso}'`);
        }

        if (startDate > endDate) {
          throw new Error('start_date cannot be after end_date.');
        }

        const durationMinutes = Math.round((endDate - startDate) / (1000 * 60));

        const queryText = `
          INSERT INTO historical_events (event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (event_id) DO NOTHING;
        `;
        const metadata = { originalSourceFile: filePath, lineNumber, researchValue };
        queryParams = [eventId, eventName, description, startDate, endDate, durationMinutes, parentEventId, metadata];
        
        await db.query(queryText, queryParams);
        localSuccessCount++;

        const updateQuery = `
          UPDATE ingestion_jobs
          SET processed_lines = $1,
          total_lines = $2
          WHERE job_id = $3
        `;

        await db.query(updateQuery, [localSuccessCount, lineNumber, jobId]);

      } catch (error) {
        if(error.code == FK_VIOLATION_CODE){  
          localSuccessCount++;

          const insertQuery = `
          INSERT INTO staging_events (event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (event_id) DO NOTHING;
          `;
          
          await db.query(insertQuery, queryParams);
        }else{
          localErrorCount++;
          
          console.log(`Error: Line ${lineNumber} : ${error.message}`);

          const updateErrorQuery = `
              UPDATE ingestion_jobs
              SET error_lines = error_lines + 1,
                  errors = errors || $1::jsonb
              WHERE job_id = $2;
          `;
          await db.query(updateErrorQuery, [JSON.stringify(`Line ${lineNumber}: ${error.message}`), jobId]);
        }
      }
    }

    const deferredQuery = `
        WITH first_part AS (
          SELECT s.event_id, s.event_name, s.description, s.start_date, s.end_date, s.duration_minutes, s.parent_event_id, s.metadata
          FROM staging_events s
          JOIN historical_events h
            ON h.event_id = s.parent_event_id
        ),
        second_part AS (
          SELECT s.event_id, s.event_name, s.description, s.start_date, s.end_date, s.duration_minutes, s.parent_event_id, s.metadata
          FROM staging_events s
          INNER JOIN first_part fp
            ON fp.event_id = s.parent_event_id
        )
        INSERT INTO historical_events (event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata)
        SELECT event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata FROM first_part
        UNION ALL
        SELECT event_id, event_name, description, start_date, end_date, duration_minutes, parent_event_id, metadata FROM second_part;
    `;

    await db.query(deferredQuery, []);
    // Final update for the completed job
    const finalUpdateQuery = `
        UPDATE ingestion_jobs
        SET status = 'COMPLETED',
            total_lines = $1,
            processed_lines = $2,
            end_time = NOW()
        WHERE job_id = $3;
    `;
    await db.query(finalUpdateQuery, [lineNumber, localSuccessCount, jobId]);

  } catch (err) {
    console.error(`[Job ${jobId}] Failed to process file:`, err);
    // If a fatal error occurs, update the job status to FAILED.
    const status = hasUpdatedStatusToProcessing ? 'FAILED' : 'PENDING';
    const failUpdateQuery = `
        UPDATE ingestion_jobs
        SET status = $1,
            errors = errors || $2::jsonb,
            end_time = NOW()
        WHERE job_id = $3;
    `;
    await db.query(failUpdateQuery, [status, JSON.stringify(`Fatal Error: ${err.message}`), jobId]);
  }
}

module.exports = {
  processFile,
};