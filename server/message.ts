import { MONTH_DEFINITIONS, type SubmissionPayload } from '../src/shared/submission.js';

export type ForwardMessage = {
  subject: string;
  text: string;
};

const formatSummaryLine = (label: string, value: string) => `${label}: ${value}`;

const getTotalConsumption = (payload: SubmissionPayload) =>
  MONTH_DEFINITIONS.reduce((total, month) => {
    const normalizedValue = payload.answers.monthlyConsumption[month.key].replace(',', '.').trim();
    const parsedValue = Number(normalizedValue);

    return Number.isFinite(parsedValue) ? total + parsedValue : total;
  }, 0);

export const buildForwardMessage = (payload: SubmissionPayload): ForwardMessage => {
  const totalConsumption = getTotalConsumption(payload);
  const monthLines = MONTH_DEFINITIONS.map((month) =>
    formatSummaryLine(month.label, payload.answers.monthlyConsumption[month.key]),
  );

  const summaryLines = [
    formatSummaryLine('Submission ID', payload.submissionId),
    formatSummaryLine('Submitted At', payload.submittedAt),
    formatSummaryLine('Source App', payload.sourceApp),
    formatSummaryLine('Schema Version', String(payload.schemaVersion)),
    '',
    formatSummaryLine('Тариф', payload.answers.tariff),
    formatSummaryLine('Статус будівлі', payload.answers.ownership),
    formatSummaryLine('Матеріал даху', payload.answers.roofMaterial),
    formatSummaryLine('Населений пункт', payload.answers.locality),
    formatSummaryLine('Google Maps', payload.answers.googleMapsLink),
    formatSummaryLine('Потужність приєднання, кВт', payload.answers.connectionPower),
    formatSummaryLine('Середнє навантаження в день, кВт', payload.answers.averageDayLoad),
    formatSummaryLine('Сумарне місячне споживання, кВт*год', totalConsumption.toFixed(2)),
    '',
    'Споживання по місяцях:',
    ...monthLines,
  ];

  return {
    subject: `[PVGIS] Нова анкета ${payload.answers.locality} (${payload.submissionId})`,
    text: summaryLines.join('\n'),
  };
};
