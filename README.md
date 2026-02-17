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

## Streaming Pipeline Notes

- Source URL normalization now auto-unwraps known wrappers like `video-seed.dev/?url=...` before proxying or transcoding.
- Non-media sources are rejected with `422` JSON responses:
  - `{"code":"SOURCE_NOT_MEDIA","message":"...","sourceUrl":"...","normalizedUrl":"..."}`
- `GET /api/stream` now preserves upstream MIME type and supports requests with or without `Range`.
- `GET /api/transcode` now has:
  - Input preflight validation
  - Request-scoped FFmpeg cleanup on abort/close/error
  - Optional concurrency cap via `MAX_ACTIVE_TRANSCODES` (default `4`)

## Production Deployment Warning

Long-lived FFmpeg transcoding streams are generally not a good fit for Vercel Serverless/Edge function limits. For production, run transcoding on dedicated compute (container/VM/worker service) and keep Next.js API routes as control/proxy endpoints.
