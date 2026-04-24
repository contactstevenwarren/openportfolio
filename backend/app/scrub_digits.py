import re

# Mirrors frontend/app/lib/scrub.ts LONG_DIGIT_RUN.
_LONG_DIGIT_RUN = re.compile(r"\b\d{6,}(?!\.\d)\b")

_REDACTED = "[REDACTED]"


def scrub_digit_runs(text: str) -> tuple[str, int]:
    """Replace 6+ digit runs at word boundaries with [REDACTED], like paste scrub."""

    redactions = 0

    def _repl(_: re.Match[str]) -> str:
        nonlocal redactions
        redactions += 1
        return _REDACTED

    out = _LONG_DIGIT_RUN.sub(_repl, text)
    return out, redactions
