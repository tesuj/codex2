import type { HTMLAttributes } from 'react';
import { useMemo, useState } from 'react';
import {
  buildSubmissionPayload,
  isForwarderConfigured,
  submitToForwarder,
  type SubmissionResult,
} from './forwarder';
import {
  MONTH_DEFINITIONS,
  type MonthKey,
  type MonthlyConsumption,
  type SubmissionAnswers,
} from './shared/submission';

type FormData = SubmissionAnswers;

type FieldType = 'text' | 'number' | 'url' | 'radio';

type SingleStepConfig = {
  kind: 'single';
  key: Exclude<keyof FormData, 'monthlyConsumption'>;
  label: string;
  type: FieldType;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  options?: string[];
};

type MonthlyStepConfig = {
  kind: 'monthly';
  key: 'monthlyConsumption';
  label: string;
  description: string;
};

type StepConfig = SingleStepConfig | MonthlyStepConfig;

const initialMonthlyConsumption = MONTH_DEFINITIONS.reduce(
  (accumulator, month) => ({
    ...accumulator,
    [month.key]: '',
  }),
  {} as MonthlyConsumption,
);

const initialFormData: FormData = {
  tariff: '',
  ownership: '',
  roofMaterial: '',
  locality: '',
  googleMapsLink: '',
  connectionPower: '',
  averageDayLoad: '',
  monthlyConsumption: initialMonthlyConsumption,
};

const steps: StepConfig[] = [
  {
    kind: 'single',
    key: 'tariff',
    label:
      'Поточний тариф на покупку електричної енергії з врахуванням транспортування та ПДВ (грн за 1 кВт*год)',
    type: 'number',
    placeholder: 'Наприклад: 6.45',
    inputMode: 'decimal',
  },
  {
    kind: 'single',
    key: 'ownership',
    label: 'Будівля у власності, чи в оренді?',
    type: 'radio',
    options: ['У власності', 'В оренді'],
  },
  {
    kind: 'single',
    key: 'roofMaterial',
    label: 'Матеріал даху',
    type: 'text',
    placeholder: 'Наприклад: профнастил',
  },
  {
    kind: 'single',
    key: 'locality',
    label: 'Населений пункт',
    type: 'text',
    placeholder: 'Наприклад: Львів',
  },
  {
    kind: 'single',
    key: 'googleMapsLink',
    label: 'Місцезнаходження будівлі (лінк на Google Maps)',
    type: 'url',
    placeholder: 'https://maps.google.com/...',
  },
  {
    kind: 'single',
    key: 'connectionPower',
    label: 'Потужність приєднання (кВт)',
    type: 'number',
    placeholder: 'Наприклад: 150',
    inputMode: 'numeric',
  },
  {
    kind: 'single',
    key: 'averageDayLoad',
    label: 'Середнє навантаження в день (кВт)',
    type: 'number',
    placeholder: 'Наприклад: 98',
    inputMode: 'numeric',
  },
  {
    kind: 'monthly',
    key: 'monthlyConsumption',
    label: 'Обсяг споживання електроенергії за кожен місяць (кВт*год)',
    description:
      'Заповніть усі 12 місяців. Для кожного місяця введіть числове значення споживання.',
  },
];

const TOTAL_STEPS = steps.length;

const isNumeric = (value: string) => {
  const normalized = value.replace(',', '.').trim();
  return normalized !== '' && !Number.isNaN(Number(normalized));
};

const isLikelyUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

function App() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [currentStep, setCurrentStep] = useState(0);
  const [isReviewScreen, setIsReviewScreen] = useState(false);
  const [error, setError] = useState('');
  const [submissionState, setSubmissionState] = useState<SubmissionResult>({
    status: 'idle',
    message: '',
  });

  const currentStepConfig = steps[currentStep];

  const summaryRows = useMemo(
    () =>
      steps
        .filter((step): step is SingleStepConfig => step.kind === 'single')
        .map((step) => ({
          question: step.label,
          answer: formData[step.key],
        })),
    [formData],
  );

  const monthlyRows = useMemo(
    () =>
      MONTH_DEFINITIONS.map((month) => ({
        month: month.label,
        value: formData.monthlyConsumption[month.key],
      })),
    [formData.monthlyConsumption],
  );

  const resetFeedback = () => {
    if (error) {
      setError('');
    }

    if (submissionState.status !== 'idle' || submissionState.message) {
      setSubmissionState({
        status: 'idle',
        message: '',
      });
    }
  };

  const updateField = (
    key: Exclude<keyof FormData, 'monthlyConsumption'>,
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
    resetFeedback();
  };

  const updateMonthlyField = (key: MonthKey, value: string) => {
    setFormData((prev) => ({
      ...prev,
      monthlyConsumption: {
        ...prev.monthlyConsumption,
        [key]: value,
      },
    }));
    resetFeedback();
  };

  const validateStep = (step: StepConfig) => {
    if (step.kind === 'monthly') {
      for (const month of MONTH_DEFINITIONS) {
        const value = formData.monthlyConsumption[month.key].trim();

        if (!value) {
          return `Заповніть поле для місяця "${month.label}".`;
        }

        if (!isNumeric(value)) {
          return `Для місяця "${month.label}" введіть числове значення.`;
        }
      }

      return '';
    }

    const value = formData[step.key].trim();

    if (!value) {
      return 'Поле не може бути порожнім.';
    }

    if (step.type === 'number' && !isNumeric(value)) {
      return 'Введіть коректне числове значення.';
    }

    if (step.type === 'url' && !isLikelyUrl(value)) {
      return 'Введіть коректне посилання.';
    }

    return '';
  };

  const handleNext = () => {
    const validationError = validateStep(currentStepConfig);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setError('');

    if (isReviewScreen) {
      setSubmissionState({
        status: 'idle',
        message: '',
      });
      setIsReviewScreen(false);
      setCurrentStep(TOTAL_STEPS - 1);
      return;
    }

    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleOpenReview = () => {
    const validationError = validateStep(currentStepConfig);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSubmissionState({
      status: 'idle',
      message: '',
    });
    setIsReviewScreen(true);
  };

  const handleRestart = () => {
    setFormData(initialFormData);
    setCurrentStep(0);
    setIsReviewScreen(false);
    setError('');
    setSubmissionState({
      status: 'idle',
      message: '',
    });
  };

  const handleForward = async () => {
    setSubmissionState({
      status: 'submitting',
      message: 'Надсилання даних...',
    });

    const payload = buildSubmissionPayload(formData);
    const result = await submitToForwarder(payload);
    setSubmissionState(result);
  };

  const renderSingleField = (step: SingleStepConfig) => {
    const value = formData[step.key];

    if (step.type === 'radio' && step.options) {
      return (
        <div className="radioGroup">
          {step.options.map((option) => (
            <label className="radioCard" key={option}>
              <input
                checked={value === option}
                name={step.key}
                onChange={(event) => updateField(step.key, event.target.value)}
                type="radio"
                value={option}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }

    return (
      <input
        autoFocus
        className="textInput"
        inputMode={step.inputMode}
        onChange={(event) => updateField(step.key, event.target.value)}
        placeholder={step.placeholder}
        type={step.type === 'number' ? 'text' : step.type}
        value={value}
      />
    );
  };

  const renderMonthlyFields = () => (
    <div className="monthGrid">
      {MONTH_DEFINITIONS.map((month) => (
        <label className="monthField" key={month.key}>
          <span>{month.label}</span>
          <input
            className="textInput monthInput"
            inputMode="decimal"
            onChange={(event) => updateMonthlyField(month.key, event.target.value)}
            placeholder="0"
            type="text"
            value={formData.monthlyConsumption[month.key]}
          />
        </label>
      ))}
    </div>
  );

  const primaryButtonLabel =
    submissionState.status === 'submitting'
      ? 'Надсилання...'
      : submissionState.status === 'success'
        ? 'Надіслано'
        : submissionState.status === 'queued'
          ? 'Надіслати повторно'
          : 'Відправити на розгляд';

  return (
    <main className="pageShell">
      <section className="card">
        <div className="cardGlow" />

        {!isReviewScreen ? (
          <>
            <header className="stepHeader">
              <span className="stepBadge">
                Крок {currentStep + 1} з {TOTAL_STEPS}
              </span>
              <div className="progressTrack" aria-hidden="true">
                <div
                  className="progressFill"
                  style={{
                    width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%`,
                  }}
                />
              </div>
            </header>

            <div className="questionBlock">
              <h1>{currentStepConfig.label}</h1>
              <p>
                {currentStepConfig.kind === 'monthly'
                  ? currentStepConfig.description
                  : 'Заповніть поле нижче, щоб перейти до наступного кроку.'}
              </p>
            </div>

            <div className="fieldBlock">
              {currentStepConfig.kind === 'monthly'
                ? renderMonthlyFields()
                : renderSingleField(currentStepConfig)}

              {error ? (
                <p className="errorMessage" role="alert">
                  {error}
                </p>
              ) : (
                <div className="errorPlaceholder" aria-hidden="true" />
              )}
            </div>

            <footer className="actions">
              {currentStep > 0 ? (
                <button className="secondaryButton" onClick={handleBack} type="button">
                  Назад
                </button>
              ) : (
                <span />
              )}

              {currentStep === TOTAL_STEPS - 1 ? (
                <button
                  className="primaryButton"
                  onClick={handleOpenReview}
                  type="button"
                >
                  Відправити
                </button>
              ) : (
                <button className="primaryButton" onClick={handleNext} type="button">
                  Далі
                </button>
              )}
            </footer>
          </>
        ) : (
          <>
            <header className="resultHeader">
              <span className="stepBadge successBadge">Перевірка перед відправкою</span>
              <h1>Заповнені дані</h1>
              <p>
                Перегляньте відповіді нижче та відправте їх на розгляд. Інтеграція
                з `solar-data-forwarder` вже підготовлена.
              </p>
              <div className="integrationNote">
                {isForwarderConfigured
                  ? 'Endpoint для solar-data-forwarder налаштовано, дані будуть надіслані POST-запитом.'
                  : 'Endpoint для solar-data-forwarder ще не вказано. До підключення інтеграції дані зберігатимуться локально в черзі відправки.'}
              </div>
            </header>

            <div className="resultSection">
              <h2>Основні дані</h2>
              <div className="resultTableWrap">
                <table className="resultTable">
                  <thead>
                    <tr>
                      <th>Питання</th>
                      <th>Відповідь</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row) => (
                      <tr key={row.question}>
                        <td>{row.question}</td>
                        <td>{row.answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="resultSection">
              <h2>Споживання по місяцях</h2>
              <div className="resultTableWrap">
                <table className="resultTable monthTable">
                  <thead>
                    <tr>
                      <th>Місяць</th>
                      <th>кВт*год</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <footer className="actions actionsWrap">
              <button className="secondaryButton" onClick={handleBack} type="button">
                Назад
              </button>
              <button className="secondaryButton" onClick={handleRestart} type="button">
                Почати заново
              </button>
              <button
                className="primaryButton"
                disabled={
                  submissionState.status === 'submitting' ||
                  submissionState.status === 'success'
                }
                onClick={handleForward}
                type="button"
              >
                {primaryButtonLabel}
              </button>
            </footer>

            <div
              aria-live="polite"
              className={`submitStatus submitStatus--${submissionState.status}`}
            >
              {submissionState.message}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
