CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the historical_events table
CREATE TABLE historical_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER,
    parent_event_id UUID,
    metadata JSONB,
    CONSTRAINT fk_parent_event
        FOREIGN KEY(parent_event_id)
        REFERENCES historical_events(event_id)
        ON DELETE SET NULL
);

-- Create indexes for better query performance on date fields
CREATE INDEX idx_start_date ON historical_events(start_date);
CREATE INDEX idx_end_date ON historical_events(end_date);

-- NEW: Create the ingestion_jobs table to store job status
CREATE TABLE ingestion_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    file_path TEXT NOT NULL,
    total_lines INTEGER DEFAULT 0,
    processed_lines INTEGER DEFAULT 0,
    error_lines INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ
);

CREATE TABLE staging_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER,
    parent_event_id UUID,
    metadata JSONB
);