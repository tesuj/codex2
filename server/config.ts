import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type EmailRecipientConfig = {
  id: string;
  type: 'email';
  to: string;
  enabled?: boolean;
};

export type TelegramRecipientConfig = {
  id: string;
  type: 'telegram';
  chatId?: string;
  chatIdEnv?: string;
  enabled?: boolean;
};

export type RecipientConfig = EmailRecipientConfig | TelegramRecipientConfig;

export type ForwarderConfig = {
  recipients: RecipientConfig[];
};

export const DEFAULT_CONFIG_PATH = 'solar-data-forwarder.config.json';

export const DEFAULT_FORWARDER_CONFIG: ForwarderConfig = {
  recipients: [
    {
      id: 'email-onboarding',
      type: 'email',
      to: 'onboarding@winder.ua',
      enabled: true,
    },
    {
      id: 'telegram-default',
      type: 'telegram',
      chatIdEnv: 'FORWARDER_TELEGRAM_CHAT_ID',
      enabled: true,
    },
  ],
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRecipientConfig = (value: unknown): value is RecipientConfig => {
  if (!isPlainObject(value) || typeof value.id !== 'string' || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'email') {
    return typeof value.to === 'string';
  }

  if (value.type === 'telegram') {
    return typeof value.chatId === 'string' || typeof value.chatIdEnv === 'string';
  }

  return false;
};

export const loadForwarderConfig = (
  rootDir: string,
  explicitConfigPath = process.env.FORWARDER_CONFIG_PATH,
): { config: ForwarderConfig; configPath: string } => {
  const configPath = resolve(rootDir, explicitConfigPath?.trim() || DEFAULT_CONFIG_PATH);

  if (!existsSync(configPath)) {
    return {
      config: DEFAULT_FORWARDER_CONFIG,
      configPath,
    };
  }

  const fileContent = readFileSync(configPath, 'utf8');
  const parsedValue = JSON.parse(fileContent) as unknown;

  if (!isPlainObject(parsedValue) || !Array.isArray(parsedValue.recipients)) {
    throw new Error(`Invalid forwarder config in ${configPath}. Expected { "recipients": [] }.`);
  }

  const recipients = parsedValue.recipients.filter(isRecipientConfig);

  if (recipients.length !== parsedValue.recipients.length) {
    throw new Error(`Invalid recipient entries found in ${configPath}.`);
  }

  return {
    config: { recipients },
    configPath,
  };
};
