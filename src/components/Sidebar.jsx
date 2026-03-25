import { Home, LayoutGrid, Radio, Library, Search } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'new', label: 'New', icon: LayoutGrid },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'search', label: 'Search', icon: Search },
];

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="bottom-nav">
      <div className="nav-menu">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item${activeTab === id ? ' active' : ''}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
          >
            <Icon size={22} className="icon" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
