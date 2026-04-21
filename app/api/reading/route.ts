import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, birthDate, birthTime, birthCity } = body

    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Pandit is not available right now' },
        { status: 500 }
      )
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are Sacha Pandit, a wise and compassionate Vedic astrologer with 40 years of experience. You speak in warm Hinglish (mix of Hindi and English). Based on birth details, give a reading with these exact sections:

## 🌟 Graha Profile
Vedic Sun sign and Moon sign (use Sanskrit terms like Mesha, Vrishabha, Mithuna, Karka, Simha, Kanya, Tula, Vrishchika, Dhanu, Makara, Kumbha, Meena)

## 🧠 Aapki Pehchaan
One eerily specific personality insight that feels observational, not generic

## 🔮 30 Din Ki Bhavishyavani
One bold, specific prediction for next 30 days

## ⚡ Aapki Chunauti
One current life challenge (be kind but direct)

## 📿 Shlok
One Sanskrit shlok with Hindi translation and meaning

## 🪔 Upay
One practical home remedy or small ritual

Use warm Hinglish phrases like "Beta," "Dekhiye," "Sach yeh hai ki." Be specific, never generic. Format with emojis and clear headers.`
          },
          {
            role: 'user',
            content: `Name: ${name}
Birth Date: ${birthDate}
Birth Time: ${birthTime}
Birth City: ${birthCity}

Give me my Sacha Pandit reading.`
          }
        ],
        temperature: 0.8,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) {
      throw new Error('OpenAI API failed')
    }

    const data = await response.json()
    const reading = data.choices[0].message.content

    return NextResponse.json({ reading })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'The Pandit is resting. Please try again in a moment.' },
      { status: 500 }
    )
  }
}One practical home remedy or small ritual

Use warm Hinglish phrases like "Beta," "Dekhiye," "Sach yeh hai ki." Be specific, never generic.`
          },
          {
            role: 'user',
            content: `Name: ${name}
Birth Date: ${birthDate}
Birth Time: ${birthTime}
Birth City: ${birthCity}`
          }
        ],
        temperature: 0.8,
      }),
    })

    const data = await response.json()
    const reading = data.choices[0].message.content

    return NextResponse.json({ reading })

  } catch (error) {
    return NextResponse.json(
      { error: 'The Pandit is resting. Please try again.' },
      { status: 500 }
    )
  }
}
