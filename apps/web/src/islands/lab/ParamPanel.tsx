import { useId, useState, type ChangeEvent, type ReactNode } from 'react';
import { paramFieldsOf, portOptions, type I18nRef, type ParamField, type ParamFieldOption, type PrimitiveManifest } from '@cryventure/core';
import { useT } from '@cryventure/viz';
import type { LabParams } from '../../labs/labSession.ts';
import { editField, hintKeyOf, textFieldLength } from '../../labs/paramFields.ts';
import { producerRegistry } from '../../labs/producers.ts';
import { matchingPresetId } from '../../labs/startParams.ts';
import { useDebouncedCallback } from '../shared/useDebouncedCallback.ts';

export interface ParamPanelProps {
  producer: PrimitiveManifest<LabParams>;
  /** The params of the latest requested run (`useLabSession().pendingParams`), so a second edit builds on a first one still running. */
  params: LabParams;
  /** Called with validated, normalised params. */
  onApply: (params: LabParams) => void;
  /** Why the last re-run or view request failed (invalid params or a run error, e.g. a wrong key length); shown like a field error. */
  requestError?: I18nRef | null;
  /** Registered producers, the options of `port` fields (default: the app's producer registry). */
  producers?: readonly PrimitiveManifest[];
}

const CUSTOM = '';

/** Text and hex edits re-run only after the learner paused typing this long; selects apply at once. */
export const TEXT_EDIT_DEBOUNCE_MS = 150;

function PresetSelect({ producer, params, onApply }: ParamPanelProps) {
  const t = useT();
  const id = useId();
  const current = matchingPresetId(producer, params) ?? CUSTOM;
  const choose = (event: ChangeEvent<HTMLSelectElement>) => {
    const preset = producer.presets.find((entry) => entry.id === event.target.value);
    if (preset !== undefined) onApply(preset.params);
  };
  return (
    <div className="cv-params__field">
      <label htmlFor={id}>{t('ui.lab.params.preset')}</label>
      <select id={id} value={current} onChange={choose}>
        {current === CUSTOM && (
          <option value={CUSTOM} disabled>
            {t('ui.lab.params.custom')}
          </option>
        )}
        {producer.presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {t(preset.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}

interface FieldProps extends ParamPanelProps {
  field: ParamField;
}

/** The field's hint (if any) and its live error message, both referenced by `aria-describedby`. */
function FieldNotes({ id, field, error }: { id: string; field: ParamField; error: I18nRef | null }) {
  const t = useT();
  const hintKey = hintKeyOf(field);
  return (
    <>
      {hintKey !== undefined && (
        <span id={`${id}-hint`} className="cv-params__hint">
          {t(hintKey)}
        </span>
      )}
      <span id={`${id}-error`} className="cv-params__error" aria-live="polite">
        {error === null ? '' : t(error)}
      </span>
    </>
  );
}

/** The hint (if any), any extra notes (e.g. a byte counter) and the error, in reading order. */
function describedBy(id: string, field: ParamField, extra: readonly string[] = []): string {
  return [...(hintKeyOf(field) === undefined ? [] : [`${id}-hint`]), ...extra, `${id}-error`].join(' ');
}

/**
 * Validates one edited field and applies it when valid. `error` is the message to show (or null);
 * `edit` returns the applied params, or `undefined` when the text was rejected.
 */
function useFieldEdit({ producer, params, onApply, field }: FieldProps) {
  const [error, setError] = useState<I18nRef | null>(null);
  const edit = (value: string): LabParams | undefined => {
    const result = editField(producer, params, field.name, value);
    setError(result.ok ? null : result.error);
    if (!result.ok) return undefined;
    onApply(result.value);
    return result.value;
  };
  return { error, edit, clearError: () => setError(null) };
}

/** What a text field shows, the param value it last saw, and the value its own last edit applied. */
interface Draft {
  text: string;
  seen: unknown;
  applied: unknown;
}

/**
 * A text field's draft. The text shows at once; it is validated and applied once typing pauses
 * (`TEXT_EDIT_DEBOUNCE_MS`). When the param value changes to something the field did not apply itself
 * (e.g. another field's edit normalised it), the draft shows it and any error clears; the learner's own
 * edits keep their text and focus, also while their re-run is still pending. Params applied from
 * outside the fields remount the field instead (`useExternalParamsGeneration`), dropping a pending edit.
 */
function useDraft(props: FieldProps) {
  const { name } = props.field;
  const value = props.params[name];
  const [draft, setDraft] = useState<Draft>({ text: String(value ?? ''), seen: value, applied: value });
  const { error, edit, clearError } = useFieldEdit(props);
  if (!Object.is(draft.seen, value)) {
    // Adjusting state while rendering (React's documented alternative to an effect) avoids a stale frame.
    const own = Object.is(draft.applied, value);
    setDraft(own ? { ...draft, seen: value } : { text: String(value ?? ''), seen: value, applied: value });
    if (!own) clearError();
  }
  const commit = useDebouncedCallback((text: string) => {
    const applied = edit(text);
    if (applied !== undefined) setDraft((current) => ({ ...current, applied: applied[name] }));
  }, TEXT_EDIT_DEBOUNCE_MS);
  const change = (text: string) => {
    setDraft((current) => ({ ...current, text }));
    commit(text);
  };
  return { text: draft.text, error, change };
}

function HexField(props: FieldProps) {
  const t = useT();
  const id = useId();
  const { field } = props;
  const { text, error, change: changeText } = useDraft(props);
  const change = (event: ChangeEvent<HTMLInputElement>) => changeText(event.target.value);
  return (
    <div className="cv-params__field cv-params__field--hex">
      <label htmlFor={id}>{t(field.labelKey)}</label>
      <input id={id} name={field.name} type="text" className="cv-params__input" spellCheck={false} autoComplete="off" autoCapitalize="off" value={text} onChange={change} aria-invalid={error !== null} aria-describedby={describedBy(id, field)} />
      <FieldNotes id={id} field={field} error={error} />
    </div>
  );
}

/**
 * A text param with a live byte counter against `maxLength`: UTF-8 bytes, or decoded bytes for the
 * `input` field while the producer's `encoding` param is `'hex'` (`textFieldLength`, docs/EXTENDING.md "Text params").
 */
function TextField(props: FieldProps) {
  const t = useT();
  const id = useId();
  const { field } = props;
  const { text, error, change: changeText } = useDraft(props);
  const change = (event: ChangeEvent<HTMLInputElement>) => changeText(event.target.value);
  const max = field.maxLength;
  const { unit, bytes } = textFieldLength(field.name, text, props.params);
  const counterId = `${id}-count`;
  return (
    <div className="cv-params__field cv-params__field--text">
      <label htmlFor={id}>{t(field.labelKey)}</label>
      <input id={id} name={field.name} type="text" className="cv-params__input" spellCheck={false} autoComplete="off" value={text} onChange={change} aria-invalid={error !== null} aria-describedby={describedBy(id, field, max === undefined ? [] : [counterId])} />
      {max !== undefined && (
        <span id={counterId} className="cv-params__count" data-over={bytes !== undefined && bytes > max}>
          {t(unit === 'hex' ? 'ui.lab.params.byteCountHex' : 'ui.lab.params.byteCount', { count: bytes ?? '–', max })}
        </span>
      )}
      <FieldNotes id={id} field={field} error={error} />
    </div>
  );
}

/** A select over `options`; the picked value is validated and applied like any other edit. */
function ChoiceField({ options, ...props }: FieldProps & { options: readonly ParamFieldOption[] }) {
  const t = useT();
  const id = useId();
  const { field, params } = props;
  const { error, edit } = useFieldEdit(props);
  return (
    <div className="cv-params__field">
      <label htmlFor={id}>{t(field.labelKey)}</label>
      <select id={id} name={field.name} value={String(params[field.name] ?? '')} onChange={(event) => edit(event.target.value)} aria-invalid={error !== null} aria-describedby={describedBy(id, field)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
      <FieldNotes id={id} field={field} error={error} />
    </div>
  );
}

function SelectField(props: FieldProps) {
  return <ChoiceField {...props} options={props.field.options ?? []} />;
}

/** A `port` param: every registered producer implementing the port, labelled by its title (docs/M3.md §2). */
function PortField(props: FieldProps) {
  const { field, producers = producerRegistry.list() } = props;
  return <ChoiceField {...props} options={field.port === undefined ? [] : portOptions(producers, field.port)} />;
}

const FIELD_INPUTS = { hex: HexField, select: SelectField, port: PortField, text: TextField } satisfies Record<ParamField['kind'], (props: FieldProps) => ReactNode>;

/** The panel-level error for a rejected view request (fields show their own errors). */
function RequestError({ error }: { error: I18nRef | null | undefined }) {
  const t = useT();
  return (
    <p className="cv-params__error" aria-live="polite">
      {error == null ? '' : t(error)}
    </p>
  );
}

/** The params the panel last saw, the params object its fields last applied, and how often params came from outside. */
interface ParamsOrigin {
  seen: LabParams;
  ownApplied: LabParams | null;
  generation: number;
}

/**
 * Counts params applied from outside the fields (a preset, a view request, a reset): any new params
 * object that is not the one a field's own edit produced. Keying the fields by this generation drops
 * every field's draft and error then, while the learner's own typing keeps its drafts and focus.
 */
function useExternalParamsGeneration(params: LabParams, onApply: ParamPanelProps['onApply']) {
  const [origin, setOrigin] = useState<ParamsOrigin>({ seen: params, ownApplied: null, generation: 0 });
  if (origin.seen !== params) {
    // Adjusting state while rendering (React's documented alternative to an effect) avoids a stale frame.
    const external = params !== origin.ownApplied;
    setOrigin({ seen: params, ownApplied: external ? null : origin.ownApplied, generation: origin.generation + (external ? 1 : 0) });
  }
  const applyOwn = (next: LabParams) => {
    setOrigin((current) => ({ ...current, ownApplied: next }));
    onApply(next);
  };
  return { generation: origin.generation, applyOwn };
}

/** Preset picker plus one input per declared param field; invalid input shows a localized error and is not applied. */
export function ParamPanel(props: ParamPanelProps) {
  const t = useT();
  const { generation, applyOwn } = useExternalParamsGeneration(props.params, props.onApply);
  return (
    <fieldset className="cv-params">
      <legend>{t('ui.lab.params.title')}</legend>
      <PresetSelect {...props} />
      {paramFieldsOf(props.producer).map((field) => {
        const Input = FIELD_INPUTS[field.kind];
        return <Input key={`${field.name}:${generation}`} field={field} {...props} onApply={applyOwn} />;
      })}
      <RequestError error={props.requestError} />
    </fieldset>
  );
}
