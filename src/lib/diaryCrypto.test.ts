import { describe, expect, it } from 'vitest'
import { CHECK_VALUE, deriveKey, newSalt, open, seal, verify } from './diaryCrypto'

describe('diary encryption', () => {
  it('round-trips with the right secret and refuses the wrong one', async () => {
    const salt = newSalt()
    const key = await deriveKey('0-4-8-5', salt)
    const box = await seal(key, { body: 'a private thought' })
    expect(box.ct).not.toContain('private')
    expect(await open(key, box)).toEqual({ body: 'a private thought' })
    const check = await seal(key, CHECK_VALUE)
    expect(await verify(key, check)).toBe(true)
    expect(await verify(await deriveKey('0-4-8-6', salt), check)).toBe(false)
  })
})
