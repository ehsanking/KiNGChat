import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_API_DOCS !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const html = `<!doctype html>
<html>
  <head><title>Elahe API Docs</title></head>
  <body>
    <redoc spec-url="/api/docs/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
