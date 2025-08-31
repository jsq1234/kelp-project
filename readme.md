# Chronologicon Engine - ArchaeoData Inc.

## Project Overview

The Chronologicon Engine is a robust Node.js backend service designed for ArchaeoData Inc. to ingest, manage, query, and analyze fragmented historical event data. The primary goal is to reconstruct coherent historical timelines from large, disparate text files. The service provides a RESTful API to handle asynchronous data ingestion, retrieve hierarchical timelines, perform complex searches, and gain analytical insights into the event data.

This project is built with a focus on scalability, data integrity, and performance, using a PostgreSQL database for persistent storage and efficient querying.

---

## Key Features

* **Asynchronous File Ingestion:** Efficiently processes large text files by streaming data, with robust error handling and persistent job status tracking.
* **Hierarchical Timeline Reconstruction:** Fetches and displays entire event hierarchies (parents and all descendants) from a single root event.
* **Advanced Event Search:** Supports dynamic filtering by name, date range, sorting, and pagination.
* **Analytical Insights:**
    * **Overlapping Events:** Identifies pairs of events that have overlapping timeframes within a given period.
    * **Temporal Gap Finder:** Locates the largest continuous time gap where no events are recorded.
    * **Event Influence Spreader:** Calculates the shortest temporal path between two events in the hierarchy based on cumulative duration.

---

## Setup and Installation

Follow these instructions to get the Chronologicon Engine running on your local machine.

### Prerequisites

* [Node.js](https://nodejs.org/) (v14.x or later recommended)
* [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd <repository-folder>
```

### 2. Install Dependencies

Install the required npm packages.

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root of the project directory. This file will hold your database credentials.

```bash
touch .env
```

Now, open the `.env` file and add the following configuration. These values **must** match the `environment` section in the `docker-compose.yml` file.

```ini
# .env file
PGUSER=oreshnik
PGPASSWORD=mysecretpassword
PGDATABASE=historical_events
PGHOST=localhost
PGPORT=5432
```

### 4. Start the Database

Use Docker Compose to build and run the PostgreSQL container in the background.

```bash
docker-compose up -d
```

The first time you run this, it will download the PostgreSQL image and set up the `historical_events` database and tables as defined in `init.sql`.

### 5. Run the Application

Start the Node.js server.

```bash
npm start
```

The server should now be running on `http://localhost:3000`.

---

## API Documentation

The API is structured into two main resources: `events` for core data management and `insights` for analytical queries.

### Events API (`/api/events`)

#### 1. Initiate Data Ingestion

Initiates the asynchronous ingestion of historical event data from a server-accessible text file.

* **Endpoint:** `POST /api/events/ingest`
* **Description:** Kicks off a background job to stream and process a file. Returns a `jobId` for status tracking.
* **Request Body:**
    ```json
    {
      "filePath": "/path/to/your/data/sample_historical_data.txt"
    }
    ```
* **Success Response (202 Accepted):**
    ```json
    {
      "status": "Ingestion initiated",
      "jobId": "ingest-job-...",
      "message": "Check /api/events/ingestion-status/ingest-job-... for updates."
    }
    ```
* **Example `curl`:**
    ```bash
    curl -X POST http://localhost:3000/api/events/ingest \
    -H "Content-Type: application/json" \
    -d '{"filePath": "sample_historical_data.txt"}'
    ```

#### 2. Get Ingestion Status

Retrieves the current status and progress of an ingestion job.

* **Endpoint:** `GET /api/events/ingestion-status/:jobId`
* **Description:** Poll this endpoint to get real-time updates on a running ingestion job.
* **Success Response (200 OK - COMPLETED):**
    ```json
    {
        "jobId": "ingest-job-...",
        "status": "COMPLETED",
        "processedLines": 13,
        "errorLines": 2,
        "totalLines": 15,
        "errors": [
            "Line 14: Failed to insert orphan event...",
            "Line 15: Invalid number of fields..."
        ],
        "startTime": "2025-08-31T15:30:00.000Z",
        "endTime": "2025-08-31T15:30:05.000Z"
    }
    ```
* **Example `curl`:**
    ```bash
    curl http://localhost:3000/api/events/ingestion-status/ingest-job-12345-abcde
    ```

#### 3. Get Event Timeline

Returns the entire hierarchical timeline (event and all its descendants) given a root event ID.

* **Endpoint:** `GET /api/events/timeline/:rootEventId`
* **Description:** Uses a recursive query to fetch a nested tree of events.
* **Success Response (200 OK):**
    ```json
    {
      "event_id": "a1b2c3d4-...",
      "event_name": "Founding of ArchaeoData",
      "children": [
        {
          "event_id": "f7e6d5c4-...",
          "event_name": "Phase 1 Research",
          "children": [ ... ]
        }
      ]
    }
    ```
* **Example `curl`:**
    ```bash
    curl http://localhost:3000/api/events/timeline/a1b2c3d4-e5f6-7890-1234-567890abcdef
    ```

#### 4. Search Events

Searches for events with filtering, sorting, and pagination.

* **Endpoint:** `GET /api/events/search`
* **Query Parameters:**
    * `name` (string, optional): Partial, case-insensitive match for event name.
    * `start_date_after` (ISO 8601, optional): Events starting after this date.
    * `end_date_before` (ISO 8601, optional): Events ending before this date.
    * `sortBy` (string, optional): Field to sort by (`start_date`, `event_name`). Defaults to `start_date`.
    * `sortOrder` (string, optional): `asc` or `desc`. Defaults to `asc`.
    * `page` (int, optional): Page number. Defaults to `1`.
    * `limit` (int, optional): Results per page. Defaults to `10`.
* **Success Response (200 OK):**
    ```json
    {
      "totalEvents": 5,
      "page": 1,
      "limit": 10,
      "events": [ ... ]
    }
    ```
* **Example `curl`:**
    ```bash
    curl "http://localhost:3000/api/events/search?name=phase&sortBy=start_date&sortOrder=desc"
    ```

### Insights API (`/api/insights`)

#### 1. Find Overlapping Events

Returns a list of all event pairs that have overlapping timeframes within a specified date range.

* **Endpoint:** `GET /api/insights/overlapping-events`
* **Query Parameters:**
    * `startDate` (ISO 8601, **required**)
    * `endDate` (ISO 8601, **required**)
* **Success Response (200 OK):**
    ```json
    [
      {
        "overlappingEventPairs": [
          { "event_id": "a1b2...", "event_name": "Founding of ArchaeoData", "..." },
          { "event_id": "f7e6...", "event_name": "Phase 1 Research", "..." }
        ],
        "overlap_duration_minutes": 30
      }
    ]
    ```
* **Example `curl`:**
    ```bash
    curl "http://localhost:3000/api/insights/overlapping-events?startDate=2023-01-01T00:00:00Z&endDate=2023-01-31T23:59:59Z"
    ```

#### 2. Find Largest Temporal Gap

Identifies the largest continuous gap in recorded events within a specified date range.

* **Endpoint:** `GET /api/insights/temporal-gaps`
* **Query Parameters:**
    * `startDate` (ISO 8601, **required**)
    * `endDate` (ISO 8601, **required**)
* **Success Response (200 OK):**
    ```json
    {
      "largestGap": {
        "durationMinutes": 6780,
        "startOfGap": "2023-01-10T16:00:00.000Z",
        "endOfGap": "2023-01-15T09:00:00.000Z",
        "precedingEvent": { "..." },
        "succeedingEvent": { "..." }
      },
      "message": "Largest temporal gap identified."
    }
    ```
* **Example `curl`:**
    ```bash
    curl "http://localhost:3000/api/insights/temporal-gaps?startDate=2023-01-01T00:00:00Z&endDate=2023-01-20T00:00:00Z"
    ```

#### 3. Find Event Influence Path

Calculates the shortest temporal path (minimum total duration) between a source and a target event.

* **Endpoint:** `GET /api/insights/event-influence`
* **Query Parameters:**
    * `sourceEventId` (UUID, **required**)
    * `targetEventId` (UUID, **required**)
* **Success Response (200 OK):**
    ```json
    {
      "sourceEventId": "d1e2...",
      "targetEventId": "c6d7...",
      "shortestPath": [
        { "event_id": "d1e2...", "event_name": "Project Gaia Initiation", "duration_minutes": 60 },
        { "..." }
      ],
      "totalDurationMinutes": 1680,
      "message": "Shortest temporal path found from source to target event."
    }
    ```
* **Example `curl`:**
    ```bash
    curl "http://localhost:3000/api/insights/event-influence?sourceEventId=d1e2f3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a&targetEventId=c6d7e8f9-a0b1-c2d3-e4f5-a6b7c8d9e0f1"
    ```

---

## Key Design Choices

* **Asynchronous Ingestion:** To handle potentially massive data files without blocking the server or consuming excessive memory, file processing is done via streams in a background job. The status is stored in the PostgreSQL database, making the process resilient to server restarts.
* **Hierarchical Data Management:** A self-referencing foreign key (`parent_event_id`) creates the event hierarchy. PostgreSQL's Recursive Common Table Expressions (CTEs) are used to efficiently fetch entire event trees in a single database query.
* **Scalable Architecture:** The codebase is organized by feature, with a clear separation of concerns between routes (API definition), controllers (handling HTTP requests/responses), and services (business logic). The `events` and `insights` modules are separated to maintain clarity as the application grows.
* **Efficient Algorithms:** For complex analytical queries, logic is handled in the application layer to avoid expensive database operations on large datasets. This includes an O(n log n) sweep-line algorithm for finding overlapping events and Dijkstra's algorithm for calculating the shortest path in the event influence graph.