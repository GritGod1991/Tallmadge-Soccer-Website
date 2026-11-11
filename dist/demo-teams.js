export const storageKey = 'tallmadge-demo-teams';
const sampleTeams = [
  { id: 'travel-u10', name: 'Tallmadge U10', division: 'U10' },
  { id: 'travel-u12', name: 'Tallmadge U12', division: 'U12' },
  { id: 'rec-u7-blue', name: 'Blue Team', division: 'Blue Frogs (U7)' },
  { id: 'rec-u7-gold', name: 'Gold Team', division: 'Blue Frogs (U7)' },
];

export function readTeams() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) return saved;
  } catch {
    // Use sample teams if there is no readable demo data.
  }
  return sampleTeams;
}

