import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CODE_LENGTH, NICKNAME_MAX, isLiveAvailable, isValidCode, normalizeCode, sanitizeNickname } from '@/lib/liveBuzzer';
import './LiveBuzzer.css';

// ============================================================
// Buzzer Battle — join form. No account needed: a code and a name.
// ============================================================

const NAME_KEY = 'sf_live_last_name';

const STAGE = {
  gold: '#ffc53d',
  sub: '#c3bdf0',
  buzzer: '#e5484d',
  buzzerEdge: '#9e1f25',
};

function readSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function LiveJoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => normalizeCode(params.get('code') ?? ''));
  const [name, setName] = useState(() => sanitizeNickname(params.get('name') ?? readSavedName()));
  const [touched, setTouched] = useState(false);

  const codeError = !code
    ? 'Enter the game code from the big screen.'
    : !isValidCode(code)
      ? `Game codes are ${CODE_LENGTH} letters and numbers.`
      : null;
  const cleanName = sanitizeNickname(name);
  const nameError = !cleanName ? 'Pick a nickname.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (codeError || nameError) return;
    try {
      localStorage.setItem(NAME_KEY, cleanName);
    } catch {
      // ignore
    }
    navigate(`/live/play?code=${encodeURIComponent(code)}&name=${encodeURIComponent(cleanName)}`);
  };

  if (!isLiveAvailable()) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
          Live games aren't available
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          This copy of StudyFlow isn't connected to the cloud, so it can't join live games.
        </p>
      </div>
    );
  }

  const fieldStyle = (invalid: boolean) => ({
    background: '#ffffff',
    color: '#15112f',
    border: `3px solid ${invalid ? '#ff8f93' : 'transparent'}`,
    boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.12)',
  });

  return (
    <div className="max-w-md mx-auto px-4 py-8 sm:py-14">
      <div className="bz-stage rounded-3xl p-6 sm:p-8">
        <svg aria-hidden className="bz-stage-beams" viewBox="0 0 400 200" preserveAspectRatio="none">
          <polygon points="60,0 110,0 200,200 -20,200" fill="rgba(255,236,170,0.06)" />
        </svg>
        <form onSubmit={submit} noValidate className="relative flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <svg width="52" height="52" viewBox="0 0 64 64" aria-hidden>
              <ellipse cx="32" cy="54" rx="26" ry="7" fill="#0d0b24" />
              <rect x="8" y="40" width="48" height="14" rx="4" fill="#3a2f7a" />
              <path d="M14 42 C14 22 50 22 50 42 Z" fill={STAGE.buzzer} />
              <path d="M14 42 C14 36 50 36 50 42 Z" fill={STAGE.buzzerEdge} />
              <ellipse cx="25" cy="30" rx="5" ry="3" fill="rgba(255,255,255,0.45)" transform="rotate(-25 25 30)" />
            </svg>
            <div>
              <h1 className="text-3xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color: '#fff' }}>
                Join a game
              </h1>
              <p className="text-sm font-semibold" style={{ color: STAGE.sub }}>
                No account needed.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="bz-code" className="block text-sm font-bold mb-1.5" style={{ color: '#fff' }}>
              Game code
            </label>
            <input
              id="bz-code"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CODE_LENGTH + 2}
              placeholder="ABC234"
              aria-invalid={touched && !!codeError}
              aria-describedby={touched && codeError ? 'bz-code-err' : undefined}
              autoFocus={!code}
              className="bz-code w-full h-16 px-4 rounded-2xl text-3xl text-center outline-none focus-visible:ring-4"
              style={{ ...fieldStyle(touched && !!codeError), ['--tw-ring-color' as string]: STAGE.gold }}
            />
            {touched && codeError && (
              <p id="bz-code-err" className="mt-1.5 text-sm font-semibold" style={{ color: '#ffb3b5' }}>
                {codeError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="bz-name" className="block text-sm font-bold mb-1.5" style={{ color: '#fff' }}>
              Nickname
            </label>
            <input
              id="bz-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NICKNAME_MAX * 2))}
              onBlur={() => setName((n) => sanitizeNickname(n))}
              autoComplete="nickname"
              maxLength={NICKNAME_MAX}
              placeholder="Your name on the big screen"
              aria-invalid={touched && !!nameError}
              aria-describedby="bz-name-hint"
              autoFocus={!!code}
              className="w-full h-14 px-4 rounded-2xl text-lg font-semibold outline-none focus-visible:ring-4"
              style={{ ...fieldStyle(touched && !!nameError), ['--tw-ring-color' as string]: STAGE.gold }}
            />
            <p id="bz-name-hint" className="mt-1.5 text-sm font-semibold" style={{ color: touched && nameError ? '#ffb3b5' : STAGE.sub }}>
              {touched && nameError ? nameError : `Up to ${NICKNAME_MAX} characters. Keep it friendly.`}
            </p>
          </div>

          <button
            type="submit"
            className="w-full h-14 rounded-2xl text-xl font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2 active:translate-y-0.5"
            style={{
              background: STAGE.buzzer,
              color: '#fff',
              border: 'none',
              boxShadow: `inset 0 -6px 0 ${STAGE.buzzerEdge}`,
              fontFamily: 'var(--font-display)',
              outlineColor: '#fff',
            }}
          >
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
