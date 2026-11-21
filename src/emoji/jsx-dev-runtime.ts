import * as D from 'react/jsx-dev-runtime'
import { fix } from './jsx-runtime'
export const Fragment = D.Fragment
export type { JSX } from 'react/jsx-dev-runtime'
export function jsxDEV(type: React.ElementType, props: Record<string, unknown>, key: React.Key | undefined, isStatic: boolean, source?: unknown, self?: unknown) {
  return D.jsxDEV(type, fix(type, props) as never, key, isStatic, source as never, self)
}
