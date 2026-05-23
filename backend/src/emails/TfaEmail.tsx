import { BaseEmail } from './BaseEmail';
import { Section } from '@react-email/components';

interface TfaEmailProps {
  name: string;
  code: string;
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

const codeStyle = {
  fontFamily: '"Courier New", monospace',
  fontSize: '26px',
  color: '#fff',
  textAlign: 'center' as const,
  fontWeight: 'bold',
  backgroundColor: '#0d0d0d',
  padding: '14px 28px',
  margin: '20px 0',
};

const infoBoxStyle = {
  backgroundColor: '#161616',
  padding: '16px',
  margin: '20px 0',
};

export function TfaEmail({ name, code, t }: TfaEmailProps) {
  const _t = t || ((key: string) => key);

  return (
    <BaseEmail previewText={_t('email.tfa.preview')} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{_t('email.tfa.heading')}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{_t('email.tfa.greeting', { name })}</p>
        <p style={pStyle}>{_t('email.tfa.instruction')}</p>
      </Section>

      <Section style={codeStyle}>
        {code}
      </Section>

      <Section style={infoBoxStyle}>
        <p style={{ color: '#ffffffb3', fontSize: '14px', margin: 0 }}>
          <strong>{_t('email.tfa.important')}:</strong> {_t('email.tfa.expires')}
        </p>
      </Section>

    </BaseEmail>
  );
}
