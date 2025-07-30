export const isDev = import.meta.env.MODE === 'development'
export const isTest = import.meta.env.MODE === 'test'
export const isDevOrTest = isDev || isTest
