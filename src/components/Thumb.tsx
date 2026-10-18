import { useState } from 'react'
import { isStoragePhoto, safeUrl, type Place } from '../lib'
import { ActivityArt, FoodArt } from './PlaceArt'

/** Place photo (uploaded or linked), falling back to the original pastel illustration. */
export default function Thumb({ place, photoUrls, className = '' }: { place: Pick<Place, 'id' | 'kind' | 'image_url'>; photoUrls: Record<string, string>; className?: string }) {
  const [broken, setBroken] = useState(false)
  const src = isStoragePhoto(place.image_url) ? photoUrls[place.image_url.slice(8)] : safeUrl(place.image_url)
  const Art = place.kind === 'restaurant' ? FoodArt : ActivityArt
  return (
    <div className={`overflow-hidden rounded-xl bg-stone-100 ${className}`}>
      {src && !broken
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        : <Art id={place.id} className="h-full w-full" />}
    </div>
  )
}
