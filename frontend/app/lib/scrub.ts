// Client-side PII scrub for pasted brokerage text (architecture Privacy).
//
// Replaces any run of 6+ consecutive digits with [REDACTED], unless the
// run is part of a decimal number (e.g. "123456.789" share counts, or a
// market value with comma separators like "$1,234,567.89" — commas break
// the run, so those never trip the regex in the first place).
//
// This runs BEFORE /api/extract. The LLM still sees a placeholder so it
// doesn't hallucinate a value. The user sees the scrubbed text implicitly
// via the review table -- rows whose shares or values were redacted will
// come back missing and the review UI highlights the gap.

const LONG_DIGIT_RUN = /\b\d{6,}(?!\.\d)\b/g;

export function scrubPaste(input: string): {
  text: string;
  redactions: number;
} {
  let redactions = 0;
  const text = input.replace(LONG_DIGIT_RUN, () => {
    redactions += 1;
    return '[REDACTED]';
  });
  return { text, redactions };
}
