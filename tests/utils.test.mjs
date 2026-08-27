import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeList, escapeHtml, riskScore, riskBand } from '../src/utils.js';

test('normalizeList trims and deduplicates exact values',()=>assert.deepEqual(normalizeList('alpha, beta, alpha'),['alpha','beta']));
test('escapeHtml neutralizes HTML metacharacters',()=>assert.equal(escapeHtml('<script>"x"</script>'),'&lt;script&gt;&quot;x&quot;&lt;/script&gt;'));
test('risk scoring and bands are deterministic',()=>{ assert.equal(riskScore('likely','high'),12); assert.equal(riskBand(12),'high'); assert.equal(riskBand(16),'critical'); });
