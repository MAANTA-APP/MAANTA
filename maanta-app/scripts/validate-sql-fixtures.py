import re, glob, sys
# Derive the real schema from the migrations: column names, and enumerated CHECK
# values. Then validate every INSERT in the given test files against both.
cols, checks = {}, {}
for f in sorted(glob.glob('supabase/migrations/*.sql')):
    src = open(f).read()
    for m in re.finditer(r'CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)\s*\((.*?)\n\);', src, re.S):
        t, body = m.group(1), m.group(2)
        for line in body.split('\n'):
            line = line.strip()
            if not line or line.startswith('--'): continue
            if re.match(r'(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|CONSTRAINT|EXCLUDE)\b', line, re.I): continue
            mm = re.match(r'"?(\w+)"?\s+\S', line)
            if mm: cols.setdefault(t, set()).add(mm.group(1))
        for cm in re.finditer(r'CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)', body, re.S):
            checks.setdefault((t, cm.group(1)), set(re.findall(r"'([^']+)'", cm.group(2))))
    for m in re.finditer(r'ALTER TABLE (?:IF EXISTS )?public\.(\w+)([^;]*);', src, re.S):
        for am in re.finditer(r'ADD COLUMN (?:IF NOT EXISTS )?(\w+)', m.group(2)):
            cols.setdefault(m.group(1), set()).add(am.group(1))

problems = 0
for path in sys.argv[1:]:
    src = open(path).read()
    for m in re.finditer(r'INSERT INTO public\.(\w+)\s*\(([^)]*)\)\s*\n?\s*VALUES\s*\(([^;]*?)\)\s*(?:RETURNING|;)', src, re.S):
        t = m.group(1)
        names = [c.strip() for c in m.group(2).split(',') if c.strip()]
        if t not in cols:
            print(f"  {path}: unknown table {t}"); problems += 1; continue
        for c in names:
            if c not in cols[t]:
                print(f"  {path}: {t}.{c} does not exist"); problems += 1
        # Split the VALUES tuple at top level, then check CHECK-constrained literals.
        vals, depth, cur = [], 0, ''
        for ch in m.group(3):
            if ch == '(' : depth += 1
            if ch == ')' : depth -= 1
            if ch == ',' and depth == 0: vals.append(cur.strip()); cur = ''
            else: cur += ch
        vals.append(cur.strip())
        if len(vals) == len(names):
            for c, v in zip(names, vals):
                allowed = checks.get((t, c))
                lit = re.fullmatch(r"'([^']*)'", v)
                if allowed and lit and lit.group(1) not in allowed:
                    print(f"  {path}: {t}.{c} = '{lit.group(1)}' not in {sorted(allowed)}"); problems += 1
print("OK — all INSERT columns and CHECK-constrained literals match the real schema"
      if problems == 0 else f"{problems} problem(s)")
sys.exit(1 if problems else 0)
