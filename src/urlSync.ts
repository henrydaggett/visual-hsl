import { SPACES, type SpaceId } from './lib/spaces';
import { useStore } from './store';

const PARAM = 'space';

/**
 * Keeps the colour space in the address bar (`?space=hsluv`), so a link opens in the same
 * space. A space named in the URL wins over the one remembered from the last visit.
 */
export function syncSpaceWithUrl() {
  const wanted = new URLSearchParams(window.location.search).get(PARAM)?.toLowerCase();
  if (SPACES.some((sp) => sp.id === wanted)) useStore.getState().setSpace(wanted as SpaceId);

  const write = (space: SpaceId) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(PARAM) === space) return;
    url.searchParams.set(PARAM, space);
    // Replace, not push: switching space should not fill the back button's history.
    window.history.replaceState(window.history.state, '', url);
  };
  write(useStore.getState().space);
  useStore.subscribe((state, previous) => {
    if (state.space !== previous.space) write(state.space);
  });
}
