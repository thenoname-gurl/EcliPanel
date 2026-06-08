import { BaseEmail } from './BaseEmail';
import { Hr, Section } from '@react-email/components';

interface PaymentInstructionsProps {
  orderId: number;
  amount: number;
  paymentMethod: string;
  address: string;
  instructions?: string;
  currency?: string;
  network?: string;
  t?: (key: string, vars?: Record<string, string | number>) => string;
}

const headingStyle = {
  color: '#fff',
  fontSize: '28px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0',
};

const pStyle = {
  color: '#ffffffb3',
  fontSize: '16px',
  margin: '0 0 16px 0',
  lineHeight: '1.7',
};

const codeStyle = {
  fontFamily: '"Courier New", monospace',
  fontSize: '14px',
  color: '#8b5cf6',
  backgroundColor: '#161616',
  padding: '16px',
  margin: '16px 0',
  wordBreak: 'break-all' as const,
};

const amountStyle = {
  color: '#8b5cf6',
  fontSize: '32px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '24px 0',
};

export function PaymentInstructions({
  orderId,
  amount,
  paymentMethod,
  address,
  instructions,
  currency,
  network,
  t,
}: PaymentInstructionsProps) {
  const preview = t
    ? t('paymentInstructions.preview')
    : 'Payment instructions for your order';
  return (
    <BaseEmail previewText={preview} t={t}>
      <Section style={{ marginBottom: '24px' }}>
        <h1 style={headingStyle}>
          {t ? t('paymentInstructions.heading') : 'Payment Instructions'}
        </h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>
          {t ? t('paymentInstructions.thankYou', { orderId }) : `Thank you for your order #${orderId}.`}
        </p>
        <div style={amountStyle}>${(amount ?? 0).toFixed(2)}</div>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={{ ...pStyle, fontWeight: 'bold', color: '#fff' }}>
          {t ? t('paymentInstructions.method', { method: paymentMethod }) : `Payment Method: ${paymentMethod}`}
        </p>
        {currency && (
          <p style={pStyle}>
            {t
              ? t('paymentInstructions.currency', { currency })
              : `Currency: ${currency}`}
          </p>
        )}
        {network && (
          <p style={pStyle}>
            {t
              ? t('paymentInstructions.network', { network })
              : `Network: ${network}`}
          </p>
        )}
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={{ ...pStyle, fontWeight: 'bold', color: '#fff' }}>
          {t ? t('paymentInstructions.address') : 'Send Payment To:'}
        </p>
        <div style={codeStyle}>{address}</div>
        {instructions && <p style={pStyle}>{instructions}</p>}
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>
          {t
            ? t('paymentInstructions.afterSend')
            : "After sending the payment, mark your order as 'Payment Sent' from your billing panel."}
        </p>
      </Section>

      <Hr
        style={{
          height: '1px',
          background: 'linear-gradient(to right, transparent, #2a2a4a 50%, transparent)',
          border: 'none',
          margin: '24px 0',
        }}
      />
    </BaseEmail>
  );
}
