# Google Maps Bike Directions

A Next.js app that provides bicycle directions in San Francisco using the Google Maps API. Users can enter an address or intersection for both the starting point and destination, and receive the best bicycle route displayed on a map and as a list of directions.

## Features
- Input for start and destination (address or intersection)
- Uses Google Maps Geocoding and Directions APIs
- Displays the route on a map
- Shows step-by-step directions

## Setup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Get a Google Maps API Key:**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the following APIs:
     - Maps JavaScript API
     - Geocoding API
     - Directions API
   - Create an API key and restrict it as needed

3. **Set up environment variables:**
   - Create a `.env.local` file in the project root:
     ```env
     NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
     ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000) to view the app.**

---

## License
MIT

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
