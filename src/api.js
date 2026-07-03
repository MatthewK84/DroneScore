/**
 * API client. One request helper wraps fetch with consistent JSON
 * handling and a typed error, so components stay free of fetch details.
 * The session cookie rides on every call via credentials: "include".
 */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status HTTP status, or 0 for a network failure.
   */
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
    throw new ApiError(message, response.status);
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
