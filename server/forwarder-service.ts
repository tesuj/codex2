import nodemailer from 'nodemailer';
import {
  type ForwarderApiResponse,
  type ForwarderApiStatus,
  type RecipientDeliveryResult,
  type SubmissionPayload,
} from '../src/shared/submission.js';
import type {
  EmailRecipientConfig,
  ForwarderConfig,
  RecipientConfig,
  TelegramRecipientConfig,
} from './config.js';
import { buildForwardMessage } from './message.js';

type RuntimeEnv = NodeJS.ProcessEnv;

const getEnvValue = (env: RuntimeEnv, key: string) => env[key]?.trim() ?? '';

const parseBoolean = (value: string, fallbackValue: boolean) => {
  if (!value) {
    return fallbackValue;
  }

  return value.toLowerCase() === 'true';
};

const createEmailTransport = (env: RuntimeEnv) => {
  const host = getEnvValue(env, 'FORWARDER_SMTP_HOST');
  const portValue = getEnvValue(env, 'FORWARDER_SMTP_PORT');
  const user = getEnvValue(env, 'FORWARDER_SMTP_USER');
  const pass = getEnvValue(env, 'FORWARDER_SMTP_PASS');

  if (!host || !portValue || !user || !pass) {
    return {
      ok: false as const,
      message:
        'SMTP is not configured. Set FORWARDER_SMTP_HOST, FORWARDER_SMTP_PORT, FORWARDER_SMTP_USER, FORWARDER_SMTP_PASS.',
    };
  }

  const port = Number(portValue);

  if (!Number.isInteger(port) || port <= 0) {
    return {
      ok: false as const,
      message: 'FORWARDER_SMTP_PORT must be a positive integer.',
    };
  }

  const secure = parseBoolean(getEnvValue(env, 'FORWARDER_SMTP_SECURE'), port === 465);
  return {
    ok: true as const,
    transport: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    }),
    from: getEnvValue(env, 'FORWARDER_EMAIL_FROM') || user,
  };
};

const sendEmail = async (
  recipient: EmailRecipientConfig,
  payload: SubmissionPayload,
  env: RuntimeEnv,
): Promise<RecipientDeliveryResult> => {
  const transportResult = createEmailTransport(env);

  if (!transportResult.ok) {
    return {
      recipientId: recipient.id,
      channel: 'email',
      target: recipient.to,
      status: 'failed',
      message: transportResult.message,
    };
  }

  const message = buildForwardMessage(payload);
  const result = await transportResult.transport.sendMail({
    from: transportResult.from,
    to: recipient.to,
    subject: message.subject,
    text: message.text,
  });

  return {
    recipientId: recipient.id,
    channel: 'email',
    target: recipient.to,
    status: 'sent',
    message: result.response,
  };
};

const resolveTelegramChatId = (recipient: TelegramRecipientConfig, env: RuntimeEnv) => {
  if (recipient.chatId?.trim()) {
    return recipient.chatId.trim();
  }

  if (recipient.chatIdEnv?.trim()) {
    return getEnvValue(env, recipient.chatIdEnv);
  }

  return '';
};

const sendTelegram = async (
  recipient: TelegramRecipientConfig,
  payload: SubmissionPayload,
  env: RuntimeEnv,
): Promise<RecipientDeliveryResult> => {
  const botToken = getEnvValue(env, 'FORWARDER_TELEGRAM_BOT_TOKEN');
  const chatId = resolveTelegramChatId(recipient, env);

  if (!botToken) {
    return {
      recipientId: recipient.id,
      channel: 'telegram',
      target: recipient.chatIdEnv || recipient.chatId || 'telegram',
      status: 'failed',
      message: 'FORWARDER_TELEGRAM_BOT_TOKEN is not configured.',
    };
  }

  if (!chatId) {
    return {
      recipientId: recipient.id,
      channel: 'telegram',
      target: recipient.chatIdEnv || 'telegram',
      status: 'failed',
      message: 'Telegram chatId is not configured for this recipient.',
    };
  }

  const message = buildForwardMessage(payload);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${message.subject}\n\n${message.text}`,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();

    return {
      recipientId: recipient.id,
      channel: 'telegram',
      target: chatId,
      status: 'failed',
      message: responseText || `Telegram API responded with ${response.status}.`,
    };
  }

  return {
    recipientId: recipient.id,
    channel: 'telegram',
    target: chatId,
    status: 'sent',
    message: 'Telegram message sent.',
  };
};

const sendToRecipient = async (
  recipient: RecipientConfig,
  payload: SubmissionPayload,
  env: RuntimeEnv,
): Promise<RecipientDeliveryResult> => {
  if (recipient.enabled === false) {
    return {
      recipientId: recipient.id,
      channel: recipient.type,
      target: recipient.type === 'email' ? recipient.to : recipient.chatIdEnv || recipient.chatId || '',
      status: 'skipped',
      message: 'Recipient is disabled in config.',
    };
  }

  if (recipient.type === 'email') {
    return sendEmail(recipient, payload, env);
  }

  return sendTelegram(recipient, payload, env);
};

const deriveStatus = (results: RecipientDeliveryResult[]): ForwarderApiStatus => {
  const sentCount = results.filter((result) => result.status === 'sent').length;

  if (sentCount === 0) {
    return 'failed';
  }

  if (sentCount === results.length) {
    return 'success';
  }

  return 'partial_success';
};

const buildStatusMessage = (status: ForwarderApiStatus, results: RecipientDeliveryResult[]) => {
  const sentCount = results.filter((result) => result.status === 'sent').length;
  const failedCount = results.filter((result) => result.status === 'failed').length;
  const skippedCount = results.filter((result) => result.status === 'skipped').length;

  if (status === 'success') {
    return `Successfully forwarded to ${sentCount} recipient(s).`;
  }

  if (status === 'partial_success') {
    return `Forwarded to ${sentCount} recipient(s); ${failedCount} failed, ${skippedCount} skipped.`;
  }

  return `No recipient accepted the message. ${failedCount} failed, ${skippedCount} skipped.`;
};

export const forwardSubmission = async (
  payload: SubmissionPayload,
  config: ForwarderConfig,
  env: RuntimeEnv = process.env,
): Promise<ForwarderApiResponse> => {
  const results = await Promise.all(
    config.recipients.map(async (recipient) => {
      try {
        return await sendToRecipient(recipient, payload, env);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unexpected forwarder error.';

        return {
          recipientId: recipient.id,
          channel: recipient.type,
          target:
            recipient.type === 'email'
              ? recipient.to
              : recipient.chatIdEnv || recipient.chatId || 'telegram',
          status: 'failed' as const,
          message: errorMessage,
        };
      }
    }),
  );

  const status = deriveStatus(results);

  return {
    status,
    submissionId: payload.submissionId,
    message: buildStatusMessage(status, results),
    results,
  };
};
