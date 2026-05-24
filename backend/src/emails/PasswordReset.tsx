import { BaseEmail } from './BaseEmail';
import { Button, Hr, Section } from '@react-email/components';

interface PasswordResetProps {
  name: string;
  message: string;
  url: string;
  t?: (key: string, vars?: Record<string, string | number>) => string;
}

const headingStyle = {
  color: '#fff',
  fontSize: '30px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0',
  letterSpacing: '-0.5px',
};

const pStyle = {
  color: '#ffffffb3',
  fontSize: '16px',
  margin: '0 0 16px 0',
  lineHeight: '1.7',
};

const btnStyle = {
  display: 'inline-block',
  padding: '14px 28px',
  color: '#fff',
  fontFamily: '"Courier New", monospace',
  fontSize: '32px',
  fontWeight: 'bold',
  backgroundColor: '#0d0d0d',
  textDecoration: 'none',
  textAlign: 'center' as const,
};

export function PasswordReset({ name, message, url, t }: PasswordResetProps) {
  const _t = t || ((key: string) => key);

  return (
    <BaseEmail previewText={_t('email.passwordReset.preview')} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{_t('email.passwordReset.heading')}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{_t('email.passwordReset.greeting', { name })}</p>
        <p style={pStyle}>{message}</p>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={url} style={btnStyle}>
          {_t('email.passwordReset.button')}
        </Button>
      </Section>

      <Hr
        style={{
          height: '1px',
          background: 'linear-gradient(to right, transparent, #2a2a4a 50%, transparent)',
          border: 'none',
          margin: '24px 0',
        }}
      />

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{_t('email.passwordReset.ignore')}</p>
      </Section>
    </BaseEmail>
  );
}
