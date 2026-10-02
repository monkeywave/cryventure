import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { paramFieldsOf, type I18nRef, type ParamField, type PrimitiveManifest } from '@cryventure/core';
import { useT } from '@cryventure/viz';
import type { LabParams } from '../../labs/labSession.ts';
import { editField, hintKeyOf } from '../../labs/paramFields.ts';
import { matchingPresetId } from '../../labs/startParams.ts';

export interface ParamPanelProps {
  producer: PrimitiveManifest<LabParams>;
  params: LabParams;
  /** Called with validated, normalised params. */
  onApply: (params: LabParams) => void;
  /** Why a view's re-run request was rejected (`useLabActions().requestParams`); shown like a field error. */
  requestError?: I18nRef | null;
}

const CUSTOM = '';

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

function describedBy(id: string, field: ParamField): string {
  return hintKeyOf(field) === undefined ? `${id}-error` : `${id}-hint ${id}-error`;
}

/** Validates one edited field and applies it when valid; returns the error to show (or null). */
function useFieldEdit({ producer, params, onApply, field }: FieldProps) {
  const [error, setError] = useState<I18nRef | null>(null);
  const edit = (value: string) => {
    const result = editField(producer, params, field.name, value);
    setError(result.ok ? null : result.error);
    if (result.ok) onApply(result.value);
  };
  return { error, edit };
}

function HexField(props: FieldProps) {
  const t = useT();
  const id = useId();
  const { field, params } = props;
  const [text, setText] = useState(String(params[field.name] ?? ''));
  const { error, edit } = useFieldEdit(props);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    setText(event.target.value);
    edit(event.target.value);
  };
  return (
    <div className="cv-params__field cv-params__field--hex">
      <label htmlFor={id}>{t(field.labelKey)}</label>
      <input id={id} name={field.name} type="text" className="cv-params__input" spellCheck={false} autoComplete="off" autoCapitalize="off" value={text} onChange={change} aria-invalid={error !== null} aria-describedby={describedBy(id, field)} />
      <FieldNotes id={id} field={field} error={error} />
    </div>
  );
}

function SelectField(props: FieldProps) {
  const t = useT();
  const id = useId();
  const { field, params } = props;
  const { error, edit } = useFieldEdit(props);
  return (
    <div className="cv-params__field">
      <label htmlFor={id}>{t(field.labelKey)}</label>
      <select id={id} name={field.name} value={String(params[field.name] ?? '')} onChange={(event) => edit(event.target.value)} aria-invalid={error !== null} aria-describedby={describedBy(id, field)}>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
      <FieldNotes id={id} field={field} error={error} />
    </div>
  );
}

const FIELD_INPUTS = { hex: HexField, select: SelectField } satisfies Record<ParamField['kind'], (props: FieldProps) => ReactNode>;

/**
 * Counts param changes the fields did not make themselves (a view's `requestParams`, a preset), so the
 * text fields can be re-keyed to show them; the fields' own edits keep their draft text and focus.
 */
function useExternalParamsRevision(params: LabParams, onApply: (params: LabParams) => void) {
  const [revision, setRevision] = useState(0);
  // Every set the fields applied (not just the last): re-runs resolve after further typing.
  const ownParams = useRef(new WeakSet<LabParams>());
  const seenParams = useRef(params);
  useEffect(() => {
    if (params === seenParams.current) return;
    seenParams.current = params;
    if (!ownParams.current.has(params)) setRevision((current) => current + 1);
  }, [params]);
  const applyOwn = (next: LabParams) => {
    ownParams.current.add(next);
    onApply(next);
  };
  return { revision, applyOwn };
}

/** The panel-level error for a rejected view request (fields show their own errors). */
function RequestError({ error }: { error: I18nRef | null | undefined }) {
  const t = useT();
  return (
    <p className="cv-params__error" aria-live="polite">
      {error == null ? '' : t(error)}
    </p>
  );
}

/** Preset picker plus one input per declared param field; invalid input shows a localized error and is not applied. */
export function ParamPanel(props: ParamPanelProps) {
  const t = useT();
  // Params changed from outside the fields (a view request) bump the revision so the text fields re-read them.
  const { revision: externalRevision, applyOwn } = useExternalParamsRevision(props.params, props.onApply);
  // Choosing a preset bumps the revision so the text fields re-read the new params.
  const [revision, setRevision] = useState(0);
  const applyPreset = (params: LabParams) => {
    setRevision((current) => current + 1);
    props.onApply(params);
  };
  return (
    <fieldset className="cv-params">
      <legend>{t('ui.lab.params.title')}</legend>
      <PresetSelect {...props} onApply={applyPreset} />
      {paramFieldsOf(props.producer).map((field) => {
        const Input = FIELD_INPUTS[field.kind];
        return <Input key={`${field.name}:${revision}:${externalRevision}`} field={field} {...props} onApply={applyOwn} />;
      })}
      <RequestError error={props.requestError} />
    </fieldset>
  );
}
