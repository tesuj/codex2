# PVGIS Questionnaire

Локальное веб-приложение на `React + TypeScript + Vite` и простой локальный сервер `solar-data-forwarder`.

## Установка

```bash
npm install
```

## Запуск в режиме разработки

```bash
npm run dev
```

По умолчанию Vite поднимает локальный сервер на `http://localhost:5173`.

## Подготовка интеграции с solar-data-forwarder

Для фронтенда создайте файл `.env.local` и укажите endpoint:

```bash
VITE_FORWARDER_ENDPOINT=http://localhost:8787/api/intake/pvgis
```

Для локального сервера скопируйте `.env.forwarder.example` в `.env.forwarder.local` и заполните SMTP/Telegram переменные.

После этого кнопка `Відправити на розгляд` будет отправлять `POST` с JSON.
Если endpoint не настроен или временно недоступен, приложение сохраняет отправку локально в `localStorage` как очередь ожидания.

## Запуск local forwarder

```bash
npm run forwarder:start
```

По умолчанию сервер поднимается на `http://127.0.0.1:8787`.

Доступные endpoint'ы:

- `GET /health`
- `POST /api/intake/pvgis`

Конфиг получателей лежит в `solar-data-forwarder.config.json`. Чтобы добавить еще одного получателя, достаточно добавить новую запись в массив `recipients`, не меняя `server/index.ts`.

Пример:

```json
{
  "id": "email-sales",
  "type": "email",
  "to": "sales@example.com",
  "enabled": true
}
```

## Сборка

```bash
npm run build
```

## Структура

- `src/App.tsx` - пошаговая форма, месячные поля, экран проверки и отправки
- `src/forwarder.ts` - клиент для отправки данных в `solar-data-forwarder`
- `src/shared/submission.ts` - общая схема payload и ответа API
- `server/index.ts` - локальный HTTP API для приема и пересылки данных
- `server/forwarder-service.ts` - независимая отправка по получателям
- `server/message.ts` - formatter сообщения для email и Telegram
- `server/config.ts` - загрузка recipient-конфига
- `src/styles.css` - адаптивные стили интерфейса
- `src/main.tsx` - точка входа приложения

## Формат отправки

Приложение отправляет JSON вида:

```json
{
  "submissionId": "uuid-or-timestamp",
  "submittedAt": "2026-03-27T12:00:00.000Z",
  "sourceApp": "pvgis-questionnaire",
  "schemaVersion": 1,
  "answers": {
    "tariff": "6.45",
    "ownership": "У власності",
    "roofMaterial": "Профнастил",
    "locality": "Львів",
    "googleMapsLink": "https://maps.google.com/...",
    "connectionPower": "150",
    "averageDayLoad": "98",
    "monthlyConsumption": {
      "january": "1000"
    }
  }
}
```

## Пример ответа API

```json
{
  "status": "partial_success",
  "submissionId": "f2bff1d2-4cc8-4c0b-8e44-8de5c2d8b9d8",
  "message": "Forwarded to 1 recipient(s); 1 failed, 0 skipped.",
  "results": [
    {
      "recipientId": "email-onboarding",
      "channel": "email",
      "target": "onboarding@winder.ua",
      "status": "sent",
      "message": "250 2.0.0 Ok: queued"
    },
    {
      "recipientId": "telegram-default",
      "channel": "telegram",
      "target": "123456789",
      "status": "failed",
      "message": "Telegram API responded with 401."
    }
  ]
}
```
