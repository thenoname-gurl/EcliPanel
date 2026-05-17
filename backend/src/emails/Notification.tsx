import { BaseEmail } from './BaseEmail';
import { Hr, Section } from '@react-email/components';

interface NotificationProps {
  title: string;
  message: string;
  details?: string;
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

const detailsStyle = {
  fontFamily: '"Courier New", monospace',
  fontSize: '13px',
  color: '#fff',
  backgroundColor: '#161616',
  padding: '20px',
  margin: '20px 0',
  whiteSpace: 'pre-wrap' as const,
  wordWrap: 'break-word' as const,
  overflowX: 'auto',
};

const footerStyle = {
  color: '#9ca3af',
  textAlign: 'center' as const,
  marginTop: '32px',
  paddingTop: '24px',
  lineHeight: '1.5',
  fontSize: '16px',
};

const linkStyle = {
  display: 'inline-block',
  margin: '0 8px',
  color: '#9ca3af',
  textDecoration: 'none',
  fontSize: '14px',
};

export function Notification({ title, message, details }: NotificationProps) {
  return (
    <BaseEmail previewText={title}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{title}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{message}</p>
      </Section>

      {details && (
        <Section style={detailsStyle}>
          {details}
        </Section>
      )}

      <Hr style={{ height: '1px', background: 'linear-gradient(to right, transparent, #2a2a4a 50%, transparent)', border: 'none', margin: '24px 0' }} />

      <Hr style={{ height: '1px', border: '1px solid #2a2a4a', marginTop: '32px', paddingTop: '24px' }} />

      <Section style={footerStyle}>
        <p style={{ margin: 0 }}>
          &copy; 2026 <span style={{ color: '#e594c7', fontWeight: '600' }}>EclipseSystems</span> under Misiu LLC.<br />
          All rights reserved.
        </p>
        <Section style={{ marginTop: '16px' }}>
          <a href="https://ecli.app/legal" style={linkStyle}>Legal Documents</a>
          <a href="https://ecli.app/legal/imprint" style={linkStyle}>Impressum</a>
          <a href="mailto:contact@ecli.app" style={linkStyle}>Contact Us</a>
        </Section>
      </Section>
    </BaseEmail>
  );
}
