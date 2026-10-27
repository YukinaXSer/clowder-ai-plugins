/** Only this fixed, non-sensitive validation feedback crosses the native boundary. */
export const evidenceMismatchMessage = 'Evidence must quote one continuous passage from the current issue title or body exactly. Copy the original text, including punctuation and Markdown; put explanations in reason, then submit again.';
export class AnalysisEvidenceError extends Error {
  readonly code = 'analysis_evidence_mismatch';
  constructor() { super(evidenceMismatchMessage); }
}
