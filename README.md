# Google Maps Business Extractor

This is a Next.js web application that turns Google Maps search queries into an Excel workbook containing enriched business information: company name, phone number, address, coordinates, website, ratings, and more.

## Requirements

- Node.js 18+ and npm
- A Google Maps Places API key with access to Geocoding and Place Details

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file based on `.env.example` and add your Maps API key:
   ```
   GOOGLE_MAPS_API_KEY=your-key
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` and submit a search query (e.g. `restaurants in New York`).

## Available Scripts

- `npm run dev` – start the Next.js development server
- `npm run build` – build the production bundle
- `npm start` – run the production server
- `npm run lint` – lint the project with ESLint

## Data Extraction Details

1. The API route calls Google Places Text Search, paging through up to 120 results.
2. Each `place_id` is enriched with a Place Details lookup to retrieve contact information.
3. Results are streamed into an Excel workbook generated with `exceljs`.
4. The workbook is returned as a downloadable `.xlsx` file to the browser.

## Deployment

This project is optimized for Vercel. Set `GOOGLE_MAPS_API_KEY` in the project environment variables and run:
```bash
npm run build
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-a6d1eef2
```

## Notes

- Respect Google Maps Platform usage limits and billing requirements.
- Phone numbers and websites are returned only when available in Google’s data.
- Consider adding persistence or caching if you plan to run large batch jobs.
