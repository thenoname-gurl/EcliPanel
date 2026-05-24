import { AppDataSource } from '../config/typeorm';
import { AIModel } from '../models/aiModel.entity';
import { User } from '../models/user.entity';
import { httpRequest } from '../utils/http';
import { tForUser } from '../i18n';

export type FraudScanResult =
  | {
      success: true;
      userId: number;
      fraudScore: number;
      isSuspicious: boolean;
      reasons: string[];
      riskCategory: 'low' | 'medium' | 'high' | 'critical';
      signals: FraudSignals;
    }
  | {
      success: false;
      error: string;
    };

export type FraudSignals = {
  identityRisk: number;
  addressRisk: number;
  contactRisk: number;
  patternRisk: number;
  businessRisk: number;
};

export async function getConfiguredFraudModels(): Promise<AIModel[]> {
  const modelRepo = AppDataSource.getRepository(AIModel);
  return await modelRepo.find();
}

function buildBillingInfo(user: User) {
  const fullName =
    `${user.firstName || ''} ${user.middleName ? `${user.middleName} ` : ''}${user.lastName || ''}`.trim();

  return {
    identity: {
      fullName,
      firstName: user.firstName || null,
      middleName: user.middleName || null,
      lastName: user.lastName || null,
      email: user.email || null,
    },
    contact: {
      phone: user.phone || null,
    },
    address: {
      line1: user.address || null,
      line2: user.address2 || null,
      city: user.billingCity || null,
      state: user.billingState || null,
      zip: user.billingZip || null,
      country: user.billingCountry || null,
    },
    business: {
      company: user.billingCompany || null,
    },
    meta: {
      accountCreatedAt: user.createdAt || null,
      lastLoginAt: user.lastLoginAt || null,
    },
  };
}

function buildFraudSystemPrompt(): string {
  return `You are an expert fraud detection analyst specializing in web hosting and cloud services billing fraud. Your task is to analyze user billing information and identify fraudulent, synthetic, or high-risk accounts with high precision.

=== SCORING FRAMEWORK ===

You must score FIVE independent risk signals, each from 0-100:

1. IDENTITY RISK - Analyze the name and email combination:
   - Placeholder/test names: "John Doe", "Test User", "Admin User", "Jane Smith", "asdf", "qwerty", "aaaaaa" (+80)
   - Sequential or keyboard pattern names: "Abc Def", "Zxc Vbn" (+70)
   - Single character names or names under 2 characters each part (+60)
   - Names containing numbers: "John123 Smith" (+75)
   - Disposable/temporary email domains: mailinator, guerrillamail, tempmail, throwam, yopmail, sharklasers, trashmail, maildrop, dispostable, 10minutemail, burnermail, fakeinbox (+85)
   - Email username that is completely random characters with no pattern (+40)
   - Name/email mismatch where email suggests completely different identity (+50)
   - All-lowercase name that looks auto-generated (+30)
   - Legitimate common names with legitimate email providers: (+0 to +10)

2. ADDRESS RISK - Analyze physical address plausibility:
   - Famous landmarks or tourist sites: "1600 Pennsylvania Ave", "1 Infinite Loop", "221B Baker Street", "Buckingham Palace" (+90)
   - Government buildings: Pentagon, Capitol Building, White House, embassies, military bases (+90)
   - Clearly fictional addresses: "123 Fake Street", "1 Test Lane", "000 Null Ave" (+95)
   - Nonsensical street names or numbers (e.g., "99999 Zzz Blvd") (+80)
   - Mismatched city/state/zip combinations that cannot exist (+85)
   - ZIP code that does not match the stated city and state (+70)
   - Address is a known mail drop or UPS Store/FedEx Office location (+60)
   - PO Box only with no physical address (+25)
   - Address line contains only numbers or gibberish (+75)
   - Missing critical fields (no city, no zip, no country) (+40)
   - Plausible residential or business address: (+0 to +15)

3. CONTACT RISK - Analyze phone number validity:
   - Repeating digits: "1111111111", "0000000000", "1234567890" (+90)
   - Sequential patterns: "123-456-7890", "098-765-4321" (+85)
   - Known VoIP/disposable number prefixes or patterns (+60)
   - International number that does not match billing country (+45)
   - Number is too short or too long for the stated country (+70)
   - Missing phone when all other fields are present (+20)
   - Plausible local phone number matching country/region: (+0 to +10)

4. PATTERN RISK - Analyze cross-field consistency and hosting fraud patterns:
   - Name, address, email, and phone all look independently suspicious (+90)
   - Email domain registered very recently (cannot verify but flag if obscure) (+35)
   - All fields filled with minimum possible characters (+65)
   - Mix of real-looking and obviously fake fields (partial synthetic identity) (+55)
   - Country is a high-fraud-risk region AND other signals are elevated (+30)
   - Business name matches a well-known company (impersonation attempt) (+75)
   - First and last name are identical: "John John" (+70)
   - No middle name, generic name, disposable email all together (+50)
   - All fields appear internally consistent and plausible: (+0)

5. BUSINESS RISK - Analyze company name if provided:
   - Obviously fake company names: "Test Company", "My Company", "ACME", "Fake LLC" (+85)
   - Company name is same as personal name with "LLC" or "Inc" appended generically (+40)
   - Company name contains placeholder words: "Example", "Sample", "Demo", "Temp" (+90)
   - Well-known legitimate company name used (possible impersonation) (+70)
   - Plausible small business or professional name: (+0 to +10)
   - No company provided (not suspicious on its own): (+0)

=== FINAL FRAUD SCORE CALCULATION ===

Compute a weighted average:
- Identity Risk: 30% weight
- Address Risk: 30% weight  
- Contact Risk: 15% weight
- Pattern Risk: 20% weight
- Business Risk: 5% weight

fraudScore = (identityRisk * 0.30) + (addressRisk * 0.30) + (contactRisk * 0.15) + (patternRisk * 0.20) + (businessRisk * 0.05)

Round fraudScore to nearest integer (0-100).

isSuspicious = true if fraudScore >= 45

riskCategory rules:
- 0-24: "low"
- 25-44: "medium"  
- 45-74: "high"
- 75-100: "critical"

=== REASONS GUIDELINES ===

- Provide 1-6 specific, actionable reason strings
- Each reason must reference the actual data (e.g., "Email domain 'mailinator.com' is a known disposable provider")
- Do NOT provide generic reasons — always quote or reference the specific field value
- If a field is legitimately fine, do not mention it
- Order reasons from most to least severe
- If no issues found, return an empty array

=== OUTPUT FORMAT ===

Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation text before or after.

{
  "fraudScore": <integer 0-100>,
  "isSuspicious": <boolean>,
  "riskCategory": <"low"|"medium"|"high"|"critical">,
  "reasons": ["specific reason 1", "specific reason 2"],
  "signals": {
    "identityRisk": <integer 0-100>,
    "addressRisk": <integer 0-100>,
    "contactRisk": <integer 0-100>,
    "patternRisk": <integer 0-100>,
    "businessRisk": <integer 0-100>
  }
}`;
}

function buildFraudUserPrompt(billingInfo: ReturnType<typeof buildBillingInfo>): string {
  return `Analyze the following user billing information for fraud risk. Apply the scoring framework exactly as instructed.

BILLING DATA:
${JSON.stringify(billingInfo, null, 2)}

Remember:
- Score each signal independently before computing the weighted total
- Reference specific field values in your reasons
- Return ONLY the JSON object`;
}

function getFraudChatUrl(endpoint: string): string {
  const baseUrl = (endpoint || '')
    .replace(/\/+$/, '')
    .replace(/(\/v1(\/chat(\/completions)?)?)?$/, '');
  return `${baseUrl}/v1/chat/completions`;
}

function getRiskCategory(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 75) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function getDefaultSignals(): FraudSignals {
  return {
    identityRisk: 0,
    addressRisk: 0,
    contactRisk: 0,
    patternRisk: 0,
    businessRisk: 0,
  };
}

function parseFraudResult(aiReply: string): {
  fraudScore: number;
  isSuspicious: boolean;
  riskCategory: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  signals: FraudSignals;
} {
  const cleaned = aiReply
    .replace(/```json?\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    const fraudScore = Math.min(100, Math.max(0, Number(parsed.fraudScore) || 0));
    const isSuspicious = Boolean(parsed.isSuspicious ?? fraudScore >= 45);
    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.map(String).filter(Boolean).slice(0, 6)
      : [];

    const rawSignals = parsed.signals || {};
    const signals: FraudSignals = {
      identityRisk: Math.min(100, Math.max(0, Number(rawSignals.identityRisk) || 0)),
      addressRisk: Math.min(100, Math.max(0, Number(rawSignals.addressRisk) || 0)),
      contactRisk: Math.min(100, Math.max(0, Number(rawSignals.contactRisk) || 0)),
      patternRisk: Math.min(100, Math.max(0, Number(rawSignals.patternRisk) || 0)),
      businessRisk: Math.min(100, Math.max(0, Number(rawSignals.businessRisk) || 0)),
    };

    const validCategories = ['low', 'medium', 'high', 'critical'] as const;
    const riskCategory = validCategories.includes(parsed.riskCategory)
      ? (parsed.riskCategory as 'low' | 'medium' | 'high' | 'critical')
      : getRiskCategory(fraudScore);

    return { fraudScore, isSuspicious, riskCategory, reasons, signals };
  } catch {
    return {
      fraudScore: 0,
      isSuspicious: false,
      riskCategory: 'low',
      reasons: [`AI response could not be parsed: ${cleaned.slice(0, 200)}`],
      signals: getDefaultSignals(),
    };
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runFraudScanForUser(user: User): Promise<FraudScanResult> {
  const t = tForUser(user);

  const models = await getConfiguredFraudModels();
  if (models.length === 0) {
    return { success: false, error: t('fraud.noModel') };
  }

  const userRepo = AppDataSource.getRepository(User);
  const current = await userRepo.findOneBy({ id: user.id });
  if (!current) {
    return { success: false, error: t('fraud.userNotFound') };
  }

  const billingInfo = buildBillingInfo(current);
  const systemPrompt = buildFraudSystemPrompt();
  const userPrompt = buildFraudUserPrompt(billingInfo);

  let lastError: string = '';

  for (const model of models) {
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const res = await httpRequest(getFraudChatUrl(model.endpoint || ''), {
          method: 'POST',
          timeoutMs: 30000,
          headers: {
            Authorization: `Bearer ${model.apiKey || 'none'}`,
            'Content-Type': 'application/json',
          },
          body: {
            model: model.config?.modelId || model.name,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 1024,
            temperature: 0.1,
          },
        });

        const aiReply = (res.data as any)?.choices?.[0]?.message?.content || '';
        const result = parseFraudResult(aiReply);

        if (result.isSuspicious) {
          current.fraudFlag = true;
          current.fraudReason = result.reasons.join('; ') || t('fraud.suspiciousBilling');
          current.fraudDetectedAt = new Date();
          await userRepo.save(current);
        } else if (current.fraudFlag) {
          current.fraudFlag = false;
          current.fraudReason = undefined;
          current.fraudDetectedAt = undefined;
          await userRepo.save(current);
        }

        return {
          success: true,
          userId: current.id,
          fraudScore: result.fraudScore,
          isSuspicious: result.isSuspicious,
          riskCategory: result.riskCategory,
          reasons: result.reasons,
          signals: result.signals,
        };
      } catch (err: any) {
        lastError = String(err?.message || t('fraud.scanFailed'));
        console.error(
          `[fraudService:runFraudScanForUser] model="${model.name}" attempt ${attempt}/10 failed:`,
          lastError
        );
        if (attempt < 10) {
          await delay(Math.min(1000 * Math.pow(2, attempt - 1), 30000));
        }
      }
    }
  }

  return { success: false, error: lastError };
}
