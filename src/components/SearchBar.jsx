import { Search, Loader, Music, Disc, User as UserIcon } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { saavnApi } from '../api/saavn';
import { youtubeApi } from '../api/youtube';

export default function SearchBar({ onSearch }) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const containerRef = useRef(null);
    const debounceRef = useRef(null);

    // Debounced fetch suggestions
    const fetchSuggestions = useCallback((q) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!q.trim() || q.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            const searchTerm = q.trim();
            const [saavnRes, ytRes] = await Promise.all([
                saavnApi.getSearchSuggestions(searchTerm).catch(() => []),
                youtubeApi.getSearchSuggestions(searchTerm).catch(() => [])
            ]);

            // Interleave results or just append (Saavn first, then YouTube)
            // Let's take up to 5 from Saavn and 5 from YouTube for a balanced mix
            const merged = [
                ...saavnRes.slice(0, 5),
                ...ytRes.slice(0, 5)
            ];

            // Remove exact duplicates by title
            const unique = [];
            const titles = new Set();
            for (const item of merged) {
                const lowerTitle = item.title?.toLowerCase();
                if (!titles.has(lowerTitle)) {
                    titles.add(lowerTitle);
                    unique.push(item);
                }
            }

            setSuggestions(unique);
            setShowSuggestions(unique.length > 0);
            setSelectedIdx(-1);
        }, 300);
    }, []);

    useEffect(() => {
        fetchSuggestions(query);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, fetchSuggestions]);

    // Close on outside click
    useEffect(() => {
        const handleOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const doSearch = async (q) => {
        const term = q || query;
        if (!term.trim()) return;
        setShowSuggestions(false);
        setLoading(true);
        await onSearch(term.trim());
        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            if (selectedIdx >= 0 && suggestions[selectedIdx]) {
                doSearch(suggestions[selectedIdx].title);
                setQuery(suggestions[selectedIdx].title);
            } else {
                doSearch();
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'song': return <Music size={14} />;
            case 'album': return <Disc size={14} />;
            case 'artist': return <UserIcon size={14} />;
            default: return <Search size={14} />;
        }
    };

    return (
        <div className="search-wrapper" ref={containerRef}>
            <div className="search-container">
                {loading ? (
                    <Loader className="search-icon spin-icon" size={18} />
                ) : (
                    <Search className="search-icon" size={18} />
                )}
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search for songs, artists, albums…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                />
            </div>

            {showSuggestions && (
                <div className="suggestions-dropdown glass-panel">
                    {suggestions.map((item, idx) => (
                        <div
                            key={`${item.id}-${idx}`}
                            className={`suggestion-item ${idx === selectedIdx ? 'suggestion-active' : ''}`}
                            onMouseEnter={() => setSelectedIdx(idx)}
                            onMouseDown={() => {
                                setQuery(item.title);
                                doSearch(item.title);
                            }}
                        >
                            {item.image ? (
                                <img src={item.image} alt="" className="suggestion-img" />
                            ) : (
                                <div className="suggestion-img suggestion-img-placeholder">
                                    {getTypeIcon(item.type)}
                                </div>
                            )}
                            <div className="suggestion-text">
                                <span className="suggestion-title">{item.title}</span>
                                {item.description && (
                                    <span className="suggestion-desc">{item.description}</span>
                                )}
                            </div>
                            <span className={`suggestion-type suggestion-type--${item.type}`}>
                                {item.type}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
