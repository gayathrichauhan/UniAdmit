// ── load-tests/admission_peak.js ─────────────────────────────────────────────
// Peak load test — 1,000 concurrent users checking application status
// Run: k6 run load-tests/admission_peak.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:8080';

export const options = {
  setupTimeout: '120s',
  stages: [
    { duration: '1m',    target: 100  }, // Ramp up slowly
    { duration: '1m30s', target: 300  },
    { duration: '1m30s', target: 500  },
    { duration: '2m',    target: 800  },
    { duration: '2m',    target: 1000 }, // Hold steady at 1k peak
    { duration: '30s',   target: 0    },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed:   ['rate<0.05'],
  },
};

// Login once — get token before test starts
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: 'loadtest@test.com',
      password: 'Test@1234'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const loginOk = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'has accessToken':  (r) => r.json('accessToken') !== undefined,
  });

  if (!loginOk) {
    console.error(`Login failed: ${loginRes.status} ${loginRes.body}`);
  }

  return { token: loginRes.json('accessToken') };
}

// 1,000 VUs all use the same token — tests Gateway JWT validation + Admission Service
export default function (data) {
  const headers = {
    'Authorization': `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // Hit GET /application/my — realistic peak load scenario
  // (students checking status during admission results announcement)
  const res = http.get(`${BASE_URL}/application/my`, { headers });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has data': (r) => r.body.length > 0,
  });

  if (res.status !== 200) {
    console.log(`FAILED STATUS: ${res.status} | BODY: ${res.body.substring(0, 200)}`);
  }

  // Method 2: Pause 500ms between requests to simulate realistic user pacing
  sleep(0.5);
}