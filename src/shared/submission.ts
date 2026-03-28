export type MonthKey =
  | 'january'
  | 'february'
  | 'march'
  | 'april'
  | 'may'
  | 'june'
  | 'july'
  | 'august'
  | 'september'
  | 'october'
  | 'november'
  | 'december';

export type MonthlyConsumption = Record<MonthKey, string>;

export type SubmissionAnswers = {
  tariff: string;
  ownership: string;
  roofMaterial: string;
  locality: string;
  googleMapsLink: string;
  connectionPower: string;
  averageDayLoad: string;
  monthlyConsumption: MonthlyConsumption;
};

export type SubmissionPayload = {
  submissionId: string;
  submittedAt: string;
  sourceApp: 'pvgis-questionnaire';
  schemaVersion: 1;
  answers: SubmissionAnswers;
};

export type RecipientChannel = 'email' | 'telegram';

export type RecipientResultStatus = 'sent' | 'failed' | 'skipped';

export type RecipientDeliveryResult = {
  recipientId: string;
  channel: RecipientChannel;
  target: string;
  status: RecipientResultStatus;
  message: string;
};

export type ForwarderApiStatus = 'success' | 'partial_success' | 'failed';

export type ForwarderApiResponse = {
  status: ForwarderApiStatus;
  submissionId: string;
  message: string;
  results: RecipientDeliveryResult[];
};

export const MONTH_DEFINITIONS: Array<{ key: MonthKey; label: string }> = [
  { key: 'january', label: 'Січень' },
  { key: 'february', label: 'Лютий' },
  { key: 'march', label: 'Березень' },
  { key: 'april', label: 'Квітень' },
  { key: 'may', label: 'Травень' },
  { key: 'june', label: 'Червень' },
  { key: 'july', label: 'Липень' },
  { key: 'august', label: 'Серпень' },
  { key: 'september', label: 'Вересень' },
  { key: 'october', label: 'Жовтень' },
  { key: 'november', label: 'Листопад' },
  { key: 'december', label: 'Грудень' },
];

const SINGLE_ANSWER_KEYS: Array<keyof Omit<SubmissionAnswers, 'monthlyConsumption'>> = [
  'tariff',
  'ownership',
  'roofMaterial',
  'locality',
  'googleMapsLink',
  'connectionPower',
  'averageDayLoad',
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const validateSubmissionPayload = (
  value: unknown,
):
  | { ok: true; payload: SubmissionPayload; errors: [] }
  | { ok: false; payload: null; errors: string[] } => {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return {
      ok: false,
      payload: null,
      errors: ['Body must be a JSON object.'],
    };
  }

  if (typeof value.submissionId !== 'string' || !value.submissionId.trim()) {
    errors.push('submissionId must be a non-empty string.');
  }

  if (typeof value.submittedAt !== 'string' || !value.submittedAt.trim()) {
    errors.push('submittedAt must be a non-empty string.');
  }

  if (value.sourceApp !== 'pvgis-questionnaire') {
    errors.push('sourceApp must be "pvgis-questionnaire".');
  }

  if (value.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1.');
  }

  if (!isPlainObject(value.answers)) {
    errors.push('answers must be an object.');
  } else {
    for (const key of SINGLE_ANSWER_KEYS) {
      const fieldValue = value.answers[key];

      if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
        errors.push(`answers.${key} must be a non-empty string.`);
      }
    }

    if (!isPlainObject(value.answers.monthlyConsumption)) {
      errors.push('answers.monthlyConsumption must be an object.');
    } else {
      for (const month of MONTH_DEFINITIONS) {
        const monthValue = value.answers.monthlyConsumption[month.key];

        if (typeof monthValue !== 'string' || !monthValue.trim()) {
          errors.push(`answers.monthlyConsumption.${month.key} must be a non-empty string.`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      payload: null,
      errors,
    };
  }

  return {
    ok: true,
    payload: value as SubmissionPayload,
    errors: [],
  };
};
