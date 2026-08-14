function clone(value) {
  return structuredClone(value);
}

export function formatNumber(value, decimalsMode = 'auto') {
  if (!Number.isFinite(value)) return '---';
  if (decimalsMode === 'auto') {
    const normalized = Number(value.toPrecision(12));
    return normalized.toLocaleString('en-US', { maximumFractionDigits: 12 });
  }
  const digits = Number(decimalsMode);
  if (![2, 4, 6].includes(digits)) throw new Error('Invalid decimals mode');
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export class UndoManager {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  checkpoint(state) {
    this.undoStack.push(clone(state));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(currentState) {
    if (this.undoStack.length === 0) return null;
    const previous = this.undoStack.pop();
    this.redoStack.push(clone(currentState));
    return clone(previous);
  }

  redo(currentState) {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop();
    this.undoStack.push(clone(currentState));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    return clone(next);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
