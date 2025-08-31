const db = require('../../configs/db');

async function findOverlappingEvents(startDate, endDate) {
  const queryText = `
    SELECT
      event_id,
      event_name,
      start_date,
      end_date
    FROM
      historical_events
    WHERE
      start_date >= $1 AND end_date <= $2;
  `;

  const { rows: events } = await db.query(queryText, [startDate, endDate]);

  if (events.length < 2) {
    return []; 
  }


  const points = [];
  for (const event of events) {
    points.push({ time: event.start_date.getTime(), type: 'start', event: event });
    points.push({ time: event.end_date.getTime(), type: 'end', event: event });
  }

  points.sort((a, b) => a.time - b.time || (a.type === 'start' ? -1 : 1));

  const overlappingPairs = [];
  const activeEvents = new Set();
  const reportedPairs = new Set(); 

  for (const point of points) {
    if (point.type === 'start') {
      for (const activeEvent of activeEvents) {
        const pairKey = [point.event.event_id, activeEvent.event_id].sort().join('|');

        if (!reportedPairs.has(pairKey)) {
          const overlapStart = new Date(Math.max(point.event.start_date.getTime(), activeEvent.start_date.getTime()));
          const overlapEnd = new Date(Math.min(point.event.end_date.getTime(), activeEvent.end_date.getTime()));
          const overlapDurationMinutes = Math.floor((overlapEnd - overlapStart) / (1000 * 60));

          if (overlapDurationMinutes > 0) {
            overlappingPairs.push({
              overlappingEventPairs: [
                {
                  event_id: point.event.event_id,
                  event_name: point.event.event_name,
                  start_date: point.event.start_date,
                  end_date: point.event.end_date,
                },
                {
                  event_id: activeEvent.event_id,
                  event_name: activeEvent.event_name,
                  start_date: activeEvent.start_date,
                  end_date: activeEvent.end_date,
                }
              ],
              overlap_duration_minutes: overlapDurationMinutes,
            });
            reportedPairs.add(pairKey);
          }
        }
      }
      activeEvents.add(point.event);
    } else {
      activeEvents.delete(point.event);
    }
  }

  return overlappingPairs;
}

async function findTemporalGaps(startDate, endDate) {
  const queryText = `
    SELECT event_id, event_name, start_date, end_date
    FROM historical_events
    WHERE start_date >= $1 AND end_date <= $2
    ORDER BY start_date;
  `;

  const { rows: events } = await db.query(queryText, [startDate, endDate]);

  if (events.length < 2) {
    return {
      largestGap: null,
      message: "No significant temporal gaps found within the specified range, or too few events."
    };
  }

  // Step 3: Iterate through the sorted events to find the largest gap.
  let largestGap = {
    durationMinutes: 0,
    startOfGap: null,
    endOfGap: null,
    precedingEvent: null,
    succeedingEvent: null,
  };

  for (let i = 0; i < events.length - 1; i++) {
    const precedingEvent = events[i];
    const succeedingEvent = events[i+1];

    const gapStart = precedingEvent.end_date;
    const gapEnd = succeedingEvent.start_date;
    
    // Calculate the duration of the gap in milliseconds
    const gapDurationMs = gapEnd.getTime() - gapStart.getTime();

    if (gapDurationMs > largestGap.durationMinutes * 60 * 1000) {
      largestGap = {
        durationMinutes: Math.floor(gapDurationMs / (1000 * 60)),
        startOfGap: gapStart,
        endOfGap: gapEnd,
        precedingEvent: {
          event_id: precedingEvent.event_id,
          event_name: precedingEvent.event_name,
          end_date: precedingEvent.end_date,
        },
        succeedingEvent: {
          event_id: succeedingEvent.event_id,
          event_name: succeedingEvent.event_name,
          start_date: succeedingEvent.start_date,
        },
      };
    }
  }

  if (largestGap.durationMinutes > 0) {
    return {
      largestGap,
      message: "Largest temporal gap identified."
    };
  } else {
    return {
      largestGap: null,
      message: "No significant temporal gaps found within the specified range, or too few events."
    };
  }
}

async function findEventInfluencePath(sourceEventId, targetEventId) {
  // Step 1: Fetch all events in the hierarchy starting from the source event.
  // This defines the graph we need to search.
  const queryText = `
    WITH RECURSIVE event_hierarchy AS (
      SELECT
        event_id, event_name, duration_minutes, parent_event_id
      FROM
        historical_events
      WHERE
        event_id = $1

      UNION ALL

      SELECT
        e.event_id, e.event_name, e.duration_minutes, e.parent_event_id
      FROM
        historical_events e
      INNER JOIN
        event_hierarchy eh ON e.parent_event_id = eh.event_id
    )
    SELECT * FROM event_hierarchy;
  `;
  const { rows: events } = await db.query(queryText, [sourceEventId]);

  if (events.length === 0) {
    return { message: "Source event not found." };
  }

  // Step 2: Build an in-memory representation of the graph (adjacency list and node data map).
  const eventMap = new Map();
  const childrenMap = new Map();
  for (const event of events) {
    eventMap.set(event.event_id, {
      event_id: event.event_id,
      event_name: event.event_name,
      duration_minutes: event.duration_minutes,
    });
    if (event.parent_event_id) {
      if (!childrenMap.has(event.parent_event_id)) {
        childrenMap.set(event.parent_event_id, []);
      }
      childrenMap.get(event.parent_event_id).push(event.event_id);
    }
  }

  if (!eventMap.has(targetEventId)) {
    return {
      sourceEventId,
      targetEventId,
      shortestPath: [],
      totalDurationMinutes: 0,
      message: "No temporal path found from source to target event."
    };
  }

  // Step 3: Use Dijkstra's algorithm to find the shortest path.
  const distances = new Map();
  const previousNodes = new Map();
  const pq = new Set([sourceEventId]); // Using a Set as a simple priority queue

  for (const eventId of eventMap.keys()) {
    distances.set(eventId, Infinity);
  }
  distances.set(sourceEventId, eventMap.get(sourceEventId).duration_minutes);

  while (pq.size > 0) {
    let u = null;
    // Get the node in pq with the smallest distance
    for (const eventId of pq) {
      if (u === null || distances.get(eventId) < distances.get(u)) {
        u = eventId;
      }
    }
    pq.delete(u);

    if (u === targetEventId) break; // We found the target

    const children = childrenMap.get(u) || [];
    for (const v of children) {
      const alt = distances.get(u) + eventMap.get(v).duration_minutes;
      if (alt < distances.get(v)) {
        distances.set(v, alt);
        previousNodes.set(v, u);
        pq.add(v);
      }
    }
  }

  // Step 4: Reconstruct the path and format the response.
  const path = [];
  let currentId = targetEventId;
  if (previousNodes.has(currentId) || currentId === sourceEventId) {
    while (currentId) {
      path.unshift(eventMap.get(currentId));
      currentId = previousNodes.get(currentId);
    }
  }
  
  if (path.length > 0 && path[0].event_id === sourceEventId) {
    return {
      sourceEventId,
      targetEventId,
      shortestPath: path,
      totalDurationMinutes: distances.get(targetEventId),
      message: "Shortest temporal path found from source to target event."
    };
  } else {
    return {
      sourceEventId,
      targetEventId,
      shortestPath: [],
      totalDurationMinutes: 0,
      message: "No temporal path found from source to target event."
    };
  }
}

module.exports = {
  findOverlappingEvents,
  findTemporalGaps,
  findEventInfluencePath
};

