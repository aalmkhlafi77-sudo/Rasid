function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      let text = '';
      let dots = 0;
      while (i < input.length && /[0-9.]/.test(input[i])) {
        if (input[i] === '.') dots += 1;
        text += input[i++];
      }
      if (dots > 1 || text === '.') throw new Error('Invalid number');
      tokens.push({ type: 'number', value: Number(text) });
      continue;
    }
    if (ch === 'R' || ch === 'r') {
      let text = 'R';
      i += 1;
      const start = i;
      while (i < input.length && /[0-9]/.test(input[i])) text += input[i++];
      if (i === start) throw new Error('Invalid result reference');
      tokens.push({ type: 'result', value: text });
      continue;
    }
    if ('+-*/()%'.includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i += 1;
      continue;
    }
    if (ch === '\u00d7') { tokens.push({ type: '*', value: '*' }); i += 1; continue; }
    if (ch === '\u00f7') { tokens.push({ type: '/', value: '/' }); i += 1; continue; }
    throw new Error('Invalid character');
  }
  return tokens;
}

export function evaluateExpression(expression, resolveResult = () => undefined) {
  const tokens = tokenize(String(expression || ''));
  let pos = 0;

  function peek(type) { return tokens[pos]?.type === type; }
  function take(type) {
    if (!peek(type)) return false;
    pos += 1;
    return true;
  }

  function primary() {
    if (take('(')) {
      const value = additive();
      if (!take(')')) throw new Error('Missing parenthesis');
      return value;
    }
    if (take('-')) return -primary();
    if (take('+')) return primary();
    const token = tokens[pos++];
    if (!token) throw new Error('Incomplete expression');
    let value;
    if (token.type === 'number') value = token.value;
    else if (token.type === 'result') {
      value = resolveResult(token.value);
      if (value === undefined || value === null || !Number.isFinite(Number(value))) {
        throw new Error(`Unknown result ${token.value}`);
      }
      value = Number(value);
    } else {
      throw new Error('Invalid expression');
    }
    while (take('%')) value /= 100;
    return value;
  }

  function multiplicative() {
    let value = primary();
    while (peek('*') || peek('/')) {
      const op = tokens[pos++].type;
      const right = primary();
      if (op === '*') value *= right;
      else {
        if (right === 0) throw new Error('Division by zero');
        value /= right;
      }
    }
    return value;
  }

  function additive() {
    let value = multiplicative();
    while (peek('+') || peek('-')) {
      const op = tokens[pos++].type;
      const right = multiplicative();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  if (tokens.length === 0) throw new Error('Empty expression');
  const value = additive();
  if (pos !== tokens.length) throw new Error('Invalid expression');
  if (!Number.isFinite(value)) throw new Error('Invalid numeric result');
  return value;
}
