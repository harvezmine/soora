// My List — localStorage for instant UI + backend sync when logged in.
import { isLoggedIn, apiGetMyList, apiAddMyList, apiRemoveMyList } from './userApi';

const STORAGE_KEY = 'ameflix_mylist';

const getList = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

const saveList = (list) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('mylist-changed'));
};

const normalize = (item) => ({
  id: item.id,
  title: item.title,
  image: item.image,
  type: item.type || '',
  listType: item.listType, // 'anime' | 'movie' | 'manga'
  mediaType: item.mediaType || '',
  tmdbId: item.tmdbId || null,
  rating: item.rating || null,
  releaseDate: item.releaseDate || '',
  addedAt: item.addedAt || Date.now(),
});

export const addToMyList = (item) => {
  const list = getList();
  if (list.some((i) => i.id === item.id && i.listType === item.listType)) return;
  const entry = normalize(item);
  list.unshift(entry);
  saveList(list);
  if (isLoggedIn()) apiAddMyList(entry); // fire-and-forget sync
};

export const removeFromMyList = (id, listType) => {
  saveList(getList().filter((i) => !(i.id === id && i.listType === listType)));
  if (isLoggedIn()) apiRemoveMyList(listType, id);
};

export const isInMyList = (id, listType) =>
  getList().some((i) => i.id === id && i.listType === listType);

export const getMyList = () => getList();
export const getMyListCount = () => getList().length;

/**
 * Sync with the backend on login: merge local + remote (dedup by id+listType),
 * push any local-only items up, and replace the local cache with the union.
 * Called once after login (from AuthContext).
 */
export const syncMyListWithBackend = async () => {
  if (!isLoggedIn()) return;
  const remote = await apiGetMyList();
  const local = getList();
  const keyOf = (i) => `${i.listType}:${i.id}`;
  const map = new Map();
  // remote first, then local overrides (keeps local addedAt order-ish)
  [...(remote || []), ...local].forEach((i) => { if (i && i.id) map.set(keyOf(i), normalize(i)); });
  const merged = [...map.values()].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  // push local-only items to backend
  const remoteKeys = new Set((remote || []).map(keyOf));
  local.forEach((i) => { if (!remoteKeys.has(keyOf(i))) apiAddMyList(normalize(i)); });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new Event('mylist-changed'));
};
