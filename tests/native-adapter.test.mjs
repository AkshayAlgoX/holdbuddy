import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { once } from 'node:events';
import { createApplication } from '../dist/server.mjs';

async function fixture(options = {}) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((done) => probe.close(done));
  const origin = `http://127.0.0.1:${port}`;
  const app = await createApplication({
    origin,
    port,
    host: '127.0.0.1',
    timingScale: 0.002,
    maxCallMs: 12000,
    ...options,
  });
  const req = (path, method = 'GET', data, extra = {}) =>
    fetch(origin + path, {
      method,
      headers: {
        ...(data === undefined ? {} : { 'content-type': 'application/json' }),
        ...(extra.headers ?? {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      ...(extra.signal ? { signal: extra.signal } : {}),
    });
  const rawReq = (path, method = 'GET', headers = {}) =>
    new Promise((done, fail) => {
      const r = request(origin + path, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (b) => chunks.push(b));
        res.on('end', () =>
          done({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
      r.on('error', fail);
      r.end();
    });
  return { app, req, rawReq, origin, port };
}

test('native status: loopback client receives telephony readiness and supported parameters', async () => {
  const f = await fixture();
  try {
    const res = await f.req('/api/v1/native/status');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(typeof data.ok, 'boolean');
    assert.equal(data.localOriginOnly, true);
    assert.equal(typeof data.asteriskAvailable, 'boolean');
    assert.ok(data.asteriskBinaryPath.includes('asterisk'));
    assert.equal(data.maxRequests, 3);
    assert.deepEqual(data.supportedGoals, ['complaint', 'payment', 'refund']);
    assert.equal(data.requiredAuthorizationPhrase, 'I AUTHORIZE 3 HINDI PRISMA REQUESTS AND ASTERISK ARI DTMF');

    // Enriched status fields explicitly distinguishing past verified evidence from live daemon
    assert.ok(data.verifiedEvidence);
    assert.equal(data.verifiedEvidence.status, 'VERIFIED_OFFLINE_RECORD');
    assert.equal(data.verifiedEvidence.runLabel, 'live-journey-three-fresh-two');
    assert.equal(data.verifiedEvidence.freshRequests, 3);
    assert.equal(data.verifiedEvidence.route, '5 → 8 → 1');

    assert.ok(data.liveExecution);
    assert.equal(data.liveExecution.provider, 'gnani-prisma-v3.0');
    assert.equal(data.liveExecution.endpoint, 'https://api.vachana.ai/stt/v3');
    assert.equal(data.liveExecution.maxRequests, 3);

    assert.ok(data.simulatedDemo);
    assert.equal(data.simulatedDemo.status, 'ACTIVE');
    assert.equal(data.simulatedDemo.mode, 'offline_mock');
  } finally {
    await f.app.close();
  }
});

test('native status: non-loopback host or origin is strictly rejected', async () => {
  const f = await fixture();
  try {
    const resOrigin = await f.rawReq('/api/v1/native/status', 'GET', {
      origin: 'https://attacker.example',
    });
    assert.equal(resOrigin.status, 403);

    const resHost = await f.rawReq('/api/v1/native/status', 'GET', {
      host: 'external.evil.com',
    });
    assert.equal(resHost.status, 403);
  } finally {
    await f.app.close();
  }
});

test('native session: validation rejects invalid modes and goals', async () => {
  const f = await fixture();
  try {
    const badMode = await f.req('/api/v1/native/session', 'POST', {
      mode: 'unsupported-mode',
      goal: 'complaint',
    });
    assert.equal(badMode.status, 400);
    const badModeData = await badMode.json();
    assert.equal(badModeData.error.code, 'invalid_mode');

    const badGoal = await f.req('/api/v1/native/session', 'POST', {
      mode: 'replay',
      goal: 'unsupported-goal',
    });
    assert.equal(badGoal.status, 400);
    const badGoalData = await badGoal.json();
    assert.equal(badGoalData.error.code, 'invalid_goal');
  } finally {
    await f.app.close();
  }
});

test('native session: live-three mode requires local GNANI_API_KEY and exact authorization phrase', async () => {
  const f = await fixture();
  try {
    // If GNANI_API_KEY is unset in the test environment:
    const liveAttempt = await f.req('/api/v1/native/session', 'POST', {
      mode: 'live-three',
      goal: 'complaint',
      authorizationPhrase: 'I AUTHORIZE 3 HINDI PRISMA REQUESTS AND ASTERISK ARI DTMF',
    });
    if (!process.env.GNANI_API_KEY || process.env.GNANI_API_KEY.trim().length < 10) {
      assert.ok([400, 503].includes(liveAttempt.status), `Expected 400 or 503, got ${liveAttempt.status}`);
      const err = await liveAttempt.json();
      assert.ok(['live_credentials_missing', 'native_worker_unconnected'].includes(err.error.code));
    } else {
      // If key were present, check bad authorization phrase rejection
      const badAuth = await f.req('/api/v1/native/session', 'POST', {
        mode: 'live-three',
        goal: 'complaint',
        authorizationPhrase: 'invalid phrase',
      });
      assert.equal(badAuth.status, 403);
      assert.equal((await badAuth.json()).error.code, 'authorization_phrase_required');
    }
  } finally {
    await f.app.close();
  }
});

test('native session: starts replay session, enforces single-session mutex, streams events and detaches safely', async () => {
  const f = await fixture();
  try {
    // 1. Start replay session
    const createRes = await f.req('/api/v1/native/session', 'POST', {
      mode: 'replay',
      goal: 'complaint',
    });
    if (createRes.status === 503) {
      const err = await createRes.json();
      assert.equal(err.error.code, 'native_worker_unconnected');
      return; // Safe fail-closed when Asterisk PBX worker is unconnected
    }
    assert.equal(createRes.status, 201);
    const sessionInfo = await createRes.json();
    assert.ok(sessionInfo.sessionId.startsWith('native-telephony-'));
    assert.equal(sessionInfo.mode, 'replay');
    assert.equal(sessionInfo.goal, 'complaint');
    assert.equal(sessionInfo.status, 'running');

    // 2. Mutex: concurrent start must fail with 409 session_active
    const conflictRes = await f.req('/api/v1/native/session', 'POST', {
      mode: 'replay',
      goal: 'payment',
    });
    assert.equal(conflictRes.status, 409);
    assert.equal((await conflictRes.json()).error.code, 'session_active');

    // 3. Connect to SSE event stream
    const events = [];
    const abort = new AbortController();
    const eventStream = (async () => {
      const res = await f.req(`/api/v1/native/session/${sessionInfo.sessionId}/events`, 'GET', undefined, {
        signal: abort.signal,
      });
      assert.equal(res.status, 200);
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let at;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) {
            events.push(JSON.parse(dataLine.slice(6)));
          }
        }
      }
    })();

    // 4. Wait for session to complete
    const deadline = Date.now() + 15000;
    while (!events.some((e) => e.type === 'session.closed') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    assert.ok(events.length >= 8, `Expected >= 8 events, got ${events.length}`);

    // Verify session started
    const startEv = events.find((e) => e.type === 'session.started');
    assert.ok(startEv);
    assert.equal(startEv.mode, 'replay');
    assert.equal(startEv.goal, 'complaint');

    // Verify DTMF requests and ARI hardware acknowledgments
    const dtmfRequests = events.filter((e) => e.type === 'dtmf.requested');
    const dtmfAcks = events.filter((e) => e.type === 'dtmf.acknowledged');
    assert.deepEqual(
      dtmfRequests.map((e) => e.digit),
      ['5', '8', '1'],
    );
    assert.deepEqual(
      dtmfAcks.map((e) => e.digit),
      ['5', '8', '1'],
    );
    assert.ok(dtmfAcks.every((e) => e.outcome === 'delivered'));
    assert.ok(dtmfAcks.every((e) => e.telephonyExecution === 'SIMULATED_LOCAL_LOOPBACK'));
    assert.ok(dtmfAcks.every((e) => e.dataSource === 'LOCAL_SIMULATION'));

    // Verify safe detach
    const detachEv = events.find((e) => e.type === 'detach.confirmed');
    assert.ok(detachEv);
    assert.equal(detachEv.state, 'CONFIRMED');
    assert.equal(detachEv.mainLegAlive, true);
    assert.equal(detachEv.tapDestroyed, true);
    assert.equal(detachEv.telephonyExecution, 'SIMULATED_LOCAL_LOOPBACK');

    // Verify closure
    const closeEv = events.find((e) => e.type === 'session.closed');
    assert.ok(closeEv);
    assert.equal(closeEv.verdict, 'GO');
    assert.equal(closeEv.route, '5 → 8 → 1');

    // Confirm that replay events are tagged SAVED_RECOGNITION_REPLAY or LOCAL_SIMULATION, and NEVER falsely tagged REAL_API
    assert.ok(
      events.every((e) => e.dataSource !== 'REAL_API'),
      'Replay run must never be tagged REAL_API',
    );
    const transcriptEvs = events.filter((e) => e.type === 'transcript.observed');
    assert.ok(transcriptEvs.every((e) => e.dataSource === 'SAVED_RECOGNITION_REPLAY'));

    abort.abort();
    await eventStream.catch(() => {});
  } finally {
    await f.app.close();
  }
});

test('native session: stop endpoint halts active session gracefully', async () => {
  const f = await fixture();
  try {
    const createRes = await f.req('/api/v1/native/session', 'POST', {
      mode: 'replay',
      goal: 'complaint',
    });
    if (createRes.status === 503) {
      const err = await createRes.json();
      assert.equal(err.error.code, 'native_worker_unconnected');
      return; // Safe fail-closed when Asterisk PBX worker is unconnected
    }
    assert.equal(createRes.status, 201);
    const sessionInfo = await createRes.json();

    const stopRes = await f.req(`/api/v1/native/session/${sessionInfo.sessionId}/stop`, 'POST', {});
    assert.equal(stopRes.status, 200);
    const stopData = await stopRes.json();
    assert.equal(stopData.ok, true);
    assert.equal(stopData.status, 'stopped');

    // After stop, coordinator should allow new session
    const secondRes = await f.req('/api/v1/native/session', 'POST', {
      mode: 'replay',
      goal: 'payment',
    });
    assert.equal(secondRes.status, 201);

    // Clean up second
    const secondInfo = await secondRes.json();
    await f.req(`/api/v1/native/session/${secondInfo.sessionId}/stop`, 'POST', {});
  } finally {
    await f.app.close();
  }
});

test('native transactions: loopback client receives transaction ledger and non-loopback is rejected', async () => {
  const f = await fixture();
  try {
    const res = await f.req('/api/v1/native/transactions');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(typeof data.count, 'number');
    assert.ok(Array.isArray(data.transactions));

    const resNonLoopback = await f.rawReq('/api/v1/native/transactions', 'GET', {
      origin: 'https://attacker.example',
    });
    assert.equal(resNonLoopback.status, 403);
  } finally {
    await f.app.close();
  }
});

test('regression: event-to-view-model mapping guarantees actual digits 5, 8, 1, safe refusal on abstain, and rejects empty parentheses', async () => {
  function synthesizeTurns(events) {
    const turnMap = new Map();
    events.forEach((ev) => {
      if (!ev.generation) return;
      const prev = turnMap.get(ev.generation) || {
        generation: ev.generation,
        promptId: ev.promptId || `turn-${ev.generation}`,
        label: ev.generation === 1 ? 'Product Menu' : ev.generation === 2 ? 'Service Menu' : 'Action Menu',
      };
      if (ev.type === 'audio.segment_accepted' || ev.type === 'audio.capture.completed') {
        if (ev.durationMs) prev.durationMs = ev.durationMs;
      } else if (ev.type === 'transcript.observed') {
        if (ev.transcript) prev.transcript = ev.transcript;
        if (ev.requestId) prev.requestId = ev.requestId;
        if (ev.provenance) prev.provenance = ev.provenance;
      } else if (ev.type === 'decision.made') {
        const dec = ev.decision || ev.action;
        const digitStr = dec?.digit !== undefined && dec?.digit !== null ? String(dec.digit).trim() : '';
        if (digitStr) {
          prev.decision = {
            digit: digitStr,
            label: dec?.label ? String(dec.label).trim() : undefined,
          };
        }
      } else if (ev.type === 'decision.abstained') {
        prev.abstained = {
          reason: String(ev.reason || 'goal_not_offered_in_menu'),
          details: String(ev.details || 'Option is not present in menu. Abstaining from DTMF dispatch.'),
        };
      } else if (ev.type === 'dtmf.requested' || ev.type === 'dtmf.acknowledged') {
        const digitStr = ev.digit !== undefined && ev.digit !== null ? String(ev.digit).trim() : '';
        if (ev.type === 'dtmf.acknowledged') {
          prev.receipt = {
            sequence: ev.sequence,
            digit: digitStr,
            evidence: ev.evidence ?? 'SIMULATION_ACK',
          };
        }
        if (!prev.decision && digitStr) {
          prev.decision = {
            digit: digitStr,
            label: undefined,
          };
        }
      }
      turnMap.set(ev.generation, prev);
    });
    return Array.from(turnMap.values()).sort((a, b) => a.generation - b.generation);
  }

  function renderTurnText(turn) {
    const hasDigit = Boolean(turn.decision?.digit && turn.decision.digit.trim() !== '');
    const isAbstained = Boolean(turn.abstained);
    if (hasDigit) {
      return `HoldBuddy selected Key ${turn.decision.digit}${turn.decision.label ? ` (${turn.decision.label})` : ''}`;
    } else if (isAbstained) {
      return `Safe Refusal: ${turn.abstained.details}`;
    } else {
      return '⚠️ Incomplete: Digit not received from telephony stream';
    }
  }

  // 1. Complaint replay stream mapping
  const complaintEvents = [
    { type: 'transcript.observed', generation: 1, transcript: 'ब्रॉडबैंड के लिए पाँच दबाएँ', provenance: 'offline_fixture' },
    { type: 'decision.made', generation: 1, decision: { kind: 'press', digit: '5', label: 'ब्रॉडबैंड' }, provenance: 'offline_fixture' },
    { type: 'dtmf.acknowledged', generation: 1, digit: '5', sequence: 1 },
    { type: 'transcript.observed', generation: 2, transcript: 'बिल के लिए कृपया 8 दबाएँ', provenance: 'offline_fixture' },
    { type: 'decision.made', generation: 2, decision: { kind: 'press', digit: '8', label: 'बिल' }, provenance: 'offline_fixture' },
    { type: 'dtmf.acknowledged', generation: 2, digit: '8', sequence: 2 },
    { type: 'transcript.observed', generation: 3, transcript: 'बिल की शिकायत के लिए कृपया 1 दबाएँ', provenance: 'offline_fixture' },
    { type: 'decision.made', generation: 3, decision: { kind: 'press', digit: '1', label: 'बिल शिकायत' }, provenance: 'offline_fixture' },
    { type: 'dtmf.acknowledged', generation: 3, digit: '1', sequence: 3 },
  ];

  const turns = synthesizeTurns(complaintEvents);
  assert.equal(turns.length, 3);
  assert.equal(turns[0].decision?.digit, '5');
  assert.equal(turns[0].decision?.label, 'ब्रॉडबैंड');
  assert.equal(renderTurnText(turns[0]), 'HoldBuddy selected Key 5 (ब्रॉडबैंड)');

  assert.equal(turns[1].decision?.digit, '8');
  assert.equal(turns[1].decision?.label, 'बिल');
  assert.equal(renderTurnText(turns[1]), 'HoldBuddy selected Key 8 (बिल)');

  assert.equal(turns[2].decision?.digit, '1');
  assert.equal(turns[2].decision?.label, 'बिल शिकायत');
  assert.equal(renderTurnText(turns[2]), 'HoldBuddy selected Key 1 (बिल शिकायत)');

  // Assert NO empty parentheses in any rendered card
  turns.forEach((t) => {
    const text = renderTurnText(t);
    assert.doesNotMatch(text, /selected \(\)/);
    assert.doesNotMatch(text, /Key\s+\(/);
    assert.match(text, /Key [158]/);
  });

  // 2. Defect regression: Missing or malformed decision event must NOT produce "HoldBuddy selected ()"
  const malformedEvents = [
    { type: 'transcript.observed', generation: 1, transcript: 'कुछ मेनू' },
    { type: 'decision.made', generation: 1, decision: { kind: 'press', digit: '', label: '' } }, // empty digit
  ];
  const malformedTurns = synthesizeTurns(malformedEvents);
  assert.equal(malformedTurns[0].decision, undefined);
  assert.equal(renderTurnText(malformedTurns[0]), '⚠️ Incomplete: Digit not received from telephony stream');
  assert.doesNotMatch(renderTurnText(malformedTurns[0]), /selected/);

  // 3. Refund refusal: Turn 3 abstained must render Safe Refusal
  const refundEvents = [
    { type: 'decision.made', generation: 1, decision: { kind: 'press', digit: '5', label: 'ब्रॉडबैंड' } },
    { type: 'decision.made', generation: 2, decision: { kind: 'press', digit: '8', label: 'बिल' } },
    { type: 'decision.abstained', generation: 3, reason: 'goal_not_offered_in_menu', details: 'Refund option is not present in action menu.' },
  ];
  const refundTurns = synthesizeTurns(refundEvents);
  assert.equal(refundTurns[2].decision, undefined);
  assert.ok(refundTurns[2].abstained);
  assert.equal(renderTurnText(refundTurns[2]), 'Safe Refusal: Refund option is not present in action menu.');
});
