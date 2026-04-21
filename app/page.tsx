'use client'

import { useState } from 'react'

export default function Home() {
  const [formData, setFormData] = useState({
    name: '',
    birthDate: '',
    birthTime: '',
    birthCity: ''
  })
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setReading(data.reading)
    } catch (err) {
      setError('The Pandit is resting. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const shareText = encodeURIComponent(
    `🔮 Maine Sacha Pandit se apni reading li. Itni accurate thi ke dil dhadak gaya. Tum bhi try karo — free hai: https://sachapandit.com`
  )

  if (reading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0e27', color: 'white', padding: '20px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h1 style={{ color: '#ff9933', textAlign: 'center' }}>Sacha Pandit</h1>
          <div style={{ 
            background: 'rgba(255,153,51,0.1)', 
            border: '1px solid #ff9933',
            borderRadius: 16,
            padding: 24,
            marginTop: 20,
            whiteSpace: 'pre-line',
            lineHeight: 1.8
          }}>
            {reading}
          </div>
          
          <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'center' }}>
            <a 
              href={`https://wa.me/?text=${shareText}`}
              target="_blank"
              style={{
                background: '#25D366',
                color: 'white',
                padding: '12px 24px',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 'bold'
              }}
            >
              Share on WhatsApp
            </a>
          </div>

          <div style={{ 
            marginTop: 40,
            padding: 24,
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(255,153,51,0.2), rgba(255,215,0,0.1))',
            border: '2px solid #ff9933',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
            <h3 style={{ color: '#ff9933', margin: '0 0 8px' }}>Apni Poori Kundali</h3>
            <p style={{ color: '#aaa', margin: '0 0 16px' }}>Saar Bhavishyavani + Saal Bhar Ka Plan</p>
            <a
              href="https://NOWPAYMENTS_LINK_PLACEHOLDER"
              style={{
                background: '#ff9933',
                color: '#0a0e27',
                padding: '14px 32px',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 'bold',
                display: 'inline-block'
              }}
            >
              Unlock Karein — $5
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e27', color: 'white', padding: '20px' }}>
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ color: '#ff9933', fontSize: '2.5rem', marginBottom: 8 }}>Sacha Pandit</h1>
        <p style={{ color: '#aaa', marginBottom: 40 }}>The True Pandit — AI Vedic Astrology</p>

        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#ff9933', marginBottom: 6 }}>Full Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #333', background: '#111', color: 'white' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#ff9933', marginBottom: 6 }}>Birth Date</label>
            <input
              type="date"
              required
              value={formData.birthDate}
              onChange={e => setFormData({...formData, birthDate: e.target.value})}
              style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #333', background: '#111', color: 'white' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#ff9933', marginBottom: 6 }}>Birth Time</label>
            <input
              type="time"
              required
              value={formData.birthTime}
              onChange={e => setFormData({...formData, birthTime: e.target.value})}
              style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #333', background: '#111', color: 'white' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#ff9933', marginBottom: 6 }}>Birth City</label>
            <input
              type="text"
              required
              value={formData.birthCity}
              onChange={e => setFormData({...formData, birthCity: e.target.value})}
              style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #333', background: '#111', color: 'white' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 16,
              background: '#ff9933',
              color: '#0a0e27',
              border: 'none',
              borderRadius: 8,
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: loading ? 'wait' : 'pointer'
            }}
          >
            {loading ? 'The Pandit is consulting the stars...' : 'Get My Reading'}
          </button>

          {error && <p style={{ color: '#ff5555', marginTop: 16, textAlign: 'center' }}>{error}</p>}
        </form>
      </div>
    </div>
  )
}
