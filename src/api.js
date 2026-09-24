/**
 * API client. One request helper wraps fetch with consistent JSON
 * handling and a typed error, so components stay free of fetch details.
 * The session cookie rides on every call via credentials: "include".
 */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status HTTP status, or 0 for a network failure.
   * @param {object | null} [details] Parsed error body, when the server sent one.
   */
  constructor(message, status, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * @param {string} method
 * @param {string} path Path under /api, starting with a slash.
 * @param {object} [body]
 * @returns {Promise<object>} Parsed JSON response.
 */
async function request(method, path, body) {
  const options = { method, credentials: "include" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError("Network error. Check your connection.", 0);
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, data);
  }
  return data ?? {};
}

/** @returns {Promise<{ role: string }>} */
export function getSession() {
  return request("GET", "/auth/session");
}

/** @returns {Promise<{ role: string }>} */
export function login(password) {
  return request("POST", "/auth/login", { password });
}

/** @returns {Promise<object>} */
export function logout() {
  return request("POST", "/auth/logout");
}

/** @returns {Promise<{ drones: object[] }>} */
export function listDrones() {
  return request("GET", "/drones");
}

/** @returns {Promise<object>} */
export function addDrone(drone) {
  return request("POST", "/drones", drone);
}

/** @returns {Promise<object>} */
export function deleteDrone(id) {
  return request("DELETE", `/drones/${id}`);
}

/** @returns {Promise<{ interceptors: object[] }>} */
export function listInterceptors() {
  return request("GET", "/interceptors");
}

/** @returns {Promise<object>} */
export function addInterceptor(interceptor) {
  return request("POST", "/interceptors", interceptor);
}

/** @returns {Promise<object>} */
export function deleteInterceptor(id) {
  return request("DELETE", `/interceptors/${id}`);
}

/** @returns {Promise<{ day: object, engagements: object[], stats: object }>} */
export function getCurrentDay() {
  return request("GET", "/days/current");
}

/** @returns {Promise<{ days: object[] }>} */
export function listDays() {
  return request("GET", "/days");
}

/** @returns {Promise<object>} */
export function updateDay(id, patch) {
  return request("PUT", `/days/${id}`, patch);
}

/** @returns {Promise<object>} */
export function addEngagement(engagement) {
  return request("POST", "/engagements", engagement);
}

/** @returns {Promise<object>} */
export function updateEngagement(id, engagement) {
  return request("PUT", `/engagements/${id}`, engagement);
}

/** @returns {Promise<object>} */
export function deleteEngagement(id) {
  return request("DELETE", `/engagements/${id}`);
}

/** @returns {Promise<{ controlNumber: string }>} */
export function closeDay(id) {
  return request("POST", `/days/${id}/close`);
}

/** @returns {Promise<object>} */
export function reopenDay(id) {
  return request("POST", `/days/${id}/reopen`);
}

/** @returns {Promise<object>} */
export function emailWor(id) {
  return request("POST", `/days/${id}/wor/email`);
}

/**
 * Opens the latest WOR PDF for a day in a new tab. The browser sends
 * the session cookie automatically because the URL is same origin.
 * @param {number} id
 * @returns {void}
 */
export function openWor(id) {
  window.open(`/api/days/${id}/wor.pdf`, "_blank", "noopener");
}

/**
 * Opens the final evaluation report for every closed day in a range.
 * Blank bounds leave that end of the range open.
 * @param {string} from YYYY-MM-DD, or "".
 * @param {string} to YYYY-MM-DD, or "".
 * @returns {void}
 */
export function openFinalReport(from, to) {
  const pairs = [["from", from], ["to", to]].filter(([, value]) => value);
  const query = pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  window.open(`/api/reports/final.pdf${query ? `?${query}` : ""}`, "_blank", "noopener");
}

/** @returns {Promise<{ location: string, weather: object|null, assessments: object[] }>} */
export function getConditions() {
  return request("GET", "/public/conditions");
}

/** @returns {Promise<{ day: object|null, engagements: object[], stats: object|null }>} */
export function getPublicDay() {
  return request("GET", "/public/day/current");
}

/** @returns {Promise<{ systems: object[], unassignedRuns: number }>} Criteria progress per interceptor. */
export function getPublicProgress() {
  return request("GET", "/public/progress");
}

/** @returns {Promise<{ events: object[] }>} */
export function listSchedule() {
  return request("GET", "/schedule");
}

/** @returns {Promise<object>} */
export function addScheduleEvent(event) {
  return request("POST", "/schedule", event);
}

/** @returns {Promise<object>} */
export function deleteScheduleEvent(id) {
  return request("DELETE", `/schedule/${id}`);
}

/** @returns {Promise<{ entries: object[] }>} */
export function listFeedback() {
  return request("GET", "/feedback");
}

/** @returns {Promise<{ entries: object[] }>} */
export function listFullFeedback() {
  return request("GET", "/feedback/full");
}

/** @returns {Promise<object>} */
export function addFeedback(entry) {
  return request("POST", "/feedback", entry);
}

/** @returns {Promise<object>} */
export function deleteFeedback(id) {
  return request("DELETE", `/feedback/${id}`);
}

/** @returns {Promise<{ catalog: object[], killChain: object[], groups: object[] }>} */
export function getCriteriaCatalog() {
  return request("GET", "/criteria/catalog");
}

/** @returns {Promise<{ benchmarks: object[] }>} */
export function listBenchmarks() {
  return request("GET", "/criteria/benchmarks");
}

/** @returns {Promise<object>} */
export function saveBenchmark(benchmark) {
  return request("PUT", "/criteria/benchmarks", benchmark);
}

/** @returns {Promise<object>} */
export function deleteBenchmark(id) {
  return request("DELETE", `/criteria/benchmarks/${id}`);
}

/**
 * Asks the server what the public UAS group bands imply for each range
 * benchmark. Nothing is stored by this call; the admin reviews the basis
 * and chooses what to accept.
 * @returns {Promise<{ derived: object[] }>}
 */
export function deriveBenchmarkDefaults(params) {
  return request("POST", "/criteria/benchmarks/derive", params);
}

/**
 * The C4 ETA 60/180 default parameters and the payload types a system can
 * carry, for the timeline preset form.
 * @returns {Promise<{ params: object, payloadTypes: string[], defaultPayloadTypes: string[] }>}
 */
export function getTimelineDefaults() {
  return request("GET", "/criteria/benchmarks/timeline-defaults");
}

/**
 * Resolves every timeline preset for a parameter set. Nothing is stored.
 * A 400 carries every validation error in `details.errors`.
 * @param {object} params TimelineParams, numbers or numeric strings.
 * @param {string[]} payloadTypes
 * @returns {Promise<{ rows: object[], milestones: object[] }>}
 */
export function deriveTimelinePresets(params, payloadTypes) {
  return request("POST", "/criteria/benchmarks/derive-timeline", { params, payloadTypes });
}

/**
 * Writes preset rows in one transaction. A 409 carries the rows that
 * would change in `details.conflicts`; resend with confirmOverwrite true.
 * @param {{ interceptorId: number | null, uasGroup: string, confirmOverwrite: boolean, items: object[] }} body
 * @returns {Promise<{ benchmarks: object[], written: number, unchanged: number }>}
 */
export function applyBenchmarksBulk(body) {
  return request("PUT", "/criteria/benchmarks/bulk", body);
}

/** @returns {Promise<object>} */
export function saveSystemProfile(interceptorId, profile) {
  return request("PUT", `/interceptors/${interceptorId}/profile`, { profile });
}

/**
 * The blank vendor data sheet. A plain link downloads it: the session
 * cookie rides along, and the server sends it as an attachment.
 */
export const VENDOR_TEMPLATE_URL = "/api/vendor-template.pdf";

/** @returns {string} Download link for a stored vendor data sheet. */
export function vendorDocumentUrl(documentId) {
  return `/api/vendor-documents/${documentId}/pdf`;
}

/**
 * Reads a completed vendor data sheet and returns what applying it would
 * change. Nothing is written to the profile by this call.
 * @returns {Promise<object>}
 */
export function uploadVendorSheet(interceptorId, filename, base64) {
  return request("POST", `/interceptors/${interceptorId}/vendor-sheet`, { filename, data: base64 });
}

/** @returns {Promise<{ written: number }>} Applies a previewed sheet to the profile. */
export function applyVendorSheet(documentId) {
  return request("POST", `/vendor-documents/${documentId}/apply`);
}

/** @returns {Promise<{ documents: object[] }>} Data sheets received for a system. */
export function listVendorDocuments(interceptorId) {
  return request("GET", `/interceptors/${interceptorId}/vendor-documents`);
}

/** @returns {Promise<object>} */
export function saveDayMetrics(dayId, metrics) {
  return request("PUT", `/days/${dayId}/metrics`, metrics);
}

/** @returns {Promise<{ mops: object[], compliance: object[], summary: object }>} */
export function getDayCriteria(dayId) {
  return request("GET", `/days/${dayId}/criteria`);
}

/** @returns {Promise<{ profiles: object[] }>} */
export function listTestProfiles() {
  return request("GET", "/test-profiles");
}

/** @returns {Promise<object>} */
export function addTestProfile(profile) {
  return request("POST", "/test-profiles", profile);
}

/** @returns {Promise<object>} */
export function updateTestProfile(id, profile) {
  return request("PUT", `/test-profiles/${id}`, profile);
}

/** @returns {Promise<object>} */
export function deleteTestProfile(id) {
  return request("DELETE", `/test-profiles/${id}`);
}
