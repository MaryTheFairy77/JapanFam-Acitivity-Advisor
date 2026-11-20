/** Shared map look: OpenFreeMap "Positron" recoloured washi-pastel (used by the full map and the small Home map). */
import type { StyleSpecification } from 'maplibre-gl'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/** Washi-pastel palette applied on top of OpenFreeMap's minimal "Positron" style. */
const PASTEL = {
  land: '#fbf3e6', water: '#bfdcf3', waterLine: '#a7cbea', park: '#dcecd2', wood: '#d3e7c8',
  building: '#f2e6d6', road: '#ffffff', major: '#f8dfe4', rail: '#e7d3c3', boundary: '#d9b8c4',
  label: '#6b5e57', halo: '#fffaf3', waterLabel: '#5b88b0',
}

export function pastelize(style: StyleSpecification): StyleSpecification {
  for (const l of style.layers) {
    const id = l.id.toLowerCase()
    const layer = l as { paint?: Record<string, unknown> }
    const p = (layer.paint ??= {})
    if (l.type === 'background') p['background-color'] = PASTEL.land
    else if (l.type === 'fill') {
      if (/water|ocean|lake|river/.test(id)) p['fill-color'] = PASTEL.water
      else if (/wood|forest/.test(id)) p['fill-color'] = PASTEL.wood
      else if (/park|grass|landcover|landuse|green|pitch|cemetery/.test(id)) p['fill-color'] = PASTEL.park
      else if (/building/.test(id)) p['fill-color'] = PASTEL.building
      else if (/land|earth/.test(id)) p['fill-color'] = PASTEL.land
    } else if (l.type === 'line') {
      if (/waterway|river|stream|canal/.test(id)) p['line-color'] = PASTEL.waterLine
      else if (/motorway|trunk|primary|major/.test(id)) p['line-color'] = PASTEL.major
      else if (/rail|transit/.test(id)) p['line-color'] = PASTEL.rail
      else if (/boundary|admin/.test(id)) p['line-color'] = PASTEL.boundary
      else if (/road|highway|street|minor|path|bridge|tunnel|transportation/.test(id)) p['line-color'] = PASTEL.road
    } else if (l.type === 'symbol') {
      p['text-color'] = /water|ocean|sea|lake|river/.test(id) ? PASTEL.waterLabel : PASTEL.label
      p['text-halo-color'] = PASTEL.halo
    }
  }
  return style
}

