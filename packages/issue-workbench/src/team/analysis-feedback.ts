/** Only fixed, non-sensitive validation feedback crosses the native boundary. */
const messages = {
  analysis_evidence_mismatch: 'Evidence must quote one continuous passage from the current issue title or body exactly. Copy the original text, including punctuation and Markdown; put explanations in reason, then submit again.',
  analysis_input_invalid: 'Analysis input does not match the tool schema. Check every field before submitting again: reason must contain 1–1000 characters, evidence 1–1200 characters, workaround at most 1000 characters, and category 1–80 characters. score must be an integer from 1 to 10 or null; blocksRuntime must be boolean. Use only the declared fields and enum values. Shorten overlong text yourself; nothing was saved or truncated.',
} as const;

export function analysisFeedbackMessage(code: unknown): string | undefined {
  return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code as keyof typeof messages] : undefined;
}

export class AnalysisValidationError extends Error {
  constructor(readonly code: keyof typeof messages) { super(messages[code]); }
}
