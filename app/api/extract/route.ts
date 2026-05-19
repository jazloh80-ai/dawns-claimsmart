import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a receipt data extraction specialist. When given a receipt image, extract the following fields and return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Required fields:
- date: The transaction date in YYYY-MM-DD format. If unclear, use today's date.
- merchant: The business or merchant name exactly as shown.
- category: One of exactly these values: "Food & Dining", "Travel", "Accommodation", "Office Supplies", "Entertainment", "Healthcare", "Transportation", "Other".
- amount: The total amount as a number (e.g. 42.50). Use the grand total including tax and tips.
- currency: The 3-letter ISO currency code (e.g. USD, GBP, EUR, AUD, CAD, SGD, HKD, JPY).

Return exactly this shape:
{"date":"YYYY-MM-DD","merchant":"string","category":"string","amount":0.00,"currency":"XXX"}`;

const SUPPORTED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!SUPPORTED_MEDIA_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Use JPEG, PNG, GIF, or WEBP.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64Data = Buffer.from(bytes).toString('base64');
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Cache the system prompt — it's identical across every receipt extraction request
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: 'Extract the receipt data from this image and return the JSON object.',
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from Claude' }, { status: 500 });
    }

    // Strip any accidental markdown fences before parsing
    const raw = textBlock.text.replace(/```(?:json)?/gi, '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse receipt data from response' }, { status: 500 });
    }

    const extracted = JSON.parse(jsonMatch[0]);
    return NextResponse.json(extracted);
  } catch (err) {
    console.error('[extract]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
