import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '../store'
import type { Article } from '../../shared/types'
import { Search, X } from 'lucide-react'

export default function SearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    setSearchResults,
    searchSuggestions,
    setSearchSuggestions,
    jumpToArticle
  } = useStore()
  const [isOpen, setIsOpen] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // 关闭下拉（点击外部）
  // 关键：必须用 click 而非 mousedown，否则 mousedown 会抢先卸载下拉
  //       导致按钮的 onClick 永不触发 → jumpToArticle 无法执行
  useEffect(() => {
    if (!showDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showDropdown])

  // 输入即搜索（300ms 防抖）
  const handleInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      const trimmed = value.trim()
      if (!trimmed) {
        setSearchSuggestions([])
        setShowDropdown(false)
        return
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const response = await window.api.searchArticles(trimmed, undefined, undefined, 8)
          if (response.payload.error === 0) {
            const articles = response.payload.articles || []
            setSearchSuggestions(articles)
            setShowDropdown(articles.length > 0)
          }
        } catch {
          // 忽略搜索错误，不打断用户输入
        }
      }, 300)
    },
    [setSearchQuery, setSearchSuggestions]
  )

  // 点击 suggestion 项：跳转到文章并清空搜索
  const handleSuggestionClick = useCallback(
    (article: Article) => {
      setShowDropdown(false)
      setSearchQuery('')
      setSearchSuggestions([])
      jumpToArticle(article)
    },
    [jumpToArticle, setSearchQuery, setSearchSuggestions]
  )

  // 回车搜索：执行全量搜索，展示到 ArticleList
  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim()
    setShowDropdown(false)
    if (!query) {
      setSearchResults([])
      return
    }

    try {
      const response = await window.api.searchArticles(query, undefined, undefined, 50)
      if (response.payload.error === 0) {
        setSearchResults(response.payload.articles || [])
      }
    } catch {
      // ignore
    }
  }, [searchQuery, setSearchResults])

  const handleClear = () => {
    setSearchQuery('')
    setSearchResults([])
    setSearchSuggestions([])
    setShowDropdown(false)
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
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded px-2 py-0.5">
        <Search size={14} className="text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (searchSuggestions.length > 0) setShowDropdown(true)
          }}
          placeholder="搜索文章标题..."
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

      {/* Suggestions 下拉 */}
      {showDropdown && searchSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 max-h-64 overflow-y-auto">
          {searchSuggestions.map((article) => (
            <button
              key={article.id}
              onClick={() => handleSuggestionClick(article)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 truncate"
              title={article.title}
            >
              {article.title || '(Untitled)'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}