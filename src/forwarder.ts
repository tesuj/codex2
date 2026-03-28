import type { ForwarderApiResponse, SubmissionPayload } from './shared/submission';

type FormData = SubmissionPayload['answers'];

export type SubmissionResult = {
  status: 'idle' | 'submitting' | 'success' | 'queued';
  message: string;
};

const FORWARDER_ENDPOINT = import.meta.env.VITE_FORWARDER_ENDPOINT?.trim() ?? '';
const PENDING_QUEUE_KEY = 'solar-data-forwarder.pending-submissions';

export const isForwarderConfigured = Boolean(FORWARDER_ENDPOINT);

const readForwarderApiResponse = async (
  response: Response,
): Promise<ForwarderApiResponse | null> => {
  try {
    const parsedValue = (await response.json()) as ForwarderApiResponse;

    if (
      parsedValue &&
      typeof parsedValue === 'object' &&
      typeof parsedValue.message === 'string' &&
      typeof parsedValue.status === 'string' &&
      Array.isArray(parsedValue.results)
    ) {
      return parsedValue;
    }
  } catch {
    return null;
  }

  return null;
};

const createSubmissionId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `submission-${Date.now()}`;
};

const readPendingQueue = (): SubmissionPayload[] => {
  try {
    const rawValue = window.localStorage.getItem(PENDING_QUEUE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as SubmissionPayload[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};

const writePendingQueue = (queue: SubmissionPayload[]) => {
  window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
};

const enqueueSubmission = (payload: SubmissionPayload) => {
  const queue = readPendingQueue();
  writePendingQueue([...queue, payload]);
};

export const buildSubmissionPayload = (formData: FormData): SubmissionPayload => ({
  submissionId: createSubmissionId(),
  submittedAt: new Date().toISOString(),
  sourceApp: 'pvgis-questionnaire',
  schemaVersion: 1,
  answers: formData,
});

export const submitToForwarder = async (
  payload: SubmissionPayload,
): Promise<SubmissionResult> => {
  if (!FORWARDER_ENDPOINT) {
    enqueueSubmission(payload);

    return {
      status: 'queued',
      message:
        'solar-data-forwarder ще не підключений. Дані збережено локально в черзі відправки.',
    };
  }

  try {
    const response = await fetch(FORWARDER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-App': 'pvgis-questionnaire',
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await readForwarderApiResponse(response);

    if (!response.ok) {
      throw new Error(responseBody?.message || `Forwarder responded with ${response.status}`);
    }

    return {
      status: 'success',
      message: responseBody?.message || 'Дані відправлено на розгляд.',
    };
  } catch {
    enqueueSubmission(payload);

    return {
      status: 'queued',
      message:
        'Не вдалося зв’язатися з solar-data-forwarder. Дані збережено локально в черзі відправки.',
    };
  }
};
