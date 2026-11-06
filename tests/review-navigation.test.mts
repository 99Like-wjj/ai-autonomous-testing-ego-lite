import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPosition, filteredNeighbor } from '../src/review-ui/reading-position.js';
import { makeReviewFeedback, feedbackFromText } from '../src/contracts/review-feedback.mjs';
import { reviewDocuments } from '../src/report/review-feedback-document.mjs';

test('filtered navigation stops at both boundaries, handles zero/single matches and a hidden current item', () => {
  const filtered = ['second', 'fourth'];
  assert.equal(filteredNeighbor(filtered, 0, -1), undefined);
  assert.equal(filteredNeighbor(filtered, 1, 1), undefined);
  assert.equal(filteredNeighbor(filtered, 0, 1), 'fourth');
  assert.equal(filteredNeighbor(filtered, -1, 1), undefined);
  assert.equal(filteredNeighbor(['only'], 0, 1), undefined);
  assert.equal(filteredNeighbor([], 0, -1), undefined);
  assert.equal(boundedPosition(700, 400), 400); assert.equal(boundedPosition(-1, 400), 0); assert.equal(boundedPosition(NaN, 400), 0);
});
test('comment-only exports retain scoped comments or just the overall opinion, with no reviewed-pass payload', () => {
  const identity = { cases: { projectId: 'synthetic-review', caseVersion: 1, sha256: 'a'.repeat(64) }, pointIds: ['first', 'second'] };
  const opinion = makeReviewFeedback(identity, 0, 'changes_requested', ['second'], [{ pointId: 'second', text: '请补充必要边界。' }]);
  const docs = reviewDocuments(opinion, identity, 'Synthetic', new Map([['second', 'Synthetic second']]));
  assert.equal(docs.json.includes('first'), false); assert.deepEqual(feedbackFromText(docs.html), opinion);
  const overall = makeReviewFeedback(identity, 0, 'comment_only', [], [{ pointId: null, text: '整批意见。' }]);
  assert.deepEqual(feedbackFromText(reviewDocuments(overall, identity, 'Synthetic', new Map()).html), overall);
  assert.throws(() => makeReviewFeedback(identity, 0, 'comment_only', [], []), /填写意见/);
});
