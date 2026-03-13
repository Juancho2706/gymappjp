export async function searchYouTube(query: string, keyword: 'technique' | 'short') {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " exercise tutorial " + keyword)}`
    const response = await fetch(searchUrl)
    const text = await response.text()
    
    // Extract first video ID using regex
    const match = text.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/)
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : null
  } catch (error) {
    console.error(`Error searching YouTube for ${query}:`, error)
    return null
  }
}
