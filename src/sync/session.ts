let generation = 0;
let controller = new AbortController();
let enabled = false;
export function beginSession() { controller.abort(); controller = new AbortController(); enabled = true; return ++generation; }
export function endSession() { enabled = false; controller.abort(); generation++; }
export function sessionToken() { return generation; }
export function sessionActive(token: number) { return token === generation; }
export function syncEnabled() { return enabled; }
export function syncSignal() { return controller.signal; }
