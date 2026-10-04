/* Shared by the Worker's modules. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (status, message) => new HttpError(status, message);
