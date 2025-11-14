'use client';

import { FormEvent, useMemo, useState } from 'react';

type Status =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; count: number }
  | { state: 'error'; message: string };

const DEFAULT_MAX_RESULTS = 40;

export default function Home() {
  const [query, setQuery] = useState('restaurants in New York');
  const [locationBias, setLocationBias] = useState('');
  const [radius, setRadius] = useState('5000');
  const [maxResults, setMaxResults] = useState(String(DEFAULT_MAX_RESULTS));
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const isLoading = status.state === 'loading';

  const formattedStatus = useMemo(() => {
    switch (status.state) {
      case 'loading':
        return { text: 'Extracting business data…', className: 'status' };
      case 'success':
        return {
          text: `Successfully collected ${status.count} records. Download ready below.`,
          className: 'status'
        };
      case 'error':
        return { text: status.message, className: 'status error' };
      default:
        return null;
    }
  }, [status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ state: 'loading' });
    setDownloadUrl(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          locationBias: locationBias || undefined,
          radius: radius ? Number(radius) : undefined,
          maxResults: maxResults ? Number(maxResults) : DEFAULT_MAX_RESULTS
        })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? 'Unknown error');
      }

      const recordCount = Number(response.headers.get('x-record-count') ?? '0');
      const resolvedFileName = response.headers.get('x-filename') ?? 'google-maps-data.xlsx';
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      setDownloadUrl(objectUrl);
      setFileName(resolvedFileName);
      setStatus({ state: 'success', count: recordCount });
    } catch (error) {
      setStatus({
        state: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to extract business information. Please try again.'
      });
    }
  };

  return (
    <main>
      <h1>Google Maps Business Extractor</h1>
      <p>
        Provide a Google Maps style search query and optionally bias results around a location.
        The extractor will pull business name, phone number, address, coordinates, rating, and
        more, returning an Excel file ready for outreach.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="fields-grid">
          <label>
            Search Query
            <input
              required
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. plumbers in Chicago"
            />
          </label>

          <label>
            Location Bias (optional)
            <input
              value={locationBias}
              onChange={(event) => setLocationBias(event.target.value)}
              placeholder="City, ZIP code, or coordinates"
            />
          </label>

          <label>
            Radius in meters (optional)
            <input
              type="number"
              min={100}
              step={100}
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
              placeholder="5000"
            />
          </label>

          <label>
            Max Results (up to 120)
            <input
              type="number"
              min={1}
              max={120}
              value={maxResults}
              onChange={(event) => setMaxResults(event.target.value)}
              placeholder={String(DEFAULT_MAX_RESULTS)}
              required
            />
          </label>
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Extracting…' : 'Extract Businesses'}
        </button>
      </form>

      {formattedStatus && <div className={formattedStatus.className}>{formattedStatus.text}</div>}

      {downloadUrl && (
        <a
          className="download-link"
          href={downloadUrl}
          download={fileName || 'google-maps-businesses.xlsx'}
        >
          Download Excel
        </a>
      )}
    </main>
  );
}
