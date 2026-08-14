export class ResultStore {
  constructor() {
    this.results = [];
    this.nextId = 1;
  }

  add(value, expression) {
    if (!Number.isFinite(value)) throw new Error('Invalid result value');
    const item = {
      id: this.nextId,
      label: `R${this.nextId}`,
      value,
      expression,
      createdAt: Date.now(),
      pinned: false,
      selected: false
    };
    this.nextId += 1;
    this.results.push(item);
    return item;
  }

  list() {
    return this.results;
  }

  get(label) {
    return this.results.find((item) => item.label === label);
  }

  toggleSelect(label) {
    const item = this.get(label);
    if (!item) return false;
    item.selected = !item.selected;
    return item.selected;
  }

  selectAll() {
    this.results.forEach((item) => { item.selected = true; });
  }

  clearSelection() {
    this.results.forEach((item) => { item.selected = false; });
  }

  getSelected() {
    return this.results.filter((item) => item.selected);
  }

  togglePin(label) {
    const item = this.get(label);
    if (!item) return false;
    item.pinned = !item.pinned;
    return item.pinned;
  }

  remove(label) {
    const before = this.results.length;
    this.results = this.results.filter((item) => item.label !== label);
    return this.results.length !== before;
  }

  clear() {
    this.results = [];
    this.nextId = 1;
  }

  snapshot() {
    return {
      nextId: this.nextId,
      results: this.results.map((item) => ({ ...item }))
    };
  }

  restore(snapshot) {
    this.nextId = snapshot.nextId;
    this.results = snapshot.results.map((item) => ({ ...item }));
  }
}

export function calculateGroup(results, operation) {
  if (!Array.isArray(results) || results.length < 2) {
    throw new Error('Select at least two results');
  }
  const labels = results.map((item) => item.label);
  const values = results.map((item) => Number(item.value));
  if (values.some((value) => !Number.isFinite(value))) throw new Error('Invalid group value');

  let value;
  let expression;
  switch (operation) {
    case 'add':
      value = values.reduce((sum, item) => sum + item, 0);
      expression = labels.join(' + ');
      break;
    case 'subtract':
      value = values.slice(1).reduce((total, item) => total - item, values[0]);
      expression = labels.join(' - ');
      break;
    case 'multiply':
      value = values.reduce((total, item) => total * item, 1);
      expression = labels.join(' * ');
      break;
    case 'divide':
      if (values.slice(1).some((item) => item === 0)) throw new Error('Division by zero');
      value = values.slice(1).reduce((total, item) => total / item, values[0]);
      expression = labels.join(' / ');
      break;
    case 'average':
      value = values.reduce((sum, item) => sum + item, 0) / values.length;
      expression = `avg(${labels.join(', ')})`;
      break;
    default:
      throw new Error('Unknown group operation');
  }
  if (!Number.isFinite(value)) throw new Error('Invalid group result');
  return { value, expression };
}
