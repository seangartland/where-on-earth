import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.location = { search: '' };

// Minimal DOM stub: just enough node building for passportUnvisitedSlot,
// so the leak assertion runs against the slot's real rendered text.
class StubClassList {
  constructor(el) { this.el = el; }
  _set() { return new Set(this.el.className.split(/\s+/).filter(Boolean)); }
  _write(s) { this.el.className = [...s].join(' '); }
  toggle(name) {
    const s = this._set();
    const on = !s.has(name);
    if (on) s.add(name); else s.delete(name);
    this._write(s);
    return on;
  }
  contains(name) { return this._set().has(name); }
  add(name) { const s = this._set(); s.add(name); this._write(s); }
}
class StubEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this._text = '';
    this.classList = new StubClassList(this);
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  append(...kids) { this.children.push(...kids); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  querySelector() { return null; }
}
globalThis.document = { createElement: (tag) => new StubEl(tag) };

const { passportUnvisitedSlot } = await import('../src/meta/passport.js');
const { passportPackSections, packCardNumber, formatPackCardNumber } = await import('../src/meta/passport-packs.js');
const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url)));
const cities = load('locations.json');
const landmarks = load('locations-landmarks-sol.json');

test('card numbers are zero-padded to three digits', () => {
  assert.equal(formatPackCardNumber(5), '005');
  assert.equal(formatPackCardNumber(42), '042');
  assert.equal(formatPackCardNumber(138), '138');
  assert.equal(formatPackCardNumber(207), '207');
});

test('packCardNumber matches the position passportPackSections renders', () => {
  const { sections } = passportPackSections(cities, landmarks, {});
  for (const section of sections) {
    for (const index of [0, 1, Math.floor(section.items.length / 2), section.items.length - 1]) {
      const item = section.items[index];
      assert.equal(packCardNumber(cities, landmarks, section.type, item.id), index + 1, `${section.type}/${item.id}`);
    }
  }
  assert.equal(packCardNumber(cities, landmarks, 'capitals', 'abuja-ng'), 2);
  assert.equal(packCardNumber(cities, landmarks, 'landmarks', 'angkor-wat'), 11);
  assert.equal(packCardNumber(cities, landmarks, 'capitals', 'angkor-wat'), null);
  assert.equal(packCardNumber(cities, landmarks, 'capitals', 'no-such-id'), null);
});

test('an unvisited slot renders only its number, never the place name or country', () => {
  const item = cities.find((entry) => entry.id === 'abuja-ng');
  const number = packCardNumber(cities, landmarks, 'capitals', item.id);
  const slot = passportUnvisitedSlot({ item, country: 'Nigeria', visited: false }, 'World Capitals', number);
  assert.ok(slot.textContent.includes('002'), slot.textContent);
  assert.ok(!slot.textContent.includes('Abuja'), slot.textContent);
  assert.ok(!slot.textContent.includes('Nigeria'), slot.textContent);
  assert.equal(slot.getAttribute('aria-label'), 'World Capitals card 002, not yet collected');
  assert.ok(!slot.getAttribute('aria-label').includes('Abuja'));
  assert.ok(!slot.getAttribute('aria-label').includes('Nigeria'));
  // Tapping reveals the pack and state only; the leak stays closed.
  slot.listeners.click();
  assert.ok(slot.textContent.includes('World Capitals pack · Not yet collected'), slot.textContent);
  assert.ok(!slot.textContent.includes('Abuja'), slot.textContent);
  assert.ok(!slot.textContent.includes('Nigeria'), slot.textContent);
});

test('an unvisited landmark slot is numbered within Landmarks, not globally', () => {
  const item = landmarks.find((entry) => entry.id === 'abu-simbel-temples');
  const number = packCardNumber(cities, landmarks, 'landmarks', item.id);
  assert.equal(number, 2);
  const slot = passportUnvisitedSlot({ item, country: 'Egypt', visited: false }, 'Landmarks', number);
  assert.ok(slot.textContent.includes('002'), slot.textContent);
  assert.ok(!slot.textContent.includes('Abu Simbel'), slot.textContent);
  assert.ok(!slot.textContent.includes('Egypt'), slot.textContent);
  assert.equal(slot.getAttribute('aria-label'), 'Landmarks card 002, not yet collected');
});
