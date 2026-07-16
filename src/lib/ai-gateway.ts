import { GoogleGenerativeAI } from '@google/generative-ai';
import { OpenAI } from 'openai';
import { insforge } from './insforge';
import { decryptSecret } from './crypto';

export type EmailTone = 'professional' | 'friendly' | 'premium' | 'short' | 'formal';

export interface GenerateEmailParams {
  companyName: string;
  contactName: string;
  country?: string;
  productInterest?: string;
  website?: string;
  linkedIn?: string;
  tone: EmailTone;
  apiKey?: string; // Optional override
  userId?: string; // Whose stored AI settings to use
}

// Helper to clean and parse JSON response from LLMs
function cleanAndParseJSON(text: string) {
  let cleanText = text.trim();
  // Remove markdown code blocks if present
  if (cleanText.startsWith('```')) {
    const lines = cleanText.split('\n');
    if (lines[0].startsWith('```json') || lines[0].startsWith('```')) {
      lines.shift();
    }
    if (lines[lines.length - 1].startsWith('```')) {
      lines.pop();
    }
    cleanText = lines.join('\n').trim();
  }
  return JSON.parse(cleanText);
}

// Fetch the AI settings for a specific user.
async function getAISettings(userId?: string) {
  if (!userId) return null;
  try {
    const { data: settings } = await insforge.database
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    return settings;
  } catch (error) {
    console.error('Error fetching AI settings from DB:', error);
    return null;
  }
}

// Generic runner for AI requests
async function runAICompletion(options: {
  systemPrompt: string;
  userPrompt: string;
  apiKeyOverride?: string;
  userId?: string;
}): Promise<string> {
  const settings = await getAISettings(options.userId);
  // Normalise so both 'openai-compatible' (UI value) and 'openai_compatible' match.
  const provider = (settings?.ai_provider || 'google').replace(/-/g, '_');

  if (provider === 'openai_compatible') {
    const apiKey = options.apiKeyOverride || decryptSecret(settings?.openai_compatible_key) || process.env.OPENAI_API_KEY;
    const baseURL = settings?.openai_compatible_base_url || 'https://integrate.api.nvidia.com/v1';
    const model = settings?.openai_compatible_model || 'moonshotai/kimi-k2.6';
    const thinking = settings?.openai_compatible_thinking || false;

    if (!apiKey) {
      throw new Error('OpenAI-compatible API key is not configured.');
    }

    const openai = new OpenAI({
      apiKey,
      baseURL,
    });

    let systemInstruction = options.systemPrompt;
    if (thinking) {
      systemInstruction += '\nUse thinking / reasoning mode to carefully formulate your response before outputting.';
    }

    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: options.userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        throw new Error('Empty response from OpenAI-compatible provider');
      }
      return text;
    } catch (openaiError: any) {
      // Fallback if response_format JSON is not supported by the model
      if (openaiError?.message?.includes('format') || openaiError?.message?.includes('json_object')) {
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemInstruction + '\nReturn your response as a valid JSON object only. No markdown wrappers or extra text.' },
            { role: 'user', content: options.userPrompt }
          ],
          temperature: 0.7,
        });

        const text = response.choices[0]?.message?.content;
        if (!text) {
          throw new Error('Empty response from OpenAI-compatible provider (fallback)');
        }
        return text;
      }
      throw openaiError;
    }
  } else {
    // Default: Google Gemini
    const key = options.apiKeyOverride || decryptSecret(settings?.openai_key) || process.env.GEMINI_API_KEY;
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!key) {
      throw new Error('Gemini API key is not configured.');
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: defaultModel,
      systemInstruction: options.systemPrompt,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      }
    });

    const result = await model.generateContent(options.userPrompt);
    const text = result.response.text();
    if (!text) {
      throw new Error('Failed to generate content from Gemini');
    }
    return text;
  }
}

export async function generateOutreachEmail(params: GenerateEmailParams): Promise<{
  subject: string;
  body: string;
}> {
  const { companyName, contactName, country, productInterest, website, tone, apiKey, userId } = params;

  const toneInstructions: Record<EmailTone, string> = {
    professional: 'Use a formal, business-appropriate tone. Be concise and value-focused.',
    friendly: 'Use a warm, approachable tone. Show genuine interest in helping.',
    premium: 'Use an exclusive, premium tone. Emphasize quality and exclusivity.',
    short: 'Keep it extremely brief and direct. Get to the point quickly.',
    formal: 'Use a traditional, formal tone. Proper greetings and sign-offs.',
  };

  const systemPrompt = 'You are an expert B2B sales copywriter specializing in cold outreach emails for exporters and manufacturers.';
  const userPrompt = `Generate a personalized B2B cold outreach email for exporting/manufacturing context.

Context:
- Company: ${companyName}
- Contact: ${contactName}
- Country: ${country || 'Not specified'}
- Product Interest: ${productInterest || 'Not specified'}
- Website: ${website || 'Not available'}
- Tone: ${toneInstructions[tone] || toneInstructions.professional}

Requirements:
1. Subject line should be compelling and personalized (not clickbait)
2. Email body should be 1-2 short paragraphs
3. Include a clear, low-pressure call-to-action
4. Write as if you're reaching out to help their business
5. No generic templates - make it specific to their context
6. Maximum 150 words for the body

Output as JSON with keys "subject" and "body".`;

  const text = await runAICompletion({
    systemPrompt,
    userPrompt,
    apiKeyOverride: apiKey,
    userId,
  });

  return cleanAndParseJSON(text);
}

/**
 * Generate a REUSABLE email template. Unlike generateOutreachEmail (which fills
 * in a specific lead), this keeps {{placeholders}} in place so the template can
 * be personalised later for any lead.
 */
export async function generateEmailTemplate(params: {
  tone: string;
  category?: string;
  purpose?: string;
  apiKey?: string;
  userId?: string;
}): Promise<{ subject: string; body: string }> {
  const { tone, category, purpose, apiKey, userId } = params;

  const toneInstructions: Record<string, string> = {
    professional: 'Formal, business-appropriate, concise and value-focused.',
    casual: 'Relaxed and conversational, like writing to a peer. Friendly but still professional.',
    friendly: 'Warm and approachable, showing genuine interest in helping.',
    premium: 'Exclusive and high-end, emphasising quality and exclusivity.',
    short: 'Extremely brief and direct. Get to the point immediately.',
    formal: 'Traditional and formal, with proper greetings and sign-offs.',
  };

  const systemPrompt =
    'You are an expert B2B sales copywriter who writes reusable cold-outreach email templates for exporters and manufacturers.';
  const userPrompt = `Write a REUSABLE B2B outreach email template.

Tone: ${toneInstructions[tone] || toneInstructions.professional}
${category ? `Category/use case: ${category}` : ''}
${purpose ? `Specific purpose / what to say: ${purpose}` : ''}

CRITICAL formatting rules:
1. Do NOT use real names or companies. Use these exact merge placeholders where personalisation belongs:
   {{contact_name}}, {{company_name}}, {{country}}, {{product_interest}}
2. The greeting MUST use {{contact_name}} (e.g. "Dear {{contact_name}},").
3. Reference {{company_name}} at least once. Use {{country}} or {{product_interest}} when natural.
4. The "subject" should also be personalised with a placeholder, e.g. "Partnership Opportunity - {{company_name}}".
5. Keep the body to 2-3 short paragraphs with a clear, low-pressure call to action.
6. Separate paragraphs with a blank line. End with a sign-off line like "Best regards".

Output as JSON with keys "subject" and "body".`;

  const text = await runAICompletion({
    systemPrompt,
    userPrompt,
    apiKeyOverride: apiKey,
    userId,
  });

  return cleanAndParseJSON(text);
}

export async function generateFollowupEmail(params: {
  previousEmail: string;
  contactName: string;
  country?: string;
  productInterest?: string;
  type: 'no_reply' | 'no_open' | 'no_click';
  apiKey?: string;
  userId?: string;
}): Promise<{ subject: string; body: string }> {
  const { previousEmail, contactName, country, productInterest, type, apiKey, userId } = params;
  
  const typeInstructions = {
    no_reply: 'Send a soft, friendly reminder. Maybe they missed it or were busy.',
    no_open: 'Acknowledge that the previous email may not have reached them. Resend with a different subject.',
    no_click: 'Gently remind them about the value mentioned. Maybe the CTA wasn\'t clear enough.',
  };

  const systemPrompt = 'You are an expert B2B sales copywriter specializing in follow-up emails.';
  const userPrompt = `Generate a follow-up email for B2B outreach.

Context:
- Original email: ${previousEmail}
- Contact: ${contactName}
- Country: ${country || 'Not specified'}
- Product Interest: ${productInterest || 'Not specified'}
- Follow-up type: ${typeInstructions[type] || typeInstructions.no_reply}

Requirements:
1. Subject should reference the original email
2. Keep it short and non-pushy
3. Add value or new information if possible
4. Clear, low-pressure CTA
5. Maximum 100 words

Output as JSON with keys "subject" and "body".`;

  const text = await runAICompletion({
    systemPrompt,
    userPrompt,
    apiKeyOverride: apiKey,
    userId,
  });

  return cleanAndParseJSON(text);
}

export async function improveEmail(email: {
  subject: string;
  body: string;
  contactName: string;
  apiKey?: string;
  userId?: string;
}): Promise<{ subject: string; body: string }> {
  const { subject, body, contactName, apiKey, userId } = email;
  
  const systemPrompt = 'You are an expert B2B copywriter who improves email effectiveness.';
  const userPrompt = `Improve this B2B outreach email to make it more effective:

Subject: ${subject}
Body: ${body}
Contact: ${contactName}

Improve by:
- Making the subject more compelling
- Adding more personalization
- Strengthening the hook
- Making the CTA clearer
- Ensuring it sounds natural, not template-like

Output as JSON with keys "subject" and "body".`;

  const text = await runAICompletion({
    systemPrompt,
    userPrompt,
    apiKeyOverride: apiKey,
    userId,
  });

  return cleanAndParseJSON(text);
}

// Function to auto-map spreadsheet column headers to database lead fields
export async function mapImportHeaders(params: {
  headers: string[];
  sampleRows: string[][];
  userId?: string;
  extraFields?: { key: string; label: string; desc?: string }[];
}): Promise<Record<string, string | null>> {
  const { headers, sampleRows, userId, extraFields } = params;

  const targetFields = [
    { key: 'company_name', label: 'Company Name', desc: 'The name of the company or organization' },
    { key: 'contact_name', label: 'Contact Person', desc: 'Full name or first name of the contact person' },
    { key: 'email', label: 'Email Address', desc: 'Email address of the lead' },
    { key: 'phone', label: 'Phone Number', desc: 'Phone number or contact number' },
    { key: 'country', label: 'Country', desc: 'Country or region' },
    { key: 'website', label: 'Website', desc: 'Website URL of the company' },
    { key: 'linked_in', label: 'LinkedIn URL', desc: 'LinkedIn profile link' },
    { key: 'product_interest', label: 'Product Interest / HS Code / Description', desc: 'What products they are interested in, HS codes, or product description' },
    // Admin-defined custom fields appended so the AI can map to them too.
    ...(extraFields || []).map((f) => ({ key: f.key, label: f.label, desc: f.desc || f.label })),
  ];

  const systemPrompt = 'You are an AI data assistant. Your job is to match file column headers to lead database fields.';
  const userPrompt = `We need to map the column headers of an uploaded spreadsheet to our database fields.

Available Spreadsheet Headers:
${headers.map((h, i) => `- "${h}" (Index: ${i})`).join('\n')}

Sample Rows (first few rows of data to help understand context of each column):
${sampleRows.slice(0, 3).map((row, i) => `Row ${i + 1}: [${row.map(c => `"${c}"`).join(', ')}]`).join('\n')}

Database Target Fields to match to:
${targetFields.map(f => `- "${f.key}" (${f.label}): ${f.desc}`).join('\n')}

Rules:
1. For each target field, choose the spreadsheet header that matches it best.
2. If there is no matching header for a target field, set it to null.
3. Every target field must be present in the output JSON.
4. The output must be a single flat JSON object where the keys are the target database fields, and the values are the exact matching headers from the spreadsheet.

Example output:
{
  "company_name": "Company Name",
  "contact_name": "Contact Name",
  "email": "Email Address",
  "phone": "Phone",
  "country": "Country",
  "website": null,
  "linked_in": null,
  "product_interest": "HS Code"
}

Output as JSON with target database fields as keys.`;

  const text = await runAICompletion({
    systemPrompt,
    userPrompt,
    userId,
  });

  return cleanAndParseJSON(text);
}
