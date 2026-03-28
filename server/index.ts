import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { loadForwarderConfig } from './config.js';
import { loadLocalEnv } from './env.js';
import { forwardSubmission } from './forwarder-service.js';
import {
  type ForwarderApiResponse,
  validateSubmissionPayload,
} from '../src/shared/submission.js';

const rootDir = process.cwd();

loadLocalEnv(rootDir);

const port = Number(process.env.FORWARDER_PORT ?? '8787');
const host = process.env.FORWARDER_HOST?.trim() || '127.0.0.1';

const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown) => {
  const prefix = `[solar-data-forwarder] [${new Date().toISOString()}] [${level}]`;

  if (typeof meta === 'undefined') {
    console.log(`${prefix} ${message}`);
    return;
  }

  console.log(`${prefix} ${message}`, meta);
};

const isAllowedOrigin = (origin: string) => {
  if (!origin) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const isLocalHost =
      parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1';

    return isLocalHost;
  } catch {
    return false;
  }
};

const applyCors = (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
  const origin = request.headers.origin;

  if (typeof origin === 'string' && isAllowedOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }

  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Source-App');
};

const writeJson = (
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  body: Record<string, unknown>,
) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
};

const readJsonBody = async (
  request: IncomingMessage,
): Promise<unknown> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();

  if (!rawBody) {
    throw new Error('Request body is empty.');
  }

  return JSON.parse(rawBody) as unknown;
};

const toHttpStatus = (result: ForwarderApiResponse) => {
  if (result.status === 'success') {
    return 200;
  }

  if (result.status === 'partial_success') {
    return 207;
  }

  return 502;
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  applyCors(request, response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, {
      status: 'ok',
      service: 'solar-data-forwarder',
    });
    return;
  }

  if (request.method !== 'POST' || url.pathname !== '/api/intake/pvgis') {
    writeJson(response, 404, {
      status: 'not_found',
      message: 'Use POST /api/intake/pvgis',
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const validationResult = validateSubmissionPayload(body);

    if (!validationResult.ok) {
      log('WARN', 'Rejected invalid payload.', validationResult.errors);
      writeJson(response, 400, {
        status: 'invalid_payload',
        message: 'Request body does not match the expected PVGIS payload.',
        errors: validationResult.errors,
      });
      return;
    }

    const { config, configPath } = loadForwarderConfig(rootDir);
    log('INFO', `Accepted submission ${validationResult.payload.submissionId}.`, {
      sourceApp: validationResult.payload.sourceApp,
      recipients: config.recipients.length,
      configPath,
    });

    const result = await forwardSubmission(validationResult.payload, config);
    log(
      result.status === 'failed' ? 'ERROR' : result.status === 'partial_success' ? 'WARN' : 'INFO',
      `Forwarding finished for ${validationResult.payload.submissionId} with status ${result.status}.`,
      result.results,
    );

    writeJson(response, toHttpStatus(result), result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    log('ERROR', 'Unhandled request error.', message);
    writeJson(response, 500, {
      status: 'error',
      message,
    });
  }
});

server.listen(port, host, () => {
  log('INFO', `Listening on http://${host}:${port}`);
});
