import '@/assets/tailwind.css'
import { router } from '@/entrypoints/app/router'
import { RouterProvider } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
