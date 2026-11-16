import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

export function PasswordField({ label, value, onChange, autoComplete = 'current-password', disabled = false }: {
  label: string; value: string; onChange: (value: string) => void;
  autoComplete?: string; disabled?: boolean;
}) {
  const id = useId();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-field">
      <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} disabled={disabled} />
      {value && <button className="icon-btn" type="button" aria-label={t('common.clear')} disabled={disabled} onClick={() => { onChange(''); document.getElementById(id)?.focus(); }}><Icon name="close" /></button>}
      <button className="icon-btn" type="button" aria-label={t(visible ? 'common.hide_password' : 'common.show_password')} aria-pressed={visible} disabled={disabled} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button>
    </div>
  </div>;
}
