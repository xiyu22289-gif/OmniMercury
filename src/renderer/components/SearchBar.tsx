import { useState, useCallback, useRef } from 'react'
import { useStore } from '../store'
import { Search, X } from 'lucide-react'

export default function SearchBar() {
  const { searchQuery, setSearchQuery, setSearchResults, setLoading, setError } = useStore()
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      return
    }

    setLoading(true)
    try {
      const response = await window.api.searchArticles(query)
      if (response.payload.error === 0) {
        setSearchResults(response.payload.articles || [])
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [searchQuery, setSearchResults, setLoading, setError])

  const handleClear = () => {
    setSearchQuery('')
    setSearchResults([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
    if (e.key === 'Escape') {
      setIsOpen(false)
      handleClear()
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 100)
        }}
        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="Search articles"
      >
        <Search size={16} />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded px-2 py-0.5">
      <Search size={14} className="text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search articles..."
        className="w-40 text-sm bg-transparent border-none outline-none placeholder-gray-400"
      />
      {searchQuery && (
        <button
          onClick={handleClear}
          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}