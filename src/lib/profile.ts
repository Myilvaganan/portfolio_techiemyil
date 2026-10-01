import { useEffect, useState } from 'react'
import defaultPhoto from '@/assets/images/profile.jpg'
import { personal } from '@/data/personal'
import { EMPTY_DOCS, fetchDoc, saveDoc, type ProfileDoc } from './growthApi'

// The signed-in owner's profile, shared by every avatar and greeting. Loaded once; saving updates them all at once.

let current: ProfileDoc = EMPTY_DOCS.profile
let loaded: Promise<void> | null = null
const listeners = new Set<(p: ProfileDoc) => void>()
const emit = () => listeners.forEach((l) => l(current))

function load() {
  loaded ??= fetchDoc('profile')
    .then((p) => {
      current = p
      emit()
    })
    .catch(() => {
      loaded = null
    })
  return loaded
}

export async function saveProfile(next: ProfileDoc) {
  current = await saveDoc('profile', next)
  emit()
  return current
}

export function useProfile() {
  const [p, setP] = useState(current)
  useEffect(() => {
    listeners.add(setP)
    void load()
    return () => {
      listeners.delete(setP)
    }
  }, [])
  const name = p.displayName || p.fullName || personal.brand
  return { profile: p, name, firstName: name.split(' ')[0], photo: p.photo || defaultPhoto }
}

/** Centre-crop an image file to a square JPEG data URL, small enough to store. */
export function squarePhoto(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not an image the browser can read.'))
    }
    img.src = url
  })
}
