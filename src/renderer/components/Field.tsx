import { XIcon } from '@phosphor-icons/react';
import { useRef } from 'react';
import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react';
import { sameValue } from '../../shared/fields.ts';
import type { FieldKey, Fields } from '../../shared/types.ts';
import { fromInputValue, toInputValue } from '../format.ts';
import { describeValue } from '../schema.ts';
import type { FieldDef } from '../schema.ts';

type Value = Fields[FieldKey];

interface FieldProps {
  def: FieldDef;
  value: Value;
  saved: Value;
  note?: string;
  flash: boolean;
  onChange(value: Value): void;
  onRestore(): void;
}

export function Field({ def, value, saved, note, flash, onChange, onRestore }: FieldProps) {
  const id = `field-${def.key}`;
  const changed = !sameValue(def.key, value, saved);
  const hint = note ?? def.hint;

  return (
    <div className="field" data-wide={def.wide || undefined} data-changed={changed || undefined} data-flash={flash || undefined}>
      <div className="field-head">
        <label htmlFor={id}>{def.label}</label>
        {changed && (
          <button className="field-was" onClick={onRestore} title="Put back the saved value">
            was {describeValue(def, saved)}
          </button>
        )}
      </div>
      <Control id={id} def={def} value={value} onChange={onChange} />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface ControlProps {
  id: string;
  def: FieldDef;
  value: Value;
  onChange(value: Value): void;
}

function Control({ id, def, value, onChange }: ControlProps) {
  switch (def.control) {
    case 'text':
      return (
        <input
          id={id}
          className="input"
          value={String(value ?? '')}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'multiline':
      return (
        <textarea
          id={id}
          className="input input-multiline"
          rows={3}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
      return <NumberInput id={id} value={value as number | null} onChange={onChange} />;
    case 'duration':
      return <DurationInput id={id} value={value as number | null} onChange={onChange} />;
    case 'date':
    case 'precise-date':
      return (
        <DateInput
          id={id}
          value={value as string | null}
          seconds={def.control === 'precise-date'}
          clearable={def.clearable ?? false}
          onChange={onChange}
        />
      );
  }
}

const MAX_COUNT = 2_147_483_647;

function digitsOf(event: ChangeEvent<HTMLInputElement>): number | null {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
  return digits ? Math.min(Number(digits), MAX_COUNT) : null;
}

/** Arrow keys nudge the value; Shift moves in tens. */
function nudge(event: KeyboardEvent<HTMLInputElement>, value: number | null, onChange: (value: number) => void) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
  onChange(Math.min(Math.max((value ?? 0) + step, 0), MAX_COUNT));
}

function NumberInput({ id, value, onChange }: { id: string; value: number | null; onChange(value: number | null): void }) {
  return (
    <input
      id={id}
      className="input num"
      inputMode="numeric"
      value={value === null ? '' : String(value)}
      placeholder="Not set"
      onChange={(event) => onChange(digitsOf(event))}
      onKeyDown={(event) => nudge(event, value, onChange)}
    />
  );
}

function DurationInput({ id, value, onChange }: { id: string; value: number | null; onChange(value: number | null): void }) {
  const hoursInput = useRef<HTMLInputElement>(null);
  const hours = value === null ? null : Math.floor(value / 60);
  const minutes = value === null ? null : value % 60;
  const minutesId = `${id}-minutes`;

  const update = (h: number | null, m: number | null) => onChange(h === null && m === null ? null : (h ?? 0) * 60 + (m ?? 0));

  // The inputs size to their digits, so clicks on the empty part of the box land on hours.
  const focusHours = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    hoursInput.current?.focus();
  };

  return (
    <div className="input input-split" onMouseDown={focusHours}>
      <input
        id={id}
        ref={hoursInput}
        className="num"
        inputMode="numeric"
        aria-label="Hours"
        value={hours ?? ''}
        placeholder="0"
        onChange={(event) => update(digitsOf(event), minutes)}
        onKeyDown={(event) => nudge(event, hours, (h) => update(h, minutes))}
      />
      <label className="input-unit" htmlFor={id}>
        h
      </label>
      <input
        id={minutesId}
        className="num"
        inputMode="numeric"
        aria-label="Minutes"
        value={minutes ?? ''}
        placeholder="0"
        onChange={(event) => update(hours, digitsOf(event))}
        onKeyDown={(event) => nudge(event, value, (total) => onChange(total))}
      />
      <label className="input-unit" htmlFor={minutesId}>
        min
      </label>
    </div>
  );
}

interface DateInputProps {
  id: string;
  value: string | null;
  seconds: boolean;
  clearable: boolean;
  onChange(value: string | null): void;
}

function DateInput({ id, value, seconds, clearable, onChange }: DateInputProps) {
  return (
    <div className="input-wrap">
      <input
        id={id}
        type="datetime-local"
        className="input num"
        step={seconds ? 1 : 60}
        value={toInputValue(value, seconds)}
        onChange={(event) => onChange(fromInputValue(event.target.value))}
      />
      {clearable && value && (
        <button className="input-clear" onClick={() => onChange(null)} aria-label="Clear date" title="Clear">
          <XIcon size={12} weight="bold" />
        </button>
      )}
    </div>
  );
}
