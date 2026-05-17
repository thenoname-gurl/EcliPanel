import { BaseEmail } from './BaseEmail';
import { Button, Hr, Section } from '@react-email/components';

interface InviteProps {
  name: string;
  orgName: string;
  link: string;
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

export function Invite({ name, orgName, link }: InviteProps) {
  return (
    <BaseEmail previewText={`You're invited to join ${orgName}`}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>Invitation to Join</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>Hello {name},</p>
        <p style={pStyle}>You have been invited to access <strong>{orgName}</strong>.</p>
        <p style={pStyle}>Click the button below to review and accept the invite in your panel.</p>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={link} style={btnStyle}>Accept Invitation</Button>
      </Section>

      <Hr style={{ height: '1px', background: 'linear-gradient(to right, transparent, #2a2a4a 50%, transparent)', border: 'none', margin: '24px 0' }} />

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>If you did not expect this email, you can safely ignore it.</p>
      </Section>

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
