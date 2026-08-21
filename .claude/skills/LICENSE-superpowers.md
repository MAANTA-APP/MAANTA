# Attribution

The four skills in this directory marked "Adapted from obra/superpowers" are
MAANTA-adapted derivatives of skills in
[`obra/superpowers`](https://github.com/obra/superpowers), used under the MIT
License:

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

What was deliberately **not** vendored, and why: the superpowers mandatory
pipeline (brainstorming → worktree → subagent execution → branch finish).
MAANTA already has a mandatory process — the CLAUDE.md execution format, the
one-mode-per-session role system, the drift register and the durable-artifact
rule — and a second enforced pipeline is a second place for process to drift.
See `docs/ops/claude-stack-setup.md` ("Running Superpowers on this repo") for
the full evaluation. Where any skill here and CLAUDE.md disagree, CLAUDE.md
wins.
