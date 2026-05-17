import {
  Body,
  Container,
  Head,
  Html,
  Preview,
} from '@react-email/components';
import { ReactNode } from 'react';

interface BaseEmailProps {
  previewText?: string;
  children: ReactNode;
}

export function BaseEmail({ previewText, children }: BaseEmailProps) {
  return (
    <Html>
      <Head />
      {previewText && <Preview>{previewText}</Preview>}
      <Body
        style={{
          backgroundColor: '#0a0a12',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
          color: '#e0e0e0',
          margin: 0,
          padding: 0,
          width: '100%',
          lineHeight: '1.6',
        }}
      >
        <Container
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '40px 32px',
            backgroundColor: '#1a1a1a',
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  );
}
