import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

type SearchRequestPayload = {
  query?: string;
  locationBias?: string;
  radius?: number;
  maxResults?: number;
};

type GeocodeResult = {
  lat: number;
  lng: number;
};

type PlaceSummary = {
  place_id: string;
  name: string;
  formatted_address: string;
};

type PlaceDetails = {
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  opening_hours?: {
    open_now?: boolean;
  };
  business_status?: string;
};

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAX_RESULTS_CAP = 120;
const PAGE_DELAY_MS = 2000; // delay before requesting next page token

async function geocodeLocation(address: string): Promise<GeocodeResult | undefined> {
  const params = new URLSearchParams({
    address,
    key: GOOGLE_MAPS_API_KEY ?? ''
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to resolve location bias');
  }

  const data = await response.json();

  if (data.status !== 'OK' || !data.results?.length) {
    return undefined;
  }

  const [{ geometry }] = data.results;
  const location = geometry?.location;

  if (!location) {
    return undefined;
  }

  return { lat: location.lat, lng: location.lng };
}

async function fetchPlaces(
  query: string,
  location: GeocodeResult | undefined,
  radius: number | undefined,
  maxResults: number
): Promise<PlaceSummary[]> {
  let collected: PlaceSummary[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      query,
      key: GOOGLE_MAPS_API_KEY ?? ''
    });

    if (location) {
      params.set('location', `${location.lat},${location.lng}`);
    }

    if (location && radius) {
      params.set('radius', String(Math.min(Math.max(radius, 1), 50000)));
    }

    if (nextPageToken) {
      params.set('pagetoken', nextPageToken);
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
      {
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error('Failed to query Google Places search endpoint');
    }

    const data = await response.json();

    if (!['OK', 'ZERO_RESULTS'].includes(data.status)) {
      if (data.error_message) {
        throw new Error(data.error_message);
      }
      throw new Error(`Google Places API returned status: ${data.status}`);
    }

    const newResults = (data.results ?? []).map((place: any) => ({
      place_id: place.place_id as string,
      name: place.name as string,
      formatted_address: place.formatted_address as string
    }));

    collected = collected.concat(newResults).slice(0, maxResults);
    nextPageToken = data.next_page_token && collected.length < maxResults ? data.next_page_token : undefined;

    if (nextPageToken) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }
  } while (nextPageToken && collected.length < maxResults);

  return collected;
}

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | undefined> {
  const params = new URLSearchParams({
    place_id: placeId,
    key: GOOGLE_MAPS_API_KEY ?? '',
    fields:
      'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,geometry,opening_hours,business_status'
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch place details');
  }

  const data = await response.json();

  if (!['OK', 'ZERO_RESULTS', 'NOT_FOUND'].includes(data.status)) {
    if (data.error_message) {
      throw new Error(data.error_message);
    }
    throw new Error(`Place details lookup failed: ${data.status}`);
  }

  return data.result as PlaceDetails | undefined;
}

function buildWorkbook(records: Array<PlaceDetails & { place_id: string }>) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Businesses');

  worksheet.columns = [
    { header: 'Name', key: 'name', width: 35 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Address', key: 'address', width: 50 },
    { header: 'Latitude', key: 'lat', width: 15 },
    { header: 'Longitude', key: 'lng', width: 15 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Reviews', key: 'reviews', width: 10 },
    { header: 'Website', key: 'website', width: 40 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Open Now', key: 'open_now', width: 12 },
    { header: 'Types', key: 'types', width: 40 },
    { header: 'Place ID', key: 'place_id', width: 44 }
  ];

  worksheet.getRow(1).font = { bold: true };

  records.forEach((record) => {
    const phone = record.formatted_phone_number ?? record.international_phone_number ?? '';
    worksheet.addRow({
      name: record.name ?? '',
      phone,
      address: record.formatted_address ?? '',
      lat: record.geometry?.location?.lat ?? '',
      lng: record.geometry?.location?.lng ?? '',
      rating: record.rating ?? '',
      reviews: record.user_ratings_total ?? '',
      website: record.website ?? '',
      status: record.business_status ?? '',
      open_now: record.opening_hours?.open_now === undefined ? '' : record.opening_hours.open_now ? 'Yes' : 'No',
      types: record.types?.join(', ') ?? '',
      place_id: record.place_id
    });
  });

  return workbook;
}

export async function POST(request: Request) {
  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as SearchRequestPayload;
  const query = payload.query?.trim();
  const radius = payload.radius;
  const maxResults = Math.min(Math.max(payload.maxResults ?? 40, 1), MAX_RESULTS_CAP);

  if (!query) {
    return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
  }

  try {
    const location = payload.locationBias ? await geocodeLocation(payload.locationBias) : undefined;
    const places = await fetchPlaces(query, location, radius, maxResults);

    const detailedResults: Array<PlaceDetails & { place_id: string }> = [];

    for (const place of places) {
      try {
        const details = await fetchPlaceDetails(place.place_id);

        if (!details) {
          continue;
        }

        detailedResults.push({ ...details, place_id: place.place_id });
      } catch (detailError) {
        console.warn(`Failed to enrich place ${place.place_id}:`, detailError);
      }
    }

    const workbook = buildWorkbook(detailedResults);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `maps-extract-${Date.now()}.xlsx`;

    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'x-record-count': String(detailedResults.length),
        'x-filename': fileName
      }
    });

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to extract business data at this time.'
      },
      { status: 500 }
    );
  }
}
