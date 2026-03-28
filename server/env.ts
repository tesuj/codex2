import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.forwarder', '.env.forwarder.local'];

const stripQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

export const loadLocalEnv = (rootDir: string) => {
  for (const fileName of ENV_FILE_NAMES) {
    const filePath = resolve(rootDir, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const fileContent = readFileSync(filePath, 'utf8');
    const lines = fileContent.split(/\r?\n/u);

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const delimiterIndex = trimmed.indexOf('=');

      if (delimiterIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, delimiterIndex).trim();
      const rawValue = trimmed.slice(delimiterIndex + 1).trim();

      process.env[key] = stripQuotes(rawValue);
    }
  }
};
