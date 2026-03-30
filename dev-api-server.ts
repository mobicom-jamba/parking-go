import http from 'http';

// Import the same server-side handlers we use for Vercel.
import invoiceCreateHandler from './api/qpay/invoice/create';
import callbackHandler from './api/qpay/callback';
import paymentVerifyHandler from './api/qpay/payment/verify';

const PORT = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 3002);

function readRawBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createResponse(nodeRes: http.ServerResponse) {
  let statusCode = 200;

  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(obj: any) {
      const payload = JSON.stringify(obj);
      nodeRes.statusCode = statusCode;
      nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeRes.end(payload);
    },
  };
}

async function route(req: http.IncomingMessage, res: http.ServerResponse) {
  const nodeUrl = new URL(req.url ?? '', `http://localhost:${PORT}`);
  const path = nodeUrl.pathname;
  const method = (req.method ?? 'GET').toUpperCase();

  const contentType = String(req.headers['content-type'] ?? '');
  let parsedBody: any = {};
  let rawText = '';

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    rawText = await readRawBody(req);
    if (contentType.includes('application/json') && rawText.trim().length > 0) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = {};
      }
    }
  }

  const wrappedReq = {
    method,
    url: req.url ?? '',
    body: parsedBody,
    text: async () => rawText,
  } as any;

  const wrappedRes = createResponse(res) as any;

  try {
    // Match our API endpoints (same paths used by the frontend).
    if (method === 'POST' && path === '/api/qpay/invoice/create') {
      await invoiceCreateHandler(wrappedReq, wrappedRes);
      return;
    }
    if (method === 'POST' && path === '/api/qpay/payment/verify') {
      await paymentVerifyHandler(wrappedReq, wrappedRes);
      return;
    }
    if (path === '/api/qpay/callback') {
      // Callback can be GET or POST depending on qPay setup; handler reads query params.
      await callbackHandler(wrappedReq, wrappedRes);
      return;
    }

    wrappedRes.status(404).json({ error: 'Not found' });
  } catch (e: any) {
    wrappedRes.status(500).json({ error: e?.message ?? 'Internal server error' });
  }
}

const server = http.createServer((req, res) => {
  void route(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Local QPay API server listening on http://localhost:${PORT}`);
});

