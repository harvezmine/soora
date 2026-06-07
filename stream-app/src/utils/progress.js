// Continue watching/reading progress — localStorage for instant access +
// backend sync when logged in. Key = "<section>:<id>" e.g. "anime:gachiakuta".
import { isLoggedIn, apiGetProgress, apiSetProgress, apiDeleteProgress } from './userApi';

const STORAGE_KEY = 'soora_progress';
const MAX = 60;

const readAll = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
};
const writeAll = (obj) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  window.dispatchEvent(new Event('progress-changed'));
};

/**
 * Save progress for a title.
 * entry: { section:'anime'|'movie'|'manga', id, title, image, ep?, chapter?,
 *          season?, episode?, time?, duration?, mediaType?, samehadakuId?, extra }
 */
export const saveProgress = (entry) => {
  if (!entry?.id || !entry?.section) return;
  const key = `${entry.section}:${entry.id}`;
  const all = readAll();
  all[key] = { ...entry, key, updatedAt: Date.now() };
  // cap: keep newest MAX
  const trimmed = Object.values(all)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX);
  const obj = {};
  trimmed.forEach((e) => { obj[e.key] = e; });
  writeAll(obj);
  if (isLoggedIn()) apiSetProgress({ ...entry, key });
};

export const getProgressList = (section) => {
  const list = Object.values(readAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return section ? list.filter((e) => e.section === section) : list;
};

export const removeProgress = (section, id) => {
  const key = `${section}:${id}`;
  const all = readAll();
  if (all[key]) { delete all[key]; writeAll(all); }
  if (isLoggedIn()) apiDeleteProgress(key);
};

/** Merge backend progress into local on login. */
export const syncProgressWithBackend = async () => {
  if (!isLoggedIn()) return;
  const remote = await apiGetProgress();
  if (!remote) return;
  const all = readAll();
  remote.forEach((e) => {
    if (!e?.key) return;
    const local = all[e.key];
    // keep whichever is newer
    if (!local || (e.updatedAt || 0) >= (local.updatedAt || 0)) all[e.key] = e;
  });
  // push local-only / newer-local up
  const remoteMap = new Map((remote || []).map((e) => [e.key, e]));
  Object.values(all).forEach((e) => {
    const r = remoteMap.get(e.key);
    if (!r || (e.updatedAt || 0) > (r.updatedAt || 0)) apiSetProgress(e);
  });
  writeAll(all);
};
