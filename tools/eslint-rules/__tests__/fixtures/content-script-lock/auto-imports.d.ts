export {}
declare global {
  const autoSaveThing: typeof import('./helpers').saveThing
  const autoRoute: typeof import('./helpers').route
  const autoPure: typeof import('./helpers').pure
  const autoTypedSave: typeof import('./helpers').typedSave
  const AutoFcBanner: typeof import('./components').FcBanner
}
