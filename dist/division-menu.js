import { divisionPage, divisionRequest, isSplitU10, isU10Division, sortedDivisions } from './division-data.js';

const menu = document.querySelector('[data-division-menu]');
const view = menu.dataset.divisionMenu;
const status = menu.querySelector('[role=status]');

function addLink(label, href, style) {
  const link = document.createElement('a');
  link.className = style;
  link.href = href;
  link.textContent = label;
  menu.append(link);
}

try {
  const league = view === 'rec' ? 'rec' : 'travel';
  const divisions = sortedDivisions(await divisionRequest(), league);
  const groupU10 = divisions.some(isSplitU10);
  const visible = view === 'u10' ? divisions.filter(isU10Division) : divisions;
  let addedU10 = false;
  for (const item of visible) {
    if (view === 'travel' && groupU10 && isU10Division(item)) {
      if (!addedU10) addLink('U10', '/classic-travel-u10.html', 'league-option league-travel');
      addedU10 = true;
    } else {
      addLink(item.name, divisionPage(item), 'league-option league-' + league);
    }
  }
  status.textContent = visible.length ? '' : 'No divisions have been added here yet.';
  status.hidden = visible.length > 0;
} catch (error) {
  status.textContent = error.message;
}
