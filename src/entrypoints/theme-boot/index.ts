import { applyThemeMirror } from '@/utils/theme-mirror'

// Loaded by a classic `<script>` in each extension page's `<head>`, which
// blocks the first paint until the theme class is on `<html>`.
export default defineUnlistedScript(() => {
  applyThemeMirror()
})
